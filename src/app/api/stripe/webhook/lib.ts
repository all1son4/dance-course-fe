import type Stripe from "stripe";

import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";
import {
  appendStripeEventRecord,
  appendSuccessfulCustomerRecord,
  findPaymentRecordByIntentId,
  findStripeEventRecordByEventId,
  type PaymentSheetRecord,
  upsertPaymentRecord,
} from "@/lib/google-sheets";
import { getLocalizedOfferMetadataByOfferId } from "@/lib/sellable-products-localization";
import { toWarsawIso } from "@/lib/time";

import { getManagedPaymentIntentSnapshot } from "../payment-intent/lib";

const SUPPORTED_PAYMENT_INTENT_EVENT_TYPES = new Set([
  "payment_intent.canceled",
  "payment_intent.payment_failed",
  "payment_intent.processing",
  "payment_intent.requires_action",
  "payment_intent.succeeded",
]);
const pendingStripeWebhookSyncs = new Map<string, Promise<StripePaymentWebhookResult>>();
const WITH_MENTOR_OFFER_IDS = new Set(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.offers
      .filter((offer) => offer.code === "with-mentor")
      .map((offer) => offer.id),
  ),
);
const WITHOUT_MENTOR_OFFER_IDS = new Set(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.offers
      .filter((offer) => offer.code === "without-mentor")
      .map((offer) => offer.id),
  ),
);

type StripePaymentWebhookResult = {
  duplicate: boolean;
  eventId: string;
  eventType: string;
  paymentRecord: PaymentSheetRecord;
  received: true;
  skipped: boolean;
};

const getPurchaseItemLabel = (paymentRecord: PaymentSheetRecord) => {
  const productTitle = paymentRecord.product_title.trim();
  const offerLabel = paymentRecord.offer_label.trim();

  if (productTitle && offerLabel) {
    return `${productTitle} — ${offerLabel}`;
  }

  if (productTitle) {
    return productTitle;
  }

  return offerLabel;
};

const buildPurchaseItemLabel = (productTitle: string, offerLabel: string) => {
  const normalizedProductTitle = productTitle.trim();
  const normalizedOfferLabel = offerLabel.trim();

  if (normalizedProductTitle && normalizedOfferLabel) {
    return `${normalizedProductTitle} — ${normalizedOfferLabel}`;
  }

  return normalizedProductTitle || normalizedOfferLabel;
};

const getAccessWorkflowByOfferId = (offerId: string) => {
  if (WITHOUT_MENTOR_OFFER_IDS.has(offerId)) {
    return "telegram-bot";
  }

  if (WITH_MENTOR_OFFER_IDS.has(offerId)) {
    return "with-mentor";
  }

  return "telegram-channel";
};

const mapPaymentIntentToPaymentRecord = (
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent,
  existingRecord: PaymentSheetRecord | null,
) => {
  const snapshot = getManagedPaymentIntentSnapshot(paymentIntent);
  const timestamp = toWarsawIso();
  const offerId = paymentIntent.metadata.offer_id ?? "";
  const localizedOfferMetadata = getLocalizedOfferMetadataByOfferId(
    offerId,
    paymentIntent.metadata.checkout_locale,
  );
  const offerLabel =
    paymentIntent.metadata.offer_label ?? localizedOfferMetadata?.offerLabel ?? "";
  const productId =
    paymentIntent.metadata.product_id ?? localizedOfferMetadata?.productId ?? "";
  const productTitle =
    paymentIntent.metadata.product_title ?? localizedOfferMetadata?.productTitle ?? "";
  const customerFullName =
    paymentIntent.metadata.customer_full_name ?? existingRecord?.customer_full_name ?? "";
  const accessWorkflow = getAccessWorkflowByOfferId(offerId);
  const deliveryChannel = accessWorkflow === "with-mentor" ? "manual" : "telegram";
  const telegramAccessStatus =
    accessWorkflow === "with-mentor" ? "not_required" : "pending";

  return {
    amount: String(snapshot.amount),
    checkout_currency: paymentIntent.metadata.checkout_currency ?? "",
    currency: snapshot.currency,
    customer_country: paymentIntent.metadata.customer_country ?? "",
    customer_email: paymentIntent.receipt_email ?? "",
    customer_full_name: customerFullName,
    customer_nickname: paymentIntent.metadata.customer_nickname ?? "",
    checkout_session_id: paymentIntent.metadata.checkout_session_id ?? "",
    delivery_channel: existingRecord?.delivery_channel || deliveryChannel,
    access_workflow: existingRecord?.access_workflow || accessWorkflow,
    email_delivery_status: existingRecord?.email_delivery_status ?? "",
    email_delivery_updated_at: existingRecord?.email_delivery_updated_at ?? "",
    first_seen_at: existingRecord?.first_seen_at || timestamp,
    last_payment_error_code: snapshot.lastPaymentErrorCode ?? "",
    last_payment_error_message: snapshot.lastPaymentErrorMessage ?? "",
    latest_event_id: event.id,
    latest_event_type: event.type,
    offer_id: offerId,
    offer_label: offerLabel,
    outcome: snapshot.outcome,
    payment_intent_id: snapshot.paymentIntentId,
    product_id: productId,
    product_title: productTitle,
    lesson_language:
      paymentIntent.metadata.lesson_language ?? existingRecord?.lesson_language ?? "",
    checkout_locale: paymentIntent.metadata.checkout_locale ?? "",
    purchase_item:
      existingRecord?.purchase_item || buildPurchaseItemLabel(productTitle, offerLabel),
    successful_customer_logged_at: existingRecord?.successful_customer_logged_at ?? "",
    telegram_access_status:
      existingRecord?.telegram_access_status || telegramAccessStatus,
    telegram_token_expires_at: existingRecord?.telegram_token_expires_at ?? "",
    telegram_token_id: existingRecord?.telegram_token_id ?? "",
    telegram_token_used_at: existingRecord?.telegram_token_used_at ?? "",
    telegram_user_id: existingRecord?.telegram_user_id ?? "",
    telegram_username: existingRecord?.telegram_username ?? "",
    status: snapshot.status,
    updated_at: timestamp,
    with_mentor_alert_status: existingRecord?.with_mentor_alert_status ?? "",
    with_mentor_alert_updated_at: existingRecord?.with_mentor_alert_updated_at ?? "",
  } satisfies PaymentSheetRecord;
};

export const isSupportedStripePaymentIntentEvent = (eventType: string) =>
  SUPPORTED_PAYMENT_INTENT_EVENT_TYPES.has(eventType);

export const syncStripePaymentEventToGoogleSheets = async (
  event: Stripe.Event,
): Promise<StripePaymentWebhookResult> => {
  const pendingSync = pendingStripeWebhookSyncs.get(event.id);

  if (pendingSync) {
    const result = await pendingSync;

    return {
      ...result,
      duplicate: true,
    };
  }

  const syncPromise = syncStripePaymentEventToGoogleSheetsInternal(event).finally(() => {
    pendingStripeWebhookSyncs.delete(event.id);
  });

  pendingStripeWebhookSyncs.set(event.id, syncPromise);

  return syncPromise;
};

const syncStripePaymentEventToGoogleSheetsInternal = async (
  event: Stripe.Event,
): Promise<StripePaymentWebhookResult> => {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const [existingEvent, existingPaymentRecord] = await Promise.all([
    findStripeEventRecordByEventId(event.id),
    findPaymentRecordByIntentId(paymentIntent.id),
  ]);
  const paymentRecord = mapPaymentIntentToPaymentRecord(
    event,
    paymentIntent,
    existingPaymentRecord,
  );

  if (existingEvent) {
    return {
      duplicate: true,
      eventId: event.id,
      eventType: event.type,
      paymentRecord,
      received: true,
      skipped: false,
    };
  }

  if (event.type === "payment_intent.canceled" && !existingPaymentRecord) {
    // Ignore auto-canceled unused intents in Payments sheet.
    await appendStripeEventRecord({
      event_id: event.id,
      event_type: event.type,
      outcome: paymentRecord.outcome,
      payment_intent_id: paymentRecord.payment_intent_id,
      processed_at: toWarsawIso(),
      status: paymentRecord.status,
    });

    return {
      duplicate: false,
      eventId: event.id,
      eventType: event.type,
      paymentRecord,
      received: true,
      skipped: true,
    };
  }

  let savedPaymentRecord = await upsertPaymentRecord(paymentRecord);

  if (
    savedPaymentRecord.outcome === "succeeded" &&
    !savedPaymentRecord.successful_customer_logged_at
  ) {
    await appendSuccessfulCustomerRecord({
      payment_intent_id: savedPaymentRecord.payment_intent_id,
      customer_country: savedPaymentRecord.customer_country,
      customer_email: savedPaymentRecord.customer_email,
      customer_full_name: savedPaymentRecord.customer_full_name,
      customer_nickname: savedPaymentRecord.customer_nickname,
      purchase_item: getPurchaseItemLabel(savedPaymentRecord),
      product_id: savedPaymentRecord.product_id,
      product_title: savedPaymentRecord.product_title,
      offer_id: savedPaymentRecord.offer_id,
      offer_label: savedPaymentRecord.offer_label,
    });
    savedPaymentRecord = await upsertPaymentRecord({
      ...savedPaymentRecord,
      successful_customer_logged_at: toWarsawIso(),
    });
  }

  await appendStripeEventRecord({
    event_id: event.id,
    event_type: event.type,
    outcome: savedPaymentRecord.outcome,
    payment_intent_id: savedPaymentRecord.payment_intent_id,
    processed_at: toWarsawIso(),
    status: savedPaymentRecord.status,
  });

  return {
    duplicate: false,
    eventId: event.id,
    eventType: event.type,
    paymentRecord: savedPaymentRecord,
    received: true,
    skipped: false,
  };
};
