import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import { getDatabase } from "@/db/client";
import { findPaymentRecordByIntentIdFromDatabase } from "@/db/payment-records";
import { stripeEvents } from "@/db/schema";
import type { ClaimedOutboxJob, OutboxDeliveryResult } from "@/db/transactional-outbox";
import { appendSuccessfulCustomerRecord } from "@/lib/google-sheets";

import { deliverPurchaseSuccessEmailFromOutbox } from "./side-effects/purchase-email";
import { deliverPurchaseAlertFromOutbox } from "./side-effects/purchase-telegram-alert";
import type { StripeWebhookSyncResult } from "./side-effects/types";

export const STRIPE_OUTBOX_KINDS = [
  "purchase_success_email",
  "admin_telegram_alert",
  "successful_customer_export",
] as const;

class NonRetryableOutboxDeliveryError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "NonRetryableOutboxDeliveryError";
  }
}

const requirePayloadString = (
  payload: Record<string, unknown>,
  field: string,
): string => {
  const value = payload[field];
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  if (!normalizedValue) {
    throw new NonRetryableOutboxDeliveryError(`outbox_${field}_required`);
  }

  return normalizedValue;
};

const getPurchaseItemLabel = (paymentRecord: StripeWebhookSyncResult["paymentRecord"]) =>
  paymentRecord.purchase_item.trim() ||
  [paymentRecord.product_title.trim(), paymentRecord.offer_label.trim()]
    .filter(Boolean)
    .join(" — ");

const getCustomerFullAddress = (
  paymentRecord: StripeWebhookSyncResult["paymentRecord"],
) =>
  [
    paymentRecord.customer_address.trim(),
    paymentRecord.customer_city.trim(),
    paymentRecord.customer_postal_code.trim(),
  ]
    .filter(Boolean)
    .join(", ");

const loadDeliveryContext = async (job: ClaimedOutboxJob) => {
  const stripeEventId = requirePayloadString(job.payload, "stripeEventId");
  const paymentIntentId = requirePayloadString(job.payload, "paymentIntentId");
  const [eventRow, paymentRecord] = await Promise.all([
    getDatabase()
      .select({
        eventType: stripeEvents.eventType,
        payload: stripeEvents.payload,
        providerPayloadVerified: stripeEvents.providerPayloadVerified,
      })
      .from(stripeEvents)
      .where(eq(stripeEvents.stripeEventId, stripeEventId))
      .limit(1)
      .then(([row]) => row ?? null),
    findPaymentRecordByIntentIdFromDatabase(paymentIntentId),
  ]);

  if (!eventRow?.providerPayloadVerified) {
    throw new NonRetryableOutboxDeliveryError("outbox_verified_event_missing");
  }

  if (!paymentRecord) {
    throw new Error("outbox_payment_projection_missing");
  }

  const event = eventRow.payload as unknown as Stripe.Event;

  if (event.id !== stripeEventId || event.type !== eventRow.eventType) {
    throw new NonRetryableOutboxDeliveryError("outbox_event_evidence_mismatch");
  }

  const handledEvent: StripeWebhookSyncResult = {
    duplicate: false,
    eventId: event.id,
    eventType: event.type,
    paymentRecord,
    received: true,
    skipped: false,
  };

  return { event, handledEvent, paymentIntentId, paymentRecord };
};

export const deliverStripeOutboxJob = async ({
  job,
  stripe,
}: {
  job: ClaimedOutboxJob;
  stripe: Stripe;
}): Promise<OutboxDeliveryResult> => {
  const context = await loadDeliveryContext(job);

  if (job.kind === "purchase_success_email") {
    const providerIdempotencyKey =
      typeof job.payload.providerIdempotencyKey === "string"
        ? job.payload.providerIdempotencyKey.trim()
        : "";

    return deliverPurchaseSuccessEmailFromOutbox({
      event: context.event,
      idempotencyKey: providerIdempotencyKey || job.deduplicationKey,
      paymentRecord: context.paymentRecord,
      stripe,
    });
  }

  if (job.kind === "admin_telegram_alert") {
    return deliverPurchaseAlertFromOutbox({
      event: context.event,
      handledEvent: context.handledEvent,
    });
  }

  if (job.kind === "successful_customer_export") {
    await appendSuccessfulCustomerRecord(
      {
        customer_country: context.paymentRecord.customer_country,
        customer_email: context.paymentRecord.customer_email,
        customer_full_address: getCustomerFullAddress(context.paymentRecord),
        customer_full_name: context.paymentRecord.customer_full_name,
        customer_nickname: context.paymentRecord.customer_nickname,
        offer_id: context.paymentRecord.offer_id,
        offer_label: context.paymentRecord.offer_label,
        payment_intent_id: context.paymentIntentId,
        product_id: context.paymentRecord.product_id,
        product_title: context.paymentRecord.product_title,
        purchase_item: getPurchaseItemLabel(context.paymentRecord),
      },
      { mirrorToDatabase: false },
    );

    return {};
  }

  throw new NonRetryableOutboxDeliveryError("unsupported_stripe_outbox_kind");
};
