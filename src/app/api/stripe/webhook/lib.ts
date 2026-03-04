import type Stripe from "stripe";

import {
  appendStripeEventRecord,
  findPaymentRecordByIntentId,
  findStripeEventRecordByEventId,
  type PaymentSheetRecord,
} from "@/lib/google-sheets";
import { upsertPaymentRecord } from "@/lib/google-sheets";

import { getManagedPaymentIntentSnapshot } from "../payment-intent/lib";

const SUPPORTED_PAYMENT_INTENT_EVENT_TYPES = new Set([
  "payment_intent.canceled",
  "payment_intent.payment_failed",
  "payment_intent.processing",
  "payment_intent.requires_action",
  "payment_intent.succeeded",
]);
const pendingStripeWebhookSyncs = new Map<string, Promise<StripePaymentWebhookResult>>();

type StripePaymentWebhookResult = {
  duplicate: boolean;
  eventId: string;
  eventType: string;
  paymentRecord: PaymentSheetRecord;
  received: true;
};

const mapPaymentIntentToPaymentRecord = (
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent,
) => {
  const snapshot = getManagedPaymentIntentSnapshot(paymentIntent);
  const existingRecordPromise = findPaymentRecordByIntentId(paymentIntent.id);

  return existingRecordPromise.then((existingRecord) => {
    const timestamp = new Date().toISOString();

    return {
      amount: String(snapshot.amount),
      checkout_currency: paymentIntent.metadata.checkout_currency ?? "",
      currency: snapshot.currency,
      customer_country: paymentIntent.metadata.customer_country ?? "",
      customer_email: paymentIntent.receipt_email ?? "",
      customer_last_name: paymentIntent.metadata.customer_last_name ?? "",
      customer_name: paymentIntent.metadata.customer_name ?? "",
      customer_nickname: paymentIntent.metadata.customer_nickname ?? "",
      checkout_session_id: paymentIntent.metadata.checkout_session_id ?? "",
      first_seen_at: existingRecord?.first_seen_at || timestamp,
      last_payment_error_code: snapshot.lastPaymentErrorCode ?? "",
      last_payment_error_message: snapshot.lastPaymentErrorMessage ?? "",
      latest_event_id: event.id,
      latest_event_type: event.type,
      offer_id: paymentIntent.metadata.offer_id ?? "",
      offer_label: paymentIntent.metadata.offer_label ?? "",
      outcome: snapshot.outcome,
      payment_intent_id: snapshot.paymentIntentId,
      product_id: paymentIntent.metadata.product_id ?? "",
      product_title: paymentIntent.metadata.product_title ?? "",
      status: snapshot.status,
      updated_at: timestamp,
    } satisfies PaymentSheetRecord;
  });
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
  const existingEvent = await findStripeEventRecordByEventId(event.id);
  const paymentRecord = await mapPaymentIntentToPaymentRecord(event, paymentIntent);

  if (existingEvent) {
    return {
      duplicate: true,
      eventId: event.id,
      eventType: event.type,
      paymentRecord,
      received: true,
    };
  }

  const savedPaymentRecord = await upsertPaymentRecord(paymentRecord);

  await appendStripeEventRecord({
    event_id: event.id,
    event_type: event.type,
    outcome: savedPaymentRecord.outcome,
    payment_intent_id: savedPaymentRecord.payment_intent_id,
    processed_at: new Date().toISOString(),
    status: savedPaymentRecord.status,
  });

  return {
    duplicate: false,
    eventId: event.id,
    eventType: event.type,
    paymentRecord: savedPaymentRecord,
    received: true,
  };
};
