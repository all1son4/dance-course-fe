import { eq } from "drizzle-orm";

import { keepClassifiedAccessPeriod } from "@/db/classified-access";
import { getDatabase } from "@/db/client";
import {
  getPaymentOutcomeTransitionCondition,
  type PaymentOutcome,
} from "@/db/payment-outcome-policy";
import { findPaymentRecordByIntentIdFromDatabase } from "@/db/payment-records";
import {
  accessEntitlements,
  customers,
  invoices,
  productOffers,
  products,
  purchases,
  purchaseSideEffects,
} from "@/db/schema";
import type { PaymentRecordSnapshot } from "@/lib/payment-record";

/*
 * The retired flat-record payment writer, kept only as a test fixture. Production
 * persists payments through createStripePaymentProjectionCommand and
 * projectPaymentStateInTransaction; these tests seed rows (rights, side effects) from a
 * PaymentRecordSnapshot and check the database guards against such replays. The
 * bodies are unchanged from src/db/payment-records.ts.
 */

const trim = (value: string | null | undefined) => value?.trim() ?? "";

type PaymentSideEffectStatus = "pending" | "sending" | "sent" | "skipped" | "failed";

const LEASED_PAYMENT_SIDE_EFFECT_STATUSES = new Set<PaymentSideEffectStatus>([
  "pending",
  "sending",
]);

const nullIfEmpty = (value: string | null | undefined) => trim(value) || null;
const normalizeEmail = (value: string | null | undefined) => trim(value).toLowerCase();

const PAYMENT_SIDE_EFFECT_LEASE_TTL_MS = 2 * 60 * 1000;

// Sheets encode lease ownership as "<status>:<token>"; Neon stores both parts.
const parsePaymentSideEffectStatus = ({
  status,
  updatedAt,
}: {
  status: string | null | undefined;
  updatedAt: Date;
}): {
  leaseExpiresAt: Date | null;
  leaseToken: string | null;
  status: PaymentSideEffectStatus;
} | null => {
  const normalizedStatus = trim(status);

  if (!normalizedStatus) {
    return null;
  }

  const separatorIndex = normalizedStatus.indexOf(":");
  const statusPrefix = (
    separatorIndex === -1 ? normalizedStatus : normalizedStatus.slice(0, separatorIndex)
  ) as PaymentSideEffectStatus;
  const leaseToken =
    separatorIndex === -1 ? "" : normalizedStatus.slice(separatorIndex + 1).trim();

  if (LEASED_PAYMENT_SIDE_EFFECT_STATUSES.has(statusPrefix)) {
    return {
      leaseExpiresAt: leaseToken
        ? new Date(updatedAt.getTime() + PAYMENT_SIDE_EFFECT_LEASE_TTL_MS)
        : null,
      leaseToken: leaseToken || null,
      status: statusPrefix,
    };
  }

  if (
    normalizedStatus === "sent" ||
    normalizedStatus === "skipped" ||
    normalizedStatus === "failed"
  ) {
    return {
      leaseExpiresAt: null,
      leaseToken: null,
      status: normalizedStatus,
    };
  }

  return {
    leaseExpiresAt: null,
    leaseToken: null,
    status: "pending",
  };
};

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

const normalizeOutcome = (value: string): PaymentOutcome => {
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
  paymentRecord: PaymentRecordSnapshot,
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

const getSaleTimestamp = () => null;

const getPurchaseSource = (paymentIntentId: string) =>
  paymentIntentId.startsWith("adm_offer_pi_") ? "admin_offer_link" : "stripe";

const getExternalTargetType = (paymentRecord: PaymentRecordSnapshot) => {
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

const getPaymentSideEffects = (paymentRecord: PaymentRecordSnapshot) => {
  const fallbackUpdatedAt = parseRequiredDate(
    paymentRecord.updated_at || paymentRecord.first_seen_at,
  );
  const emailUpdatedAt =
    parseDate(paymentRecord.email_delivery_updated_at) ?? fallbackUpdatedAt;
  const alertUpdatedAt =
    parseDate(paymentRecord.with_mentor_alert_updated_at) ?? fallbackUpdatedAt;
  const emailStatus = parsePaymentSideEffectStatus({
    status: paymentRecord.email_delivery_status,
    updatedAt: emailUpdatedAt,
  });
  const alertStatus = parsePaymentSideEffectStatus({
    status: paymentRecord.with_mentor_alert_status,
    updatedAt: alertUpdatedAt,
  });
  return [
    emailStatus
      ? {
          kind: "purchase_success_email" as const,
          provider: "resend" as const,
          ...emailStatus,
          updatedAt: emailUpdatedAt,
        }
      : null,
    alertStatus
      ? {
          kind: "admin_telegram_alert" as const,
          provider: "telegram" as const,
          ...alertStatus,
          updatedAt: alertUpdatedAt,
        }
      : null,
  ].filter((sideEffect) => sideEffect !== null);
};

type PaymentRecordTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];
type PaymentOfferReference = Pick<typeof productOffers.$inferSelect, "id" | "productId">;
type ParsedInvoice = NonNullable<ReturnType<typeof parseInvoiceNumber>>;

const upsertPaymentCustomer = async ({
  normalizedEmail,
  now,
  paymentRecord,
  transaction,
}: {
  normalizedEmail: string;
  now: Date;
  paymentRecord: PaymentRecordSnapshot;
  transaction: PaymentRecordTransaction;
}): Promise<string> => {
  const [existingCustomer] = await transaction
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.normalizedEmail, normalizedEmail))
    .limit(1);

  if (existingCustomer) {
    await transaction
      .update(customers)
      .set({
        addressLine: nullIfEmpty(paymentRecord.customer_address),
        city: nullIfEmpty(paymentRecord.customer_city),
        country: nullIfEmpty(paymentRecord.customer_country),
        email: normalizedEmail,
        fullName: nullIfEmpty(paymentRecord.customer_full_name),
        postalCode: nullIfEmpty(paymentRecord.customer_postal_code),
        telegramUsername: nullIfEmpty(paymentRecord.customer_nickname),
        updatedAt: now,
      })
      .where(eq(customers.id, existingCustomer.id));

    return existingCustomer.id;
  }

  const [savedCustomer] = await transaction
    .insert(customers)
    .values({
      addressLine: nullIfEmpty(paymentRecord.customer_address),
      city: nullIfEmpty(paymentRecord.customer_city),
      country: nullIfEmpty(paymentRecord.customer_country),
      email: normalizedEmail,
      fullName: nullIfEmpty(paymentRecord.customer_full_name),
      normalizedEmail,
      postalCode: nullIfEmpty(paymentRecord.customer_postal_code),
      telegramUsername: nullIfEmpty(paymentRecord.customer_nickname),
      updatedAt: now,
    })
    .returning({ id: customers.id });

  return savedCustomer.id;
};

const findPaymentOffer = (
  externalOfferId: string,
  transaction: PaymentRecordTransaction,
) =>
  transaction
    .select({
      id: productOffers.id,
      productId: productOffers.productId,
    })
    .from(productOffers)
    .where(eq(productOffers.externalOfferId, externalOfferId))
    .limit(1);

const findPaymentProduct = (
  externalProductId: string,
  transaction: PaymentRecordTransaction,
) =>
  transaction
    .select({ id: products.id })
    .from(products)
    .where(eq(products.externalProductId, externalProductId))
    .limit(1);

const upsertPaymentPurchase = async ({
  customerId,
  normalizedEmail,
  offer,
  paymentIntentId,
  paymentRecord,
  productId,
  transaction,
}: {
  customerId: string | null;
  normalizedEmail: string;
  offer: PaymentOfferReference | undefined;
  paymentIntentId: string;
  paymentRecord: PaymentRecordSnapshot;
  productId: string | null;
  transaction: PaymentRecordTransaction;
}): Promise<{
  firstSeenAt: Date;
  paymentStateAccepted: boolean;
  purchaseId: string;
}> => {
  const firstSeenAt = parseRequiredDate(
    paymentRecord.first_seen_at || paymentRecord.updated_at,
  );
  const existingPurchase = await transaction
    .select({
      settlementAmountMinor: purchases.settlementAmountMinor,
      settlementCurrency: purchases.settlementCurrency,
      stripeBalanceTransactionId: purchases.stripeBalanceTransactionId,
      stripeExchangeRate: purchases.stripeExchangeRate,
      stripeFeeAmountMinor: purchases.stripeFeeAmountMinor,
      stripeNetAmountMinor: purchases.stripeNetAmountMinor,
      succeededAt: purchases.succeededAt,
    })
    .from(purchases)
    .where(eq(purchases.paymentIntentId, paymentIntentId))
    .limit(1);
  // Sheet-compatible records do not carry settlement data, so mirrors must retain it.
  const incomingOutcome = normalizeOutcome(paymentRecord.outcome);
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
    customerEmailSnapshot: normalizedEmail || nullIfEmpty(paymentRecord.customer_email),
    customerFullNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
    customerId,
    customerPostalCodeSnapshot: nullIfEmpty(paymentRecord.customer_postal_code),
    customerTelegramUsernameSnapshot: nullIfEmpty(paymentRecord.customer_nickname),
    inspirationChatIdSnapshot: nullIfEmpty(paymentRecord.telegram_inspiration_chat_id),
    lastPaymentErrorCode: nullIfEmpty(paymentRecord.last_payment_error_code),
    lastPaymentErrorMessage: nullIfEmpty(paymentRecord.last_payment_error_message),
    latestEventId: nullIfEmpty(paymentRecord.latest_event_id),
    latestEventType: nullIfEmpty(paymentRecord.latest_event_type),
    lessonLanguage: normalizeLessonLanguage(paymentRecord.lesson_language),
    offerExternalId: nullIfEmpty(paymentRecord.offer_id),
    offerId: offer?.id ?? null,
    offerLabelSnapshot: nullIfEmpty(paymentRecord.offer_label),
    outcome: incomingOutcome,
    productExternalId: nullIfEmpty(paymentRecord.product_id),
    productId,
    productTitleSnapshot: nullIfEmpty(paymentRecord.product_title),
    purchaseItemSnapshot: nullIfEmpty(paymentRecord.purchase_item),
    settlementAmountMinor: existingPurchase[0]?.settlementAmountMinor ?? null,
    settlementCurrency: existingPurchase[0]?.settlementCurrency ?? null,
    source: getPurchaseSource(paymentIntentId),
    stripeBalanceTransactionId: existingPurchase[0]?.stripeBalanceTransactionId ?? null,
    stripeExchangeRate: existingPurchase[0]?.stripeExchangeRate ?? null,
    stripeFeeAmountMinor: existingPurchase[0]?.stripeFeeAmountMinor ?? null,
    stripeNetAmountMinor: existingPurchase[0]?.stripeNetAmountMinor ?? null,
    stripeStatus: trim(paymentRecord.status) || "unknown",
    succeededAt: getSaleTimestamp() ?? existingPurchase[0]?.succeededAt ?? null,
    updatedAt: parseRequiredDate(paymentRecord.updated_at, firstSeenAt),
  };
  const [savedPurchase] = await transaction
    .insert(purchases)
    .values({
      ...purchaseValues,
      firstSeenAt,
      paymentIntentId,
    })
    .onConflictDoUpdate({
      set: purchaseValues,
      setWhere: getPaymentOutcomeTransitionCondition(purchases.outcome, incomingOutcome),
      target: purchases.paymentIntentId,
    })
    .returning({
      firstSeenAt: purchases.firstSeenAt,
      id: purchases.id,
    });

  if (!savedPurchase) {
    const [preservedPurchase] = await transaction
      .select({
        firstSeenAt: purchases.firstSeenAt,
        id: purchases.id,
      })
      .from(purchases)
      .where(eq(purchases.paymentIntentId, paymentIntentId))
      .limit(1);

    if (!preservedPurchase) {
      throw new Error(`Purchase ${paymentIntentId} disappeared during state projection.`);
    }

    return {
      firstSeenAt: preservedPurchase.firstSeenAt,
      paymentStateAccepted: false,
      purchaseId: preservedPurchase.id,
    };
  }

  return {
    firstSeenAt: savedPurchase.firstSeenAt,
    paymentStateAccepted: true,
    purchaseId: savedPurchase.id,
  };
};

const upsertPaymentEntitlement = async ({
  customerId,
  now,
  offer,
  paymentRecord,
  productId,
  purchaseId,
  transaction,
}: {
  customerId: string | null;
  now: Date;
  offer: PaymentOfferReference | undefined;
  paymentRecord: PaymentRecordSnapshot;
  productId: string | null;
  purchaseId: string;
  transaction: PaymentRecordTransaction;
}): Promise<void> => {
  await transaction
    .insert(accessEntitlements)
    .values({
      accessKey: "primary",
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
      status: normalizeAccessStatus(paymentRecord.telegram_access_status, paymentRecord),
      telegramChatId: nullIfEmpty(paymentRecord.telegram_channel_chat_id),
      telegramUserId: nullIfEmpty(paymentRecord.telegram_user_id),
      telegramUsername: nullIfEmpty(paymentRecord.telegram_username),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: keepClassifiedAccessPeriod({
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
      }),
      target: [accessEntitlements.purchaseId, accessEntitlements.accessKey],
    });
};

const upsertPaymentInvoice = async ({
  firstSeenAt,
  normalizedEmail,
  now,
  parsedInvoice,
  paymentRecord,
  purchaseId,
  transaction,
}: {
  firstSeenAt: Date;
  normalizedEmail: string;
  now: Date;
  parsedInvoice: ParsedInvoice;
  paymentRecord: PaymentRecordSnapshot;
  purchaseId: string;
  transaction: PaymentRecordTransaction;
}): Promise<void> => {
  const issuedAt = parseRequiredDate(paymentRecord.invoice_issued_at, firstSeenAt);

  await transaction
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
      buyerEmailSnapshot: normalizedEmail || nullIfEmpty(paymentRecord.customer_email),
      buyerNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
      currency:
        trim(paymentRecord.checkout_currency) || trim(paymentRecord.currency) || "pln",
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
        buyerEmailSnapshot: normalizedEmail || nullIfEmpty(paymentRecord.customer_email),
        buyerNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
        currency:
          trim(paymentRecord.checkout_currency) || trim(paymentRecord.currency) || "pln",
        issuedAt,
        sequenceMonth: parsedInvoice.sequenceMonth,
        sequenceNumber: parsedInvoice.sequenceNumber,
        sequenceYear: parsedInvoice.sequenceYear,
        updatedAt: now,
      },
      target: invoices.purchaseId,
    });
};

const upsertPaymentSideEffects = async ({
  paymentRecord,
  purchaseId,
  transaction,
}: {
  paymentRecord: PaymentRecordSnapshot;
  purchaseId: string;
  transaction: PaymentRecordTransaction;
}): Promise<void> => {
  for (const sideEffect of getPaymentSideEffects(paymentRecord)) {
    await transaction
      .insert(purchaseSideEffects)
      .values({
        failedAt: sideEffect.status === "failed" ? sideEffect.updatedAt : null,
        kind: sideEffect.kind,
        leaseExpiresAt: sideEffect.leaseExpiresAt,
        leaseToken: sideEffect.leaseToken,
        provider: sideEffect.provider,
        purchaseId,
        sentAt: sideEffect.status === "sent" ? sideEffect.updatedAt : null,
        status: sideEffect.status,
        updatedAt: sideEffect.updatedAt,
      })
      .onConflictDoUpdate({
        set: {
          failedAt: sideEffect.status === "failed" ? sideEffect.updatedAt : null,
          leaseExpiresAt: sideEffect.leaseExpiresAt,
          leaseToken: sideEffect.leaseToken,
          provider: sideEffect.provider,
          sentAt: sideEffect.status === "sent" ? sideEffect.updatedAt : null,
          status: sideEffect.status,
          updatedAt: sideEffect.updatedAt,
        },
        target: [purchaseSideEffects.purchaseId, purchaseSideEffects.kind],
      });
  }
};

export const upsertPaymentRecordToDatabase = async (
  paymentRecord: PaymentRecordSnapshot,
) => {
  const db = getDatabase();
  const now = new Date();
  const paymentIntentId = paymentRecord.payment_intent_id.trim();

  if (!paymentIntentId) {
    return paymentRecord;
  }

  await db.transaction(async (tx) => {
    const normalizedEmail = normalizeEmail(paymentRecord.customer_email);
    const customerId = normalizedEmail
      ? await upsertPaymentCustomer({
          normalizedEmail,
          now,
          paymentRecord,
          transaction: tx,
        })
      : null;

    const [offer] = paymentRecord.offer_id.trim()
      ? await findPaymentOffer(paymentRecord.offer_id.trim(), tx)
      : [];
    const [product] = paymentRecord.product_id.trim()
      ? await findPaymentProduct(paymentRecord.product_id.trim(), tx)
      : [];
    const productId = product?.id ?? offer?.productId ?? null;
    const { firstSeenAt, paymentStateAccepted, purchaseId } = await upsertPaymentPurchase(
      {
        customerId,
        normalizedEmail,
        offer,
        paymentIntentId,
        paymentRecord,
        productId,
        transaction: tx,
      },
    );

    if (!paymentStateAccepted) {
      return;
    }

    await upsertPaymentEntitlement({
      customerId,
      now,
      offer,
      paymentRecord,
      productId,
      purchaseId,
      transaction: tx,
    });

    const parsedInvoice = parseInvoiceNumber(paymentRecord.invoice_number);

    if (parsedInvoice) {
      await upsertPaymentInvoice({
        firstSeenAt,
        normalizedEmail,
        now,
        parsedInvoice,
        paymentRecord,
        purchaseId,
        transaction: tx,
      });
    }

    await upsertPaymentSideEffects({
      paymentRecord,
      purchaseId,
      transaction: tx,
    });
  });

  return (
    (await findPaymentRecordByIntentIdFromDatabase(paymentIntentId)) ?? paymentRecord
  );
};
