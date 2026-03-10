import type Stripe from "stripe";

import { normalizeCountryCode } from "@/constants/countries";
import { isResendConfigured, sendResendEmail } from "@/lib/email/resend";
import {
  ensureGoogleSheetsSchema,
  findPaymentRecordByIntentId,
  GoogleSheetsError,
  isGoogleSheetsConfigured,
  type PaymentSheetRecord,
  upsertPaymentRecord,
} from "@/lib/google-sheets";
import { isPayloadTooLarge, jsonNoStore } from "@/lib/http-security";
import { getLocalizedOfferMetadataByOfferId } from "@/lib/sellable-products-localization";
import {
  ensureTelegramAccessLinkForPayment,
  isOfferEligibleForTelegramBotAccess,
} from "@/lib/telegram/access";
import { sendTelegramMessage } from "@/lib/telegram/bot-api";
import {
  getTelegramAlertsBotToken,
  getTelegramAlertsChatId,
  isTelegramAlertsConfigured,
} from "@/lib/telegram/config";
import { toWarsawIso, WARSAW_TIME_ZONE_LABEL } from "@/lib/time";

import {
  getResolvedCheckoutLessonLanguage,
  getResolvedCheckoutLocale,
  getStripeServer,
} from "../payment-intent/lib";
import {
  isSupportedStripePaymentIntentEvent,
  syncStripePaymentEventToGoogleSheets,
} from "./lib";
import { buildPurchaseSuccessEmail } from "./purchase-success-email";

const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const MAX_WEBHOOK_BODY_BYTES = 1_000_000;
const isProduction = process.env.NODE_ENV === "production";
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

const CHECKOUT_LOCALE_TO_INTL_LOCALE = {
  en: "en-US",
  pl: "pl-PL",
  ru: "ru-RU",
} as const;
const CHECKOUT_LANGUAGE_LABEL_BY_LOCALE = {
  en: "English",
  pl: "Polski",
  ru: "Русский",
} as const;
const LESSON_LANGUAGE_LABEL_BY_LANGUAGE = {
  en: "English",
  ru: "Русский",
} as const;
const pendingPurchaseEmailSyncs = new Map<string, Promise<void>>();
const pendingWithMentorAlertSyncs = new Map<string, Promise<void>>();

const escapeTelegramHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const getFormattedAmountLabel = ({
  amountMinor,
  checkoutCurrency,
  checkoutLocale,
}: {
  amountMinor: string;
  checkoutCurrency: string;
  checkoutLocale: "en" | "pl" | "ru";
}) => {
  const parsedAmountMinor = Number.parseInt(amountMinor, 10);
  const normalizedCurrency = checkoutCurrency.trim().toUpperCase();

  if (!Number.isFinite(parsedAmountMinor) || !normalizedCurrency) {
    return [amountMinor.trim(), normalizedCurrency].filter(Boolean).join(" ").trim();
  }

  const amount = parsedAmountMinor / 100;
  const locale = CHECKOUT_LOCALE_TO_INTL_LOCALE[checkoutLocale];

  try {
    return new Intl.NumberFormat(locale, {
      currency: normalizedCurrency,
      style: "currency",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${normalizedCurrency}`;
  }
};

const getPurchaseItemLabel = (paymentRecord: PaymentSheetRecord) => {
  const purchaseItem = paymentRecord.purchase_item.trim();

  if (purchaseItem) {
    return purchaseItem;
  }

  const productTitle = paymentRecord.product_title.trim();
  const offerLabel = paymentRecord.offer_label.trim();

  if (productTitle && offerLabel) {
    return `${productTitle} — ${offerLabel}`;
  }

  return productTitle || offerLabel;
};

const getCheckoutLanguageLabel = (checkoutLocale: "en" | "pl" | "ru") =>
  CHECKOUT_LANGUAGE_LABEL_BY_LOCALE[checkoutLocale];

const getLessonLanguageLabel = ({
  checkoutLocale,
  lessonLanguage,
}: {
  checkoutLocale: "en" | "pl" | "ru";
  lessonLanguage: string;
}) => {
  const fallbackLessonLanguage = checkoutLocale === "en" ? "en" : "ru";
  const resolvedLessonLanguage = getResolvedCheckoutLessonLanguage(
    lessonLanguage || fallbackLessonLanguage,
  );

  return LESSON_LANGUAGE_LABEL_BY_LANGUAGE[resolvedLessonLanguage];
};

const getFormattedCountryLabel = ({
  checkoutLocale,
  customerCountry,
}: {
  checkoutLocale: "en" | "pl" | "ru";
  customerCountry: string;
}) => {
  const normalizedCountryCode = normalizeCountryCode(customerCountry);

  if (!normalizedCountryCode) {
    return customerCountry.trim() || "—";
  }

  if (typeof Intl.DisplayNames !== "function") {
    return normalizedCountryCode;
  }

  try {
    const locale = CHECKOUT_LOCALE_TO_INTL_LOCALE[checkoutLocale];
    const displayName = new Intl.DisplayNames([locale], { type: "region" }).of(
      normalizedCountryCode,
    );

    return displayName || normalizedCountryCode;
  } catch {
    return normalizedCountryCode;
  }
};

const buildWithMentorPurchaseAlertText = ({
  eventCreatedAtIso,
  eventId,
  eventType,
  processedAtIso,
  paymentRecord,
}: {
  eventCreatedAtIso: string;
  eventId: string;
  eventType: string;
  processedAtIso: string;
  paymentRecord: PaymentSheetRecord;
}) => {
  const checkoutLocale = getResolvedCheckoutLocale(paymentRecord.checkout_locale);
  const fullName = paymentRecord.customer_full_name.trim();
  const purchaseItem = getPurchaseItemLabel(paymentRecord);
  const amountLabel = getFormattedAmountLabel({
    amountMinor: paymentRecord.amount,
    checkoutCurrency: paymentRecord.checkout_currency || paymentRecord.currency,
    checkoutLocale,
  });
  const checkoutLanguageLabel = getCheckoutLanguageLabel(checkoutLocale);
  const lessonLanguageLabel = getLessonLanguageLabel({
    checkoutLocale,
    lessonLanguage: paymentRecord.lesson_language,
  });
  const countryLabel = getFormattedCountryLabel({
    checkoutLocale,
    customerCountry: paymentRecord.customer_country,
  });
  const customerNickname = paymentRecord.customer_nickname.trim();
  const normalizedNickname = customerNickname
    ? customerNickname.startsWith("@")
      ? customerNickname
      : `@${customerNickname}`
    : "";
  const lines = [
    "<b>Новая покупка с куратором</b>",
    "",
    `<b>Что купили:</b> ${escapeTelegramHtml(purchaseItem || "—")}`,
    `<b>Сумма:</b> ${escapeTelegramHtml(amountLabel || "—")}`,
    `<b>Язык checkout:</b> ${escapeTelegramHtml(
      `${checkoutLanguageLabel} (${checkoutLocale.toUpperCase()})`,
    )}`,
    `<b>Язык материалов:</b> ${escapeTelegramHtml(lessonLanguageLabel)}`,
    `<b>Email:</b> ${escapeTelegramHtml(paymentRecord.customer_email.trim() || "—")}`,
    `<b>ФИО:</b> ${escapeTelegramHtml(fullName || "—")}`,
    `<b>Telegram:</b> ${escapeTelegramHtml(normalizedNickname || "—")}`,
    `<b>Страна:</b> ${escapeTelegramHtml(countryLabel)}`,
    "",
    `<b>PaymentIntent:</b> <code>${escapeTelegramHtml(
      paymentRecord.payment_intent_id || "—",
    )}</code>`,
    `<b>Checkout session:</b> <code>${escapeTelegramHtml(
      paymentRecord.checkout_session_id || "—",
    )}</code>`,
    `<b>Product ID:</b> <code>${escapeTelegramHtml(paymentRecord.product_id || "—")}</code>`,
    `<b>Offer ID:</b> <code>${escapeTelegramHtml(paymentRecord.offer_id || "—")}</code>`,
    `<b>Stripe Event:</b> <code>${escapeTelegramHtml(eventId)}</code>`,
    `<b>Тип события:</b> ${escapeTelegramHtml(eventType)}`,
    `<b>Время события Stripe (${WARSAW_TIME_ZONE_LABEL}):</b> ${escapeTelegramHtml(
      eventCreatedAtIso,
    )}`,
    `<b>Обработано (${WARSAW_TIME_ZONE_LABEL}):</b> ${escapeTelegramHtml(
      processedAtIso,
    )}`,
  ];

  return lines.join("\n");
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
  const now = toWarsawIso();
  const latestPaymentRecord =
    (await findPaymentRecordByIntentId(paymentRecord.payment_intent_id)) ?? paymentRecord;

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

const updateWithMentorAlertStatus = async ({
  paymentRecord,
  status,
}: {
  paymentRecord: PaymentSheetRecord;
  status: "failed" | "sent";
}) => {
  const now = toWarsawIso();
  const latestPaymentRecord =
    (await findPaymentRecordByIntentId(paymentRecord.payment_intent_id)) ?? paymentRecord;

  await upsertPaymentRecord({
    ...latestPaymentRecord,
    updated_at: now,
    with_mentor_alert_status: status,
    with_mentor_alert_updated_at: now,
  });
};

const tryUpdateWithMentorAlertStatus = async ({
  paymentRecord,
  status,
}: {
  paymentRecord: PaymentSheetRecord;
  status: "failed" | "sent";
}) => {
  try {
    await updateWithMentorAlertStatus({
      paymentRecord,
      status,
    });
  } catch (statusUpdateError) {
    console.error("Failed to update with-mentor alert status", statusUpdateError);
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
  if (event.type !== "payment_intent.succeeded") {
    return;
  }

  if (isProduction && !allowTestModeNotifications && !event.livemode) {
    console.warn("Skipping purchase email for Stripe test-mode event in production", {
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
    return;
  }

  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const paymentIntentId = paymentIntent.id;
  const pendingSync = pendingPurchaseEmailSyncs.get(paymentIntentId);

  if (pendingSync) {
    await pendingSync;
    return;
  }

  const emailSyncPromise = (async () => {
    const paymentRecord =
      (await findPaymentRecordByIntentId(handledEvent.paymentRecord.payment_intent_id)) ??
      handledEvent.paymentRecord;

    if (paymentRecord.email_delivery_status === "sent") {
      return;
    }

    const checkoutLocale = getResolvedCheckoutLocale(
      paymentIntent.metadata.checkout_locale,
    );
    const localizedOfferMetadata = getLocalizedOfferMetadataByOfferId(
      paymentRecord.offer_id,
      checkoutLocale,
    );
    const telegramAccessLink = isOfferEligibleForTelegramBotAccess(paymentRecord.offer_id)
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
      productId: paymentRecord.product_id,
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
      const { emailId } = await sendResendEmail({
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

const sendWithMentorPurchaseAlert = async ({
  event,
  handledEvent,
}: {
  event: Stripe.Event;
  handledEvent: Awaited<ReturnType<typeof syncStripePaymentEventToGoogleSheets>>;
}) => {
  if (
    event.type !== "payment_intent.succeeded" ||
    handledEvent.duplicate ||
    handledEvent.skipped ||
    handledEvent.paymentRecord.outcome !== "succeeded" ||
    handledEvent.paymentRecord.access_workflow !== "with-mentor"
  ) {
    return;
  }

  if (isProduction && !allowTestModeNotifications && !event.livemode) {
    console.warn(
      "Skipping with-mentor Telegram alert for Stripe test-mode event in production",
      {
        eventId: handledEvent.eventId,
        paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
      },
    );
    return;
  }

  if (!isTelegramAlertsConfigured()) {
    console.warn("Telegram alerts are not configured for with-mentor purchases", {
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
  const pendingSync = pendingWithMentorAlertSyncs.get(paymentIntentId);

  if (pendingSync) {
    await pendingSync;
    return;
  }

  const alertSyncPromise = (async () => {
    const latestPaymentRecord =
      (await findPaymentRecordByIntentId(paymentIntentId)) ?? handledEvent.paymentRecord;

    if (latestPaymentRecord.with_mentor_alert_status === "sent") {
      return;
    }

    const alertText = buildWithMentorPurchaseAlertText({
      eventCreatedAtIso: toWarsawIso(event.created * 1000),
      eventId: handledEvent.eventId,
      eventType: handledEvent.eventType,
      paymentRecord: latestPaymentRecord,
      processedAtIso: toWarsawIso(),
    });

    try {
      await sendTelegramMessage({
        botToken: alertsBotToken,
        chatId: alertsChatId,
        disableWebPagePreview: true,
        parseMode: "HTML",
        text: alertText,
      });

      console.warn("Sent with-mentor purchase alert to Telegram group", {
        eventId: handledEvent.eventId,
        paymentIntentId,
      });

      await tryUpdateWithMentorAlertStatus({
        paymentRecord: latestPaymentRecord,
        status: "sent",
      });
    } catch (error) {
      console.error("Failed to send with-mentor purchase alert", {
        error,
        eventId: handledEvent.eventId,
        paymentIntentId,
      });

      await tryUpdateWithMentorAlertStatus({
        paymentRecord: latestPaymentRecord,
        status: "failed",
      });
    }
  })().finally(() => {
    pendingWithMentorAlertSyncs.delete(paymentIntentId);
  });

  pendingWithMentorAlertSyncs.set(paymentIntentId, alertSyncPromise);
  await alertSyncPromise;
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

  try {
    await ensureGoogleSheetsSchema();
  } catch (error) {
    console.error("Failed to ensure Google Sheets schema", error);

    return jsonNoStore(
      {
        errorCode: "google_sheets_schema_sync_failed",
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

    const handledEvent = await syncStripePaymentEventToGoogleSheets(event);

    await sendPurchaseSuccessEmail({
      event,
      handledEvent,
      stripe,
    });
    await sendWithMentorPurchaseAlert({
      event,
      handledEvent,
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
