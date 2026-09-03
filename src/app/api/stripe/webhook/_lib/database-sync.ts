import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import { getDatabase } from "@/db/client";
import { type PaymentProjectionCommand } from "@/db/payment-projection";
import { purchases } from "@/db/schema";
import type { PaymentSheetRecord } from "@/lib/google-sheets-schema";

export type StripeSettlementSnapshot = {
  settlementAmountMinor: number | null;
  settlementCurrency: string | null;
  stripeBalanceTransactionId: string | null;
  stripeExchangeRate: string | null;
  stripeFeeAmountMinor: number | null;
  stripeNetAmountMinor: number | null;
};

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

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
): PaymentProjectionCommand["purchase"]["outcome"] => {
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

const getSaleTimestamp = ({
  event,
  paymentRecord,
}: {
  event: Stripe.Event;
  paymentRecord: PaymentSheetRecord;
}) => {
  if (
    event.type === "payment_intent.succeeded" &&
    paymentRecord.outcome.trim() === "succeeded"
  ) {
    return new Date(event.created * 1000);
  }

  return null;
};

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
      stripeFeeAmountMinor: null,
      stripeNetAmountMinor: null,
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
    stripeFeeAmountMinor: balanceTransaction.fee,
    stripeNetAmountMinor: balanceTransaction.net,
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
      stripeFeeAmountMinor: null,
      stripeNetAmountMinor: null,
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
      stripeFeeAmountMinor: null,
      stripeNetAmountMinor: null,
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
    stripeFeeAmountMinor: null,
    stripeNetAmountMinor: null,
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

export const getPurchaseSettlementSnapshot = async ({
  paymentIntentId,
  paymentRecord,
  stripe,
}: {
  paymentIntentId: string;
  paymentRecord: PaymentSheetRecord;
  stripe: Stripe;
}): Promise<StripeSettlementSnapshot> => {
  if (paymentRecord.outcome.trim() === "succeeded") {
    return getStripeSettlementSnapshot({
      paymentIntentId,
      stripe,
    });
  }

  return {
    settlementAmountMinor: null,
    settlementCurrency: null,
    stripeBalanceTransactionId: null,
    stripeExchangeRate: null,
    stripeFeeAmountMinor: null,
    stripeNetAmountMinor: null,
  };
};

export const createStripePaymentProjectionCommand = ({
  event,
  now,
  outboxJobs = [],
  paymentIntentId,
  paymentRecord,
  settlementSnapshot,
}: {
  event: Stripe.Event;
  now: Date;
  outboxJobs?: PaymentProjectionCommand["outboxJobs"];
  paymentIntentId: string;
  paymentRecord: PaymentSheetRecord;
  settlementSnapshot: StripeSettlementSnapshot;
}): PaymentProjectionCommand => {
  const firstSeenAt = parseRequiredDate(
    paymentRecord.first_seen_at || paymentRecord.updated_at,
  );
  const normalizedEmail = normalizeEmail(paymentRecord.customer_email);
  const invoiceParts = parseInvoiceNumber(paymentRecord.invoice_number);
  const currency = (trim(paymentRecord.currency) ||
    trim(paymentRecord.checkout_currency) ||
    "pln") as "pln" | "eur";
  const checkoutCurrency = nullIfEmpty(paymentRecord.checkout_currency) as
    "pln" | "eur" | null;
  return {
    access: {
      accessKey: "primary",
      accessWorkflow: nullIfEmpty(paymentRecord.access_workflow),
      currentTokenId: nullIfEmpty(paymentRecord.telegram_token_id),
      deliveryChannel: nullIfEmpty(paymentRecord.delivery_channel),
      expiresAt: parseDate(paymentRecord.telegram_access_expires_at),
      externalTargetType: getExternalTargetType(paymentRecord),
      revokedAt: parseDate(paymentRecord.telegram_access_revoked_at),
      startsAt: parseDate(paymentRecord.telegram_token_used_at),
      status: normalizeAccessStatus(paymentRecord.telegram_access_status, paymentRecord),
      telegramChatId: nullIfEmpty(paymentRecord.telegram_channel_chat_id),
      telegramUserId: nullIfEmpty(paymentRecord.telegram_user_id),
      telegramUsername: nullIfEmpty(paymentRecord.telegram_username),
    },
    catalog: {
      offerExternalId: nullIfEmpty(paymentRecord.offer_id),
      productExternalId: nullIfEmpty(paymentRecord.product_id),
    },
    customer: {
      addressLine: nullIfEmpty(paymentRecord.customer_address),
      city: nullIfEmpty(paymentRecord.customer_city),
      country: nullIfEmpty(paymentRecord.customer_country),
      email: normalizedEmail || nullIfEmpty(paymentRecord.customer_email),
      fullName: nullIfEmpty(paymentRecord.customer_full_name),
      normalizedEmail: normalizedEmail || null,
      postalCode: nullIfEmpty(paymentRecord.customer_postal_code),
      stripeCustomerId: getStripeCustomerId(event),
      telegramUsername: nullIfEmpty(paymentRecord.customer_nickname),
    },
    firstSeenAt,
    invoice: invoiceParts
      ? {
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
          currency,
          invoiceNumber: paymentRecord.invoice_number.trim(),
          issuedAt: parseRequiredDate(paymentRecord.invoice_issued_at, firstSeenAt),
          sequenceMonth: invoiceParts.sequenceMonth,
          sequenceNumber: invoiceParts.sequenceNumber,
          sequenceYear: invoiceParts.sequenceYear,
        }
      : null,
    livemode: event.livemode,
    outboxJobs,
    paymentIntentId,
    projectedAt: now,
    purchase: {
      amountMinor: parseInteger(paymentRecord.amount),
      checkoutCurrency,
      checkoutLocale: normalizeCheckoutLocale(paymentRecord.checkout_locale),
      checkoutSessionId: nullIfEmpty(paymentRecord.checkout_session_id),
      currency,
      customerAddressLineSnapshot: nullIfEmpty(paymentRecord.customer_address),
      customerCitySnapshot: nullIfEmpty(paymentRecord.customer_city),
      customerCountrySnapshot: nullIfEmpty(paymentRecord.customer_country),
      customerEmailSnapshot: normalizedEmail || nullIfEmpty(paymentRecord.customer_email),
      customerFullNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
      customerPostalCodeSnapshot: nullIfEmpty(paymentRecord.customer_postal_code),
      customerTelegramUsernameSnapshot: nullIfEmpty(paymentRecord.customer_nickname),
      inspirationChatIdSnapshot: nullIfEmpty(paymentRecord.telegram_inspiration_chat_id),
      lastPaymentErrorCode: nullIfEmpty(paymentRecord.last_payment_error_code),
      lastPaymentErrorMessage: nullIfEmpty(paymentRecord.last_payment_error_message),
      latestEventId: nullIfEmpty(paymentRecord.latest_event_id),
      latestEventType: nullIfEmpty(paymentRecord.latest_event_type),
      lessonLanguage: normalizeLessonLanguage(paymentRecord.lesson_language),
      offerLabelSnapshot: nullIfEmpty(paymentRecord.offer_label),
      outcome: normalizeOutcome(paymentRecord.outcome),
      productTitleSnapshot: nullIfEmpty(paymentRecord.product_title),
      purchaseItemSnapshot: nullIfEmpty(paymentRecord.purchase_item),
      settlementAmountMinor: settlementSnapshot.settlementAmountMinor,
      settlementCurrency: settlementSnapshot.settlementCurrency,
      source: getPurchaseSource(paymentIntentId),
      stripeBalanceTransactionId: settlementSnapshot.stripeBalanceTransactionId,
      stripeExchangeRate: settlementSnapshot.stripeExchangeRate,
      stripeFeeAmountMinor: settlementSnapshot.stripeFeeAmountMinor,
      stripeNetAmountMinor: settlementSnapshot.stripeNetAmountMinor,
      stripeStatus: trim(paymentRecord.status) || "unknown",
      succeededAt: getSaleTimestamp({ event, paymentRecord }),
      updatedAt: parseRequiredDate(paymentRecord.updated_at, firstSeenAt),
    },
  };
};

export type PreparedStripeChargeSettlement = {
  paymentIntentId: string;
  settlementSnapshot: StripeSettlementSnapshot;
  status: "pending_balance_transaction" | "ready" | "skipped";
  stripeBalanceTransactionId: string | null;
};

export const prepareStripeChargeSettlement = async ({
  event,
  stripe,
}: {
  event: Stripe.Event;
  stripe: Stripe;
}): Promise<PreparedStripeChargeSettlement> => {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId = getPaymentIntentIdFromCharge(charge);

  if (!paymentIntentId) {
    return {
      paymentIntentId: "",
      settlementSnapshot: {
        settlementAmountMinor: null,
        settlementCurrency: null,
        stripeBalanceTransactionId: getBalanceTransactionId(charge.balance_transaction),
        stripeExchangeRate: null,
        stripeFeeAmountMinor: null,
        stripeNetAmountMinor: null,
      },
      status: "skipped",
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
      settlementSnapshot,
      status: "pending_balance_transaction",
      stripeBalanceTransactionId: settlementSnapshot.stripeBalanceTransactionId,
    };
  }

  return {
    paymentIntentId,
    settlementSnapshot,
    status: "ready",
    stripeBalanceTransactionId: settlementSnapshot.stripeBalanceTransactionId,
  };
};

export const applyPreparedStripeChargeSettlement = async ({
  prepared,
  transaction,
}: {
  prepared: PreparedStripeChargeSettlement;
  transaction: DatabaseTransaction;
}) => {
  if (prepared.status !== "ready") {
    return {
      paymentIntentId: prepared.paymentIntentId,
      purchaseId: null,
      status: prepared.status,
      stripeBalanceTransactionId: prepared.stripeBalanceTransactionId,
    };
  }

  const [updatedPurchase] = await transaction
    .update(purchases)
    .set({
      settlementAmountMinor: prepared.settlementSnapshot.settlementAmountMinor,
      settlementCurrency: prepared.settlementSnapshot.settlementCurrency,
      stripeBalanceTransactionId: prepared.settlementSnapshot.stripeBalanceTransactionId,
      stripeExchangeRate: prepared.settlementSnapshot.stripeExchangeRate,
      stripeFeeAmountMinor: prepared.settlementSnapshot.stripeFeeAmountMinor,
      stripeNetAmountMinor: prepared.settlementSnapshot.stripeNetAmountMinor,
      updatedAt: new Date(),
    })
    .where(eq(purchases.paymentIntentId, prepared.paymentIntentId))
    .returning({ id: purchases.id });

  return {
    paymentIntentId: prepared.paymentIntentId,
    purchaseId: updatedPurchase?.id ?? null,
    status: updatedPurchase ? ("updated" as const) : ("purchase_not_found" as const),
    stripeBalanceTransactionId: prepared.stripeBalanceTransactionId,
  };
};
