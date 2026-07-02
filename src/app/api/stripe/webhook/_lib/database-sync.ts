import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import { getDatabase } from "@/db/client";
import {
  accessEntitlements,
  customers,
  invoices,
  productOffers,
  products,
  purchases,
  purchaseSideEffects,
  stripeEvents,
} from "@/db/schema";
import {
  findPaymentRecordByIntentId,
  type PaymentSheetRecord,
} from "@/lib/google-sheets";

import type { StripeWebhookSyncResult } from "./side-effects/types";

type StripeSettlementSnapshot = {
  settlementAmountMinor: number | null;
  settlementCurrency: string | null;
  stripeBalanceTransactionId: string | null;
  stripeExchangeRate: string | null;
};

const trim = (value: string | null | undefined) => value?.trim() ?? "";
const nullIfEmpty = (value: string | null | undefined) => trim(value) || null;
const normalizeEmail = (value: string | null | undefined) => trim(value).toLowerCase();

const parseInteger = (value: string | null | undefined, fallback = 0) => {
  const parsedValue = Number.parseInt(trim(value), 10);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const parseDate = (value: string | null | undefined) => {
  const timestamp = Date.parse(trim(value));

  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
};

const parseRequiredDate = (
  value: string | null | undefined,
  fallback: Date = new Date(),
) => parseDate(value) ?? fallback;

const normalizeOutcome = (
  value: string,
): "succeeded" | "processing" | "requires_action" | "failed" | "canceled" => {
  const normalizedValue = trim(value);

  if (
    normalizedValue === "succeeded" ||
    normalizedValue === "processing" ||
    normalizedValue === "requires_action" ||
    normalizedValue === "failed" ||
    normalizedValue === "canceled"
  ) {
    return normalizedValue;
  }

  return "requires_action";
};

const normalizeCheckoutLocale = (value: string): "ru" | "en" | "pl" | null => {
  const normalizedValue = trim(value).toLowerCase();

  if (normalizedValue === "ru" || normalizedValue === "en" || normalizedValue === "pl") {
    return normalizedValue;
  }

  return null;
};

const normalizeLessonLanguage = (value: string): "ru" | "en" | null => {
  const normalizedValue = trim(value).toLowerCase();

  if (normalizedValue === "ru" || normalizedValue === "en") {
    return normalizedValue;
  }

  return null;
};

const normalizeAccessStatus = (
  value: string,
  paymentRecord: PaymentSheetRecord,
):
  | "pending"
  | "not_required"
  | "token_issued"
  | "activated"
  | "expired"
  | "revoked"
  | "left_channel"
  | "link_failed"
  | "manual_pending"
  | "manual_done" => {
  const normalizedValue = trim(value);

  if (
    normalizedValue === "pending" ||
    normalizedValue === "not_required" ||
    normalizedValue === "token_issued" ||
    normalizedValue === "activated" ||
    normalizedValue === "expired" ||
    normalizedValue === "revoked" ||
    normalizedValue === "left_channel" ||
    normalizedValue === "link_failed" ||
    normalizedValue === "manual_pending" ||
    normalizedValue === "manual_done"
  ) {
    return normalizedValue;
  }

  if (paymentRecord.delivery_channel.trim() === "manual") {
    return "manual_pending";
  }

  if (!paymentRecord.delivery_channel.trim() && !paymentRecord.access_workflow.trim()) {
    return "not_required";
  }

  return "pending";
};

const normalizeSideEffectStatus = (
  value: string,
): "pending" | "sending" | "sent" | "skipped" | "failed" | null => {
  const normalizedValue = trim(value);

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.startsWith("sending:")) {
    return "sending";
  }

  if (
    normalizedValue === "pending" ||
    normalizedValue === "sent" ||
    normalizedValue === "skipped" ||
    normalizedValue === "failed"
  ) {
    return normalizedValue;
  }

  return "pending";
};

const getSaleTimestamp = (paymentRecord: PaymentSheetRecord) =>
  parseDate(paymentRecord.successful_customer_logged_at) ??
  (paymentRecord.outcome.trim() === "succeeded"
    ? (parseDate(paymentRecord.updated_at) ?? parseDate(paymentRecord.first_seen_at))
    : null);

const getPurchaseSource = (paymentIntentId: string) =>
  paymentIntentId.startsWith("adm_offer_pi_") ? "admin_offer_link" : "stripe";

const getExternalTargetType = (paymentRecord: PaymentSheetRecord) => {
  const workflow = paymentRecord.access_workflow.trim();
  const deliveryChannel = paymentRecord.delivery_channel.trim();

  if (deliveryChannel === "manual" || workflow === "manual-admin") {
    return "manual" as const;
  }

  if (workflow === "telegram-bot") {
    return "telegram_bot" as const;
  }

  if (deliveryChannel === "telegram" || workflow.startsWith("telegram")) {
    return "telegram_chat" as const;
  }

  return null;
};

const parseInvoiceNumber = (invoiceNumber: string) => {
  const match = /^FV\/(\d{4})\/(\d{2})\/(\d+)$/u.exec(invoiceNumber.trim());

  if (!match) {
    return null;
  }

  return {
    sequenceMonth: Number.parseInt(match[2], 10),
    sequenceNumber: Number.parseInt(match[3], 10),
    sequenceYear: Number.parseInt(match[1], 10),
  };
};

const getStripeCustomerId = (event: Stripe.Event) => {
  if (event.type.startsWith("payment_intent.")) {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    if (typeof paymentIntent.customer === "string") {
      return paymentIntent.customer;
    }

    return paymentIntent.customer?.id ?? null;
  }

  if (event.type === "checkout.session.completed") {
    const checkoutSession = event.data.object as Stripe.Checkout.Session;

    if (typeof checkoutSession.customer === "string") {
      return checkoutSession.customer;
    }

    return checkoutSession.customer?.id ?? null;
  }

  return null;
};

const getBalanceTransactionSnapshot = (
  balanceTransaction: Stripe.BalanceTransaction | string | null | undefined,
): StripeSettlementSnapshot => {
  if (!balanceTransaction || typeof balanceTransaction === "string") {
    return {
      settlementAmountMinor: null,
      settlementCurrency: null,
      stripeBalanceTransactionId:
        typeof balanceTransaction === "string" ? balanceTransaction : null,
      stripeExchangeRate: null,
    };
  }

  return {
    settlementAmountMinor: balanceTransaction.amount,
    settlementCurrency: balanceTransaction.currency,
    stripeBalanceTransactionId: balanceTransaction.id,
    stripeExchangeRate:
      balanceTransaction.exchange_rate === null ||
      balanceTransaction.exchange_rate === undefined
        ? null
        : String(balanceTransaction.exchange_rate),
  };
};

const getBalanceTransactionId = (
  balanceTransaction: Stripe.BalanceTransaction | string | null | undefined,
) => {
  if (!balanceTransaction) {
    return null;
  }

  return typeof balanceTransaction === "string"
    ? balanceTransaction
    : balanceTransaction.id;
};

const getPaymentIntentIdFromCharge = (charge: Stripe.Charge) => {
  const paymentIntent = charge.payment_intent;

  if (!paymentIntent) {
    return "";
  }

  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
};

const getStripeSettlementSnapshotFromCharge = async ({
  charge,
  stripe,
}: {
  charge: Stripe.Charge;
  stripe: Stripe;
}): Promise<StripeSettlementSnapshot> => {
  const balanceTransaction = charge.balance_transaction;

  if (!balanceTransaction) {
    return {
      settlementAmountMinor: null,
      settlementCurrency: null,
      stripeBalanceTransactionId: null,
      stripeExchangeRate: null,
    };
  }

  if (typeof balanceTransaction !== "string") {
    return getBalanceTransactionSnapshot(balanceTransaction);
  }

  try {
    return getBalanceTransactionSnapshot(
      await stripe.balanceTransactions.retrieve(balanceTransaction),
    );
  } catch (error) {
    console.error("Failed to retrieve Stripe balance transaction for charge", {
      balanceTransactionId: balanceTransaction,
      chargeId: charge.id,
      error,
    });

    return {
      settlementAmountMinor: null,
      settlementCurrency: null,
      stripeBalanceTransactionId: balanceTransaction,
      stripeExchangeRate: null,
    };
  }
};

const getStripeSettlementSnapshot = async ({
  paymentIntentId,
  stripe,
}: {
  paymentIntentId: string;
  stripe: Stripe;
}): Promise<StripeSettlementSnapshot> => {
  const emptySnapshot: StripeSettlementSnapshot = {
    settlementAmountMinor: null,
    settlementCurrency: null,
    stripeBalanceTransactionId: null,
    stripeExchangeRate: null,
  };

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const latestCharge = paymentIntent.latest_charge;

    if (!latestCharge || typeof latestCharge === "string") {
      return emptySnapshot;
    }

    return getBalanceTransactionSnapshot(latestCharge.balance_transaction);
  } catch (error) {
    console.error("Failed to load Stripe settlement amount for purchase", {
      error,
      paymentIntentId,
    });

    return emptySnapshot;
  }
};

const getPaymentSideEffects = (paymentRecord: PaymentSheetRecord) => {
  const fallbackUpdatedAt = parseRequiredDate(
    paymentRecord.updated_at || paymentRecord.first_seen_at,
  );
  const emailStatus = normalizeSideEffectStatus(paymentRecord.email_delivery_status);
  const alertStatus = normalizeSideEffectStatus(paymentRecord.with_mentor_alert_status);
  const successfulCustomerStatus =
    normalizeSideEffectStatus(paymentRecord.successful_customer_log_status) ??
    (paymentRecord.successful_customer_logged_at.trim() ? "sent" : null);

  return [
    emailStatus
      ? {
          kind: "purchase_success_email" as const,
          provider: "resend" as const,
          status: emailStatus,
          updatedAt:
            parseDate(paymentRecord.email_delivery_updated_at) ?? fallbackUpdatedAt,
        }
      : null,
    alertStatus
      ? {
          kind: "admin_telegram_alert" as const,
          provider: "telegram" as const,
          status: alertStatus,
          updatedAt:
            parseDate(paymentRecord.with_mentor_alert_updated_at) ?? fallbackUpdatedAt,
        }
      : null,
    successfulCustomerStatus
      ? {
          kind: "successful_customer_export" as const,
          provider: null,
          status: successfulCustomerStatus,
          updatedAt:
            parseDate(paymentRecord.successful_customer_logged_at) ?? fallbackUpdatedAt,
        }
      : null,
  ].filter((sideEffect) => sideEffect !== null);
};

const getFreshPaymentRecord = async (handledEvent: StripeWebhookSyncResult) => {
  if (handledEvent.skipped) {
    return handledEvent.paymentRecord;
  }

  try {
    return (
      (await findPaymentRecordByIntentId(handledEvent.paymentRecord.payment_intent_id, {
        cacheTtlMs: 0,
        source: "sheets",
      })) ?? handledEvent.paymentRecord
    );
  } catch (error) {
    console.warn("Failed to refresh payment record before database sync", {
      error,
      eventId: handledEvent.eventId,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });

    return handledEvent.paymentRecord;
  }
};

export const syncStripeWebhookEventToDatabase = async ({
  event,
  handledEvent,
  stripe,
}: {
  event: Stripe.Event;
  handledEvent: StripeWebhookSyncResult;
  stripe: Stripe;
}) => {
  const db = getDatabase();
  const now = new Date();
  const paymentRecord = await getFreshPaymentRecord(handledEvent);
  const paymentIntentId = paymentRecord.payment_intent_id.trim();

  if (!paymentIntentId) {
    throw new Error(`Stripe event ${event.id} has no payment_intent_id.`);
  }

  await db.transaction(async (tx) => {
    let purchaseId: string | null = null;

    if (!handledEvent.skipped) {
      const settlementSnapshot =
        paymentRecord.outcome.trim() === "succeeded"
          ? await getStripeSettlementSnapshot({
              paymentIntentId,
              stripe,
            })
          : {
              settlementAmountMinor: null,
              settlementCurrency: null,
              stripeBalanceTransactionId: null,
              stripeExchangeRate: null,
            };
      const normalizedEmail = normalizeEmail(paymentRecord.customer_email);
      const stripeCustomerId = getStripeCustomerId(event);
      let customerId: string | null = null;

      if (stripeCustomerId) {
        const [existingCustomer] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.stripeCustomerId, stripeCustomerId))
          .limit(1);

        customerId = existingCustomer?.id ?? null;
      }

      if (!customerId && normalizedEmail) {
        const [existingCustomer] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.normalizedEmail, normalizedEmail))
          .limit(1);

        customerId = existingCustomer?.id ?? null;
      }

      if (customerId) {
        await tx
          .update(customers)
          .set({
            addressLine: nullIfEmpty(paymentRecord.customer_address),
            city: nullIfEmpty(paymentRecord.customer_city),
            country: nullIfEmpty(paymentRecord.customer_country),
            email: normalizedEmail || nullIfEmpty(paymentRecord.customer_email),
            fullName: nullIfEmpty(paymentRecord.customer_full_name),
            normalizedEmail: normalizedEmail || null,
            postalCode: nullIfEmpty(paymentRecord.customer_postal_code),
            stripeCustomerId,
            telegramUsername: nullIfEmpty(paymentRecord.customer_nickname),
            updatedAt: now,
          })
          .where(eq(customers.id, customerId));
      } else if (normalizedEmail || stripeCustomerId) {
        const [savedCustomer] = await tx
          .insert(customers)
          .values({
            addressLine: nullIfEmpty(paymentRecord.customer_address),
            city: nullIfEmpty(paymentRecord.customer_city),
            country: nullIfEmpty(paymentRecord.customer_country),
            email: normalizedEmail || nullIfEmpty(paymentRecord.customer_email),
            fullName: nullIfEmpty(paymentRecord.customer_full_name),
            normalizedEmail: normalizedEmail || null,
            postalCode: nullIfEmpty(paymentRecord.customer_postal_code),
            stripeCustomerId,
            telegramUsername: nullIfEmpty(paymentRecord.customer_nickname),
            updatedAt: now,
          })
          .returning({ id: customers.id });

        customerId = savedCustomer.id;
      }

      const offerExternalId = paymentRecord.offer_id.trim();
      const productExternalId = paymentRecord.product_id.trim();
      const [offer] = offerExternalId
        ? await tx
            .select({
              id: productOffers.id,
              productId: productOffers.productId,
            })
            .from(productOffers)
            .where(eq(productOffers.externalOfferId, offerExternalId))
            .limit(1)
        : [];
      const [product] = productExternalId
        ? await tx
            .select({ id: products.id })
            .from(products)
            .where(eq(products.externalProductId, productExternalId))
            .limit(1)
        : [];
      const productId = product?.id ?? offer?.productId ?? null;
      const firstSeenAt = parseRequiredDate(
        paymentRecord.first_seen_at || paymentRecord.updated_at,
      );
      const purchaseValues = {
        amountMinor: parseInteger(paymentRecord.amount),
        checkoutCurrency: nullIfEmpty(paymentRecord.checkout_currency),
        checkoutLocale: normalizeCheckoutLocale(paymentRecord.checkout_locale),
        checkoutSessionId: nullIfEmpty(paymentRecord.checkout_session_id),
        currency:
          trim(paymentRecord.currency) || trim(paymentRecord.checkout_currency) || "pln",
        customerAddressLineSnapshot: nullIfEmpty(paymentRecord.customer_address),
        customerCitySnapshot: nullIfEmpty(paymentRecord.customer_city),
        customerCountrySnapshot: nullIfEmpty(paymentRecord.customer_country),
        customerEmailSnapshot:
          normalizedEmail || nullIfEmpty(paymentRecord.customer_email),
        customerFullNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
        customerId,
        customerPostalCodeSnapshot: nullIfEmpty(paymentRecord.customer_postal_code),
        customerTelegramUsernameSnapshot: nullIfEmpty(paymentRecord.customer_nickname),
        lastPaymentErrorCode: nullIfEmpty(paymentRecord.last_payment_error_code),
        lastPaymentErrorMessage: nullIfEmpty(paymentRecord.last_payment_error_message),
        latestEventId: nullIfEmpty(paymentRecord.latest_event_id),
        latestEventType: nullIfEmpty(paymentRecord.latest_event_type),
        lessonLanguage: normalizeLessonLanguage(paymentRecord.lesson_language),
        offerExternalId: nullIfEmpty(paymentRecord.offer_id),
        offerId: offer?.id ?? null,
        offerLabelSnapshot: nullIfEmpty(paymentRecord.offer_label),
        outcome: normalizeOutcome(paymentRecord.outcome),
        productExternalId: nullIfEmpty(paymentRecord.product_id),
        productId,
        productTitleSnapshot: nullIfEmpty(paymentRecord.product_title),
        purchaseItemSnapshot: nullIfEmpty(paymentRecord.purchase_item),
        settlementAmountMinor: settlementSnapshot.settlementAmountMinor,
        settlementCurrency: settlementSnapshot.settlementCurrency,
        source: getPurchaseSource(paymentIntentId),
        stripeBalanceTransactionId: settlementSnapshot.stripeBalanceTransactionId,
        stripeExchangeRate: settlementSnapshot.stripeExchangeRate,
        stripeStatus: trim(paymentRecord.status) || "unknown",
        succeededAt: getSaleTimestamp(paymentRecord),
        updatedAt: parseRequiredDate(paymentRecord.updated_at, firstSeenAt),
      };
      const [savedPurchase] = await tx
        .insert(purchases)
        .values({
          ...purchaseValues,
          firstSeenAt,
          livemode: event.livemode,
          paymentIntentId,
        })
        .onConflictDoUpdate({
          set: purchaseValues,
          target: purchases.paymentIntentId,
        })
        .returning({ id: purchases.id });

      purchaseId = savedPurchase.id;

      await tx
        .insert(accessEntitlements)
        .values({
          accessWorkflow: nullIfEmpty(paymentRecord.access_workflow),
          currentTokenId: nullIfEmpty(paymentRecord.telegram_token_id),
          customerId,
          deliveryChannel: nullIfEmpty(paymentRecord.delivery_channel),
          expiresAt: parseDate(paymentRecord.telegram_access_expires_at),
          externalTargetType: getExternalTargetType(paymentRecord),
          offerId: offer?.id ?? null,
          productId,
          purchaseId,
          revokedAt: parseDate(paymentRecord.telegram_access_revoked_at),
          startsAt: parseDate(paymentRecord.telegram_token_used_at),
          status: normalizeAccessStatus(
            paymentRecord.telegram_access_status,
            paymentRecord,
          ),
          telegramChatId: nullIfEmpty(paymentRecord.telegram_channel_chat_id),
          telegramUserId: nullIfEmpty(paymentRecord.telegram_user_id),
          telegramUsername: nullIfEmpty(paymentRecord.telegram_username),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          set: {
            accessWorkflow: nullIfEmpty(paymentRecord.access_workflow),
            currentTokenId: nullIfEmpty(paymentRecord.telegram_token_id),
            customerId,
            deliveryChannel: nullIfEmpty(paymentRecord.delivery_channel),
            expiresAt: parseDate(paymentRecord.telegram_access_expires_at),
            externalTargetType: getExternalTargetType(paymentRecord),
            offerId: offer?.id ?? null,
            productId,
            revokedAt: parseDate(paymentRecord.telegram_access_revoked_at),
            startsAt: parseDate(paymentRecord.telegram_token_used_at),
            status: normalizeAccessStatus(
              paymentRecord.telegram_access_status,
              paymentRecord,
            ),
            telegramChatId: nullIfEmpty(paymentRecord.telegram_channel_chat_id),
            telegramUserId: nullIfEmpty(paymentRecord.telegram_user_id),
            telegramUsername: nullIfEmpty(paymentRecord.telegram_username),
            updatedAt: now,
          },
          target: accessEntitlements.purchaseId,
        });

      const parsedInvoice = parseInvoiceNumber(paymentRecord.invoice_number);

      if (parsedInvoice) {
        const issuedAt = parseRequiredDate(paymentRecord.invoice_issued_at, firstSeenAt);

        await tx
          .insert(invoices)
          .values({
            amountMinor: parseInteger(paymentRecord.amount),
            buyerAddressSnapshot: [
              paymentRecord.customer_address.trim(),
              paymentRecord.customer_city.trim(),
              paymentRecord.customer_postal_code.trim(),
              paymentRecord.customer_country.trim(),
            ]
              .filter(Boolean)
              .join(", "),
            buyerEmailSnapshot:
              normalizedEmail || nullIfEmpty(paymentRecord.customer_email),
            buyerNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
            currency:
              trim(paymentRecord.checkout_currency) ||
              trim(paymentRecord.currency) ||
              "pln",
            invoiceNumber: paymentRecord.invoice_number.trim(),
            issuedAt,
            purchaseId,
            sequenceMonth: parsedInvoice.sequenceMonth,
            sequenceNumber: parsedInvoice.sequenceNumber,
            sequenceYear: parsedInvoice.sequenceYear,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            set: {
              amountMinor: parseInteger(paymentRecord.amount),
              buyerEmailSnapshot:
                normalizedEmail || nullIfEmpty(paymentRecord.customer_email),
              buyerNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
              currency:
                trim(paymentRecord.checkout_currency) ||
                trim(paymentRecord.currency) ||
                "pln",
              issuedAt,
              sequenceMonth: parsedInvoice.sequenceMonth,
              sequenceNumber: parsedInvoice.sequenceNumber,
              sequenceYear: parsedInvoice.sequenceYear,
              updatedAt: now,
            },
            target: invoices.purchaseId,
          });
      }

      for (const sideEffect of getPaymentSideEffects(paymentRecord)) {
        await tx
          .insert(purchaseSideEffects)
          .values({
            failedAt: sideEffect.status === "failed" ? sideEffect.updatedAt : null,
            kind: sideEffect.kind,
            provider: sideEffect.provider,
            purchaseId,
            sentAt: sideEffect.status === "sent" ? sideEffect.updatedAt : null,
            status: sideEffect.status,
            updatedAt: sideEffect.updatedAt,
          })
          .onConflictDoUpdate({
            set: {
              failedAt: sideEffect.status === "failed" ? sideEffect.updatedAt : null,
              provider: sideEffect.provider,
              sentAt: sideEffect.status === "sent" ? sideEffect.updatedAt : null,
              status: sideEffect.status,
              updatedAt: sideEffect.updatedAt,
            },
            target: [purchaseSideEffects.purchaseId, purchaseSideEffects.kind],
          });
      }
    }

    await tx
      .insert(stripeEvents)
      .values({
        apiVersion: event.api_version ?? null,
        eventType: event.type,
        livemode: event.livemode,
        outcomeSnapshot: nullIfEmpty(paymentRecord.outcome),
        paymentIntentId,
        paymentStatusSnapshot: nullIfEmpty(paymentRecord.status),
        payload: event as unknown as Record<string, unknown>,
        processedAt: now,
        processingStatus: handledEvent.skipped ? "skipped" : "processed",
        purchaseId,
        stripeCreatedAt: new Date(event.created * 1000),
        stripeEventId: event.id,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        set: {
          apiVersion: event.api_version ?? null,
          eventType: event.type,
          livemode: event.livemode,
          outcomeSnapshot: nullIfEmpty(paymentRecord.outcome),
          paymentIntentId,
          paymentStatusSnapshot: nullIfEmpty(paymentRecord.status),
          payload: event as unknown as Record<string, unknown>,
          processedAt: now,
          processingStatus: handledEvent.skipped ? "skipped" : "processed",
          purchaseId,
          stripeCreatedAt: new Date(event.created * 1000),
          updatedAt: now,
        },
        target: stripeEvents.stripeEventId,
      });
  });
};

export const syncStripeChargeSettlementToDatabase = async ({
  event,
  stripe,
}: {
  event: Stripe.Event;
  stripe: Stripe;
}) => {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId = getPaymentIntentIdFromCharge(charge);

  if (!paymentIntentId) {
    return {
      paymentIntentId: "",
      status: "skipped" as const,
      stripeBalanceTransactionId: getBalanceTransactionId(charge.balance_transaction),
    };
  }

  const settlementSnapshot = await getStripeSettlementSnapshotFromCharge({
    charge,
    stripe,
  });

  if (
    settlementSnapshot.settlementAmountMinor === null ||
    !settlementSnapshot.settlementCurrency
  ) {
    return {
      paymentIntentId,
      status: "pending_balance_transaction" as const,
      stripeBalanceTransactionId: settlementSnapshot.stripeBalanceTransactionId,
    };
  }

  const db = getDatabase();
  const [updatedPurchase] = await db
    .update(purchases)
    .set({
      settlementAmountMinor: settlementSnapshot.settlementAmountMinor,
      settlementCurrency: settlementSnapshot.settlementCurrency,
      stripeBalanceTransactionId: settlementSnapshot.stripeBalanceTransactionId,
      stripeExchangeRate: settlementSnapshot.stripeExchangeRate,
      updatedAt: new Date(),
    })
    .where(eq(purchases.paymentIntentId, paymentIntentId))
    .returning({ id: purchases.id });

  return {
    paymentIntentId,
    status: updatedPurchase ? ("updated" as const) : ("purchase_not_found" as const),
    stripeBalanceTransactionId: settlementSnapshot.stripeBalanceTransactionId,
  };
};
