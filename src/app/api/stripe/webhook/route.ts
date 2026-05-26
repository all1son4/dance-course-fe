import { randomBytes } from "node:crypto";

import type Stripe from "stripe";

import { isResendConfigured, sendResendEmail } from "@/lib/email/resend";
import {
  findPaymentRecordByIntentId,
  GoogleSheetsError,
  isGoogleSheetsConfigured,
  isGoogleSheetsRateLimitError,
  type PaymentSheetRecord,
  upsertPaymentRecord,
} from "@/lib/google-sheets";
import { isPayloadTooLarge, jsonNoStore } from "@/lib/http-security";
import { ensureInvoiceNumberForPayment } from "@/lib/invoices/invoice-numbering";
import { buildPurchaseInvoiceAttachment } from "@/lib/invoices/purchase-invoice";
import { getLocalizedOfferMetadataByOfferId } from "@/lib/sellable-products-localization";
import {
  ensureTelegramAccessLinkForPayment,
  isOfferEligibleForTelegramAccessLink,
} from "@/lib/telegram/access";
import { sendTelegramMessage } from "@/lib/telegram/bot-api";
import {
  getTelegramAlertsBotToken,
  getTelegramAlertsChatId,
  isTelegramAlertsConfigured,
} from "@/lib/telegram/config";
import { toUtcIso } from "@/lib/time";

import { getResolvedCheckoutLocale, getStripeServer } from "../payment-intent/lib";
import {
  isSupportedStripePaymentIntentEvent,
  syncStripePaymentEventToGoogleSheets,
} from "./lib";
import { buildPurchaseAlertText } from "./purchase-alert";
import { buildPurchaseSuccessEmail } from "./purchase-success-email";

const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const MAX_WEBHOOK_BODY_BYTES = 1_000_000;
const vercelEnvironment = process.env.VERCEL_ENV;
const isProductionDeployment =
  vercelEnvironment === "production" ||
  (!vercelEnvironment && process.env.NODE_ENV === "production");
const allowTestModeNotifications = process.env.ALLOW_TEST_MODE_NOTIFICATIONS === "1";

export const runtime = "nodejs";

type StripeReceiptData = {
  receiptKind: "pdf" | "receipt" | null;
  receiptLink: string | null;
  recipientEmail: string;
};

const DEFAULT_PRODUCT_TITLE_BY_LOCALE = {
  en: "Course purchase",
  pl: "Zakup kursu",
  ru: "Покупка курса",
} as const;

const pendingPurchaseEmailSyncs = new Map<string, Promise<void>>();
const pendingPurchaseAlertSyncs = new Map<string, Promise<void>>();
const fallbackPurchaseAlertDedupe = new Map<string, number>();
const PAYMENT_PROCESSING_STATUS_PREFIX = "sending:";
const PAYMENT_PROCESSING_LEASE_TTL_MS = 2 * 60 * 1000;
const PURCHASE_ALERT_FALLBACK_DEDUPE_TTL_MS = 10 * 60 * 1000;
const FRESH_PAYMENT_LOOKUP_CACHE_TTL_MS = 30 * 1000;
const PURCHASE_SUCCESS_SIDE_EFFECT_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "payment_intent.succeeded",
]);

type PaymentStatusField = "email_delivery_status" | "with_mentor_alert_status";
type PaymentStatusUpdatedField =
  | "email_delivery_updated_at"
  | "with_mentor_alert_updated_at";

const parseTimestamp = (value: string) => {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getCheckoutSessionPaymentIntentId = (event: Stripe.Event) => {
  if (event.type !== "checkout.session.completed") {
    return "";
  }

  const checkoutSession = event.data.object as Stripe.Checkout.Session;
  const paymentIntent = checkoutSession.payment_intent;

  if (typeof paymentIntent === "string") {
    return paymentIntent;
  }

  return paymentIntent?.id ?? "";
};

const shouldRunPurchaseSuccessSideEffects = (event: Stripe.Event) => {
  if (!PURCHASE_SUCCESS_SIDE_EFFECT_EVENT_TYPES.has(event.type)) {
    return false;
  }

  if (event.type === "payment_intent.succeeded") {
    return true;
  }

  // Stripe Payment Links commonly emit both checkout.session.completed and
  // payment_intent.succeeded for one payment. Keep Checkout Session for Sheets
  // enrichment, but run email/admin alerts only once on the PaymentIntent event.
  return !getCheckoutSessionPaymentIntentId(event);
};

const createPaymentProcessingStatus = () =>
  `${PAYMENT_PROCESSING_STATUS_PREFIX}${randomBytes(10).toString("hex")}`;

const hasFreshFallbackAlertSend = (paymentIntentId: string) => {
  const now = Date.now();

  for (const [key, expiresAt] of fallbackPurchaseAlertDedupe) {
    if (expiresAt <= now) {
      fallbackPurchaseAlertDedupe.delete(key);
    }
  }

  const expiresAt = fallbackPurchaseAlertDedupe.get(paymentIntentId) ?? 0;

  return expiresAt > now;
};

const markFallbackAlertSent = (paymentIntentId: string) => {
  fallbackPurchaseAlertDedupe.set(
    paymentIntentId,
    Date.now() + PURCHASE_ALERT_FALLBACK_DEDUPE_TTL_MS,
  );
};

const isFreshPaymentProcessingStatus = ({
  status,
  updatedAt,
}: {
  status: string;
  updatedAt: string;
}) =>
  status.startsWith(PAYMENT_PROCESSING_STATUS_PREFIX) &&
  parseTimestamp(updatedAt) + PAYMENT_PROCESSING_LEASE_TTL_MS > Date.now();

const getFreshPaymentRecord = async ({
  fallbackPaymentRecord,
  paymentIntentId,
}: {
  fallbackPaymentRecord: PaymentSheetRecord;
  paymentIntentId: string;
}) => {
  try {
    return (
      (await findPaymentRecordByIntentId(paymentIntentId, {
        cacheTtlMs: FRESH_PAYMENT_LOOKUP_CACHE_TTL_MS,
      })) ?? fallbackPaymentRecord
    );
  } catch (error) {
    if (!isGoogleSheetsRateLimitError(error)) {
      throw error;
    }

    return fallbackPaymentRecord;
  }
};

const tryAcquirePaymentProcessingLease = async ({
  completedStatuses,
  fallbackPaymentRecord,
  paymentIntentId,
  statusField,
  updatedAtField,
}: {
  completedStatuses: Set<string>;
  fallbackPaymentRecord: PaymentSheetRecord;
  paymentIntentId: string;
  statusField: PaymentStatusField;
  updatedAtField: PaymentStatusUpdatedField;
}) => {
  const latestPaymentRecord = await getFreshPaymentRecord({
    fallbackPaymentRecord,
    paymentIntentId,
  });
  const currentStatus = latestPaymentRecord[statusField].trim();

  if (completedStatuses.has(currentStatus)) {
    return {
      acquired: false,
      paymentRecord: latestPaymentRecord,
    };
  }

  if (
    isFreshPaymentProcessingStatus({
      status: currentStatus,
      updatedAt: latestPaymentRecord[updatedAtField],
    })
  ) {
    return {
      acquired: false,
      paymentRecord: latestPaymentRecord,
    };
  }

  const now = toUtcIso();
  const leaseStatus = createPaymentProcessingStatus();
  await upsertPaymentRecord({
    ...latestPaymentRecord,
    [statusField]: leaseStatus,
    [updatedAtField]: now,
    updated_at: now,
  });

  const verifiedPaymentRecord = await getFreshPaymentRecord({
    fallbackPaymentRecord: latestPaymentRecord,
    paymentIntentId,
  });

  return {
    acquired: verifiedPaymentRecord[statusField].trim() === leaseStatus,
    paymentRecord: verifiedPaymentRecord,
  };
};

const getReceiptData = async (
  stripe: Stripe,
  paymentIntent: Stripe.PaymentIntent,
): Promise<StripeReceiptData> => {
  const latestChargeId =
    typeof paymentIntent.latest_charge === "string"
      ? paymentIntent.latest_charge
      : (paymentIntent.latest_charge?.id ?? "");

  if (!latestChargeId) {
    return {
      receiptKind: null,
      receiptLink: null,
      recipientEmail: "",
    };
  }

  try {
    const charge = await stripe.charges.retrieve(latestChargeId);
    const billingEmail = charge.billing_details?.email?.trim() ?? "";
    const receiptLink = charge.receipt_url ?? null;
    const receiptKind = receiptLink
      ? /\.pdf(?:[?#].*)?$/i.test(receiptLink)
        ? "pdf"
        : "receipt"
      : null;

    return {
      receiptKind,
      receiptLink,
      recipientEmail: billingEmail,
    };
  } catch (error) {
    console.error("Failed to retrieve Stripe receipt data", {
      error,
      latestChargeId,
      paymentIntentId: paymentIntent.id,
    });

    return {
      receiptKind: null,
      receiptLink: null,
      recipientEmail: "",
    };
  }
};

const getPurchaseSideEffectPaymentIntent = async ({
  event,
  stripe,
}: {
  event: Stripe.Event;
  stripe: Stripe;
}) => {
  if (!shouldRunPurchaseSuccessSideEffects(event)) {
    return null;
  }

  if (event.type === "payment_intent.succeeded") {
    return event.data.object as Stripe.PaymentIntent;
  }

  const checkoutSession = event.data.object as Stripe.Checkout.Session;
  const paymentIntent = checkoutSession.payment_intent;

  if (!paymentIntent) {
    return null;
  }

  if (typeof paymentIntent !== "string") {
    return paymentIntent;
  }

  return stripe.paymentIntents.retrieve(paymentIntent);
};

const isExpectedResendRestrictionError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("resend_request_failed:403:") &&
    error.message.includes("validation_error")
  );
};

const updatePaymentEmailDeliveryStatus = async ({
  paymentRecord,
  status,
}: {
  paymentRecord: PaymentSheetRecord;
  status: "failed" | "sent" | "skipped";
}) => {
  const now = toUtcIso();
  const latestPaymentRecord = await getFreshPaymentRecord({
    fallbackPaymentRecord: paymentRecord,
    paymentIntentId: paymentRecord.payment_intent_id,
  });

  await upsertPaymentRecord({
    ...latestPaymentRecord,
    email_delivery_status: status,
    email_delivery_updated_at: now,
    updated_at: now,
  });
};

const tryUpdatePaymentEmailDeliveryStatus = async ({
  paymentRecord,
  status,
}: {
  paymentRecord: PaymentSheetRecord;
  status: "failed" | "sent" | "skipped";
}) => {
  try {
    await updatePaymentEmailDeliveryStatus({
      paymentRecord,
      status,
    });
  } catch (statusUpdateError) {
    console.error("Failed to update email delivery status", statusUpdateError);
  }
};

const updatePurchaseAlertStatus = async ({
  paymentRecord,
  status,
}: {
  paymentRecord: PaymentSheetRecord;
  status: "failed" | "sent";
}) => {
  const now = toUtcIso();
  const latestPaymentRecord = await getFreshPaymentRecord({
    fallbackPaymentRecord: paymentRecord,
    paymentIntentId: paymentRecord.payment_intent_id,
  });

  await upsertPaymentRecord({
    ...latestPaymentRecord,
    updated_at: now,
    with_mentor_alert_status: status,
    with_mentor_alert_updated_at: now,
  });
};

const tryUpdatePurchaseAlertStatus = async ({
  paymentRecord,
  status,
}: {
  paymentRecord: PaymentSheetRecord;
  status: "failed" | "sent";
}) => {
  try {
    await updatePurchaseAlertStatus({
      paymentRecord,
      status,
    });
  } catch (statusUpdateError) {
    console.error("Failed to update purchase alert status", statusUpdateError);
  }
};

const sendPurchaseSuccessEmail = async ({
  event,
  handledEvent,
  stripe,
}: {
  event: Stripe.Event;
  handledEvent: Awaited<ReturnType<typeof syncStripePaymentEventToGoogleSheets>>;
  stripe: Stripe;
}) => {
  if (
    !shouldRunPurchaseSuccessSideEffects(event) ||
    handledEvent.skipped ||
    handledEvent.paymentRecord.outcome !== "succeeded"
  ) {
    return;
  }

  if (!isProductionDeployment && !allowTestModeNotifications && !event.livemode) {
    console.warn("Skipping purchase email for Stripe test-mode event in non-production", {
      eventId: handledEvent.eventId,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });
    return;
  }

  if (!isResendConfigured()) {
    console.warn("RESEND_API_KEY is not configured, skipping purchase email", {
      eventId: handledEvent.eventId,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });
    await tryUpdatePaymentEmailDeliveryStatus({
      paymentRecord: handledEvent.paymentRecord,
      status: "skipped",
    });
    return;
  }

  const paymentIntent = await getPurchaseSideEffectPaymentIntent({
    event,
    stripe,
  });

  if (!paymentIntent) {
    console.warn("Missing PaymentIntent for purchase success email", {
      eventId: handledEvent.eventId,
      eventType: handledEvent.eventType,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });
    await tryUpdatePaymentEmailDeliveryStatus({
      paymentRecord: handledEvent.paymentRecord,
      status: "failed",
    });
    return;
  }

  const paymentIntentId = paymentIntent.id;
  const pendingSync = pendingPurchaseEmailSyncs.get(paymentIntentId);

  if (pendingSync) {
    await pendingSync;
    return;
  }

  const emailSyncPromise = (async () => {
    const paymentIntentIdForLease = handledEvent.paymentRecord.payment_intent_id;
    const emailLease = await tryAcquirePaymentProcessingLease({
      completedStatuses: new Set(["sent", "skipped"]),
      fallbackPaymentRecord: handledEvent.paymentRecord,
      paymentIntentId: paymentIntentIdForLease,
      statusField: "email_delivery_status",
      updatedAtField: "email_delivery_updated_at",
    });

    if (!emailLease.acquired) {
      return;
    }

    const paymentRecord = emailLease.paymentRecord;

    const checkoutLocale = getResolvedCheckoutLocale(
      paymentRecord.checkout_locale || paymentIntent.metadata.checkout_locale,
    );
    const localizedOfferMetadata = getLocalizedOfferMetadataByOfferId(
      paymentRecord.offer_id,
      checkoutLocale,
    );
    const telegramAccessLink = isOfferEligibleForTelegramAccessLink(
      paymentRecord.offer_id,
    )
      ? await ensureTelegramAccessLinkForPayment(paymentRecord)
      : null;
    const {
      receiptKind,
      receiptLink,
      recipientEmail: stripeBillingEmail,
    } = await getReceiptData(stripe, paymentIntent);
    const recipientEmail =
      paymentRecord.customer_email || paymentIntent.receipt_email || stripeBillingEmail;

    if (!recipientEmail) {
      console.warn("Missing customer email for purchase success notification", {
        eventId: handledEvent.eventId,
        paymentIntentId: paymentRecord.payment_intent_id,
      });
      await tryUpdatePaymentEmailDeliveryStatus({
        paymentRecord,
        status: "failed",
      });
      return;
    }

    const { html, subject, text } = buildPurchaseSuccessEmail({
      amountMinor: paymentRecord.amount,
      checkoutCurrency: paymentRecord.checkout_currency || paymentRecord.currency,
      checkoutLocale,
      offerLabel:
        paymentRecord.offer_label ||
        paymentIntent.metadata.offer_label ||
        localizedOfferMetadata?.offerLabel ||
        "",
      productTitle:
        paymentRecord.product_title ||
        paymentIntent.description ||
        localizedOfferMetadata?.productTitle ||
        DEFAULT_PRODUCT_TITLE_BY_LOCALE[checkoutLocale],
      receiptKind,
      receiptLink,
      telegramAccessUrl:
        telegramAccessLink?.status === "ready" ? telegramAccessLink.accessUrl : null,
    });

    try {
      const invoiceIssuedAt = new Date(event.created * 1000);
      const invoicedPaymentRecord = await ensureInvoiceNumberForPayment({
        issuedAt: invoiceIssuedAt,
        paymentRecord,
      });
      const invoiceAttachment = await buildPurchaseInvoiceAttachment({
        issuedAt: invoiceIssuedAt,
        paymentRecord: invoicedPaymentRecord,
      });
      const { emailId } = await sendResendEmail({
        attachments: [invoiceAttachment],
        html,
        subject,
        text,
        to: recipientEmail,
      });

      console.warn("Purchase success email sent", {
        emailId,
        eventId: handledEvent.eventId,
        paymentIntentId: paymentRecord.payment_intent_id,
        recipientEmail,
      });

      await tryUpdatePaymentEmailDeliveryStatus({
        paymentRecord,
        status: "sent",
      });
    } catch (error) {
      if (isExpectedResendRestrictionError(error)) {
        console.warn("Purchase success email skipped (Resend test-domain restriction)", {
          eventId: handledEvent.eventId,
          paymentIntentId: paymentRecord.payment_intent_id,
        });

        await tryUpdatePaymentEmailDeliveryStatus({
          paymentRecord,
          status: "skipped",
        });
        return;
      }

      console.error("Failed to send purchase success email", {
        error,
        eventId: handledEvent.eventId,
        paymentIntentId: paymentRecord.payment_intent_id,
      });

      await tryUpdatePaymentEmailDeliveryStatus({
        paymentRecord,
        status: "failed",
      });
      throw error;
    }
  })().finally(() => {
    pendingPurchaseEmailSyncs.delete(paymentIntentId);
  });

  pendingPurchaseEmailSyncs.set(paymentIntentId, emailSyncPromise);
  await emailSyncPromise;
};

const sendPurchaseAlert = async ({
  event,
  handledEvent,
}: {
  event: Stripe.Event;
  handledEvent: Awaited<ReturnType<typeof syncStripePaymentEventToGoogleSheets>>;
}) => {
  if (
    !shouldRunPurchaseSuccessSideEffects(event) ||
    handledEvent.skipped ||
    handledEvent.paymentRecord.outcome !== "succeeded"
  ) {
    return;
  }

  if (!isProductionDeployment && !allowTestModeNotifications && !event.livemode) {
    console.warn(
      "Skipping purchase Telegram alert for Stripe test-mode event in non-production",
      {
        eventId: handledEvent.eventId,
        paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
      },
    );
    return;
  }

  if (!isTelegramAlertsConfigured()) {
    console.warn("Telegram alerts are not configured for purchase alerts", {
      eventId: handledEvent.eventId,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });
    return;
  }

  const alertsChatId = getTelegramAlertsChatId();
  const alertsBotToken = getTelegramAlertsBotToken();

  if (!alertsChatId || !alertsBotToken) {
    return;
  }

  const paymentIntentId = handledEvent.paymentRecord.payment_intent_id;
  const pendingSync = pendingPurchaseAlertSyncs.get(paymentIntentId);

  if (pendingSync) {
    await pendingSync;
    return;
  }

  const alertSyncPromise = (async () => {
    let latestPaymentRecord = handledEvent.paymentRecord;
    let shouldPersistAlertStatus = true;

    try {
      const alertLease = await tryAcquirePaymentProcessingLease({
        completedStatuses: new Set(["sent"]),
        fallbackPaymentRecord: handledEvent.paymentRecord,
        paymentIntentId,
        statusField: "with_mentor_alert_status",
        updatedAtField: "with_mentor_alert_updated_at",
      });

      if (!alertLease.acquired) {
        return;
      }

      latestPaymentRecord = alertLease.paymentRecord;
    } catch (error) {
      if (!isGoogleSheetsRateLimitError(error)) {
        throw error;
      }

      if (hasFreshFallbackAlertSend(paymentIntentId)) {
        console.warn("Skipping fallback purchase alert duplicate during Sheets backoff", {
          eventId: handledEvent.eventId,
          paymentIntentId,
        });
        return;
      }

      shouldPersistAlertStatus = false;
      console.warn(
        "Google Sheets is rate limited, sending purchase alert without lease",
        {
          eventId: handledEvent.eventId,
          paymentIntentId,
        },
      );
    }

    const alertText = buildPurchaseAlertText({
      eventCreatedAtIso: toUtcIso(event.created * 1000),
      eventId: handledEvent.eventId,
      eventType: handledEvent.eventType,
      paymentRecord: latestPaymentRecord,
      processedAtIso: toUtcIso(),
    });

    try {
      await sendTelegramMessage({
        botToken: alertsBotToken,
        chatId: alertsChatId,
        disableWebPagePreview: true,
        parseMode: "HTML",
        text: alertText,
      });

      console.warn("Sent purchase alert to Telegram group", {
        eventId: handledEvent.eventId,
        paymentIntentId,
      });

      if (shouldPersistAlertStatus) {
        await tryUpdatePurchaseAlertStatus({
          paymentRecord: latestPaymentRecord,
          status: "sent",
        });
      } else {
        markFallbackAlertSent(paymentIntentId);
      }
    } catch (error) {
      console.error("Failed to send purchase alert", {
        error,
        eventId: handledEvent.eventId,
        paymentIntentId,
      });

      if (shouldPersistAlertStatus) {
        await tryUpdatePurchaseAlertStatus({
          paymentRecord: latestPaymentRecord,
          status: "failed",
        });
      }

      throw error;
    }
  })().finally(() => {
    pendingPurchaseAlertSyncs.delete(paymentIntentId);
  });

  pendingPurchaseAlertSyncs.set(paymentIntentId, alertSyncPromise);
  await alertSyncPromise;
};

const runWebhookSideEffects = async ({
  event,
  handledEvent,
  stripe,
}: {
  event: Stripe.Event;
  handledEvent: Awaited<ReturnType<typeof syncStripePaymentEventToGoogleSheets>>;
  stripe: Stripe;
}) => {
  try {
    await sendPurchaseSuccessEmail({
      event,
      handledEvent,
      stripe,
    });
  } catch (error) {
    console.error("Purchase success email side effect failed", {
      error,
      eventId: handledEvent.eventId,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });
  }

  try {
    await sendPurchaseAlert({
      event,
      handledEvent,
    });
  } catch (error) {
    console.error("Purchase alert side effect failed", {
      error,
      eventId: handledEvent.eventId,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });
  }
};

export async function POST(request: Request) {
  if (isPayloadTooLarge(request, MAX_WEBHOOK_BODY_BYTES)) {
    return jsonNoStore(
      {
        errorCode: "payload_too_large",
      },
      { status: 413 },
    );
  }

  const stripe = getStripeServer();

  if (!stripe) {
    return jsonNoStore(
      {
        errorCode: "missing_secret_key",
      },
      { status: 500 },
    );
  }

  if (!isGoogleSheetsConfigured()) {
    return jsonNoStore(
      {
        errorCode: "google_sheets_not_configured",
      },
      { status: 500 },
    );
  }

  if (!stripeWebhookSecret) {
    return jsonNoStore(
      {
        errorCode: "missing_webhook_secret",
      },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return jsonNoStore(
      {
        errorCode: "missing_webhook_signature",
      },
      { status: 400 },
    );
  }

  try {
    const payload = await request.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(payload, signature, stripeWebhookSecret);
    } catch (error) {
      console.error("Failed to verify Stripe webhook signature", error);

      return jsonNoStore(
        {
          errorCode: "invalid_webhook_signature",
        },
        { status: 400 },
      );
    }

    if (!isSupportedStripePaymentIntentEvent(event.type)) {
      return jsonNoStore({
        eventId: event.id,
        ignored: true,
        received: true,
        type: event.type,
      });
    }

    if (event.type === "checkout.session.completed") {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;

      if (checkoutSession.mode !== "payment" || !checkoutSession.payment_intent) {
        return jsonNoStore({
          eventId: event.id,
          ignored: true,
          received: true,
          type: event.type,
        });
      }
    }

    const handledEvent = await syncStripePaymentEventToGoogleSheets(event);

    await runWebhookSideEffects({
      event,
      handledEvent,
      stripe,
    });

    if (
      !handledEvent.skipped &&
      (handledEvent.paymentRecord.outcome === "failed" ||
        handledEvent.paymentRecord.outcome === "canceled")
    ) {
      console.warn("Stripe payment did not complete", {
        eventId: handledEvent.eventId,
        eventType: handledEvent.eventType,
        outcome: handledEvent.paymentRecord.outcome,
        paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
        status: handledEvent.paymentRecord.status,
      });
    }

    return jsonNoStore(handledEvent);
  } catch (error) {
    if (error instanceof GoogleSheetsError) {
      console.error("Failed to sync Stripe webhook to Google Sheets", {
        details: error.details,
        errorCode: error.code,
        status: error.status,
      });

      return jsonNoStore(
        {
          errorCode: "stripe_webhook_sync_failed",
        },
        { status: 500 },
      );
    }

    console.error("Failed to process Stripe webhook", error);

    return jsonNoStore(
      {
        errorCode: "stripe_webhook_failed",
      },
      { status: 500 },
    );
  }
}
