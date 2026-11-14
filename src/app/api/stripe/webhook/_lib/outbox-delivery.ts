import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import { getDatabase } from "@/db/client";
import { findPaymentRecordByIntentIdFromDatabase } from "@/db/payment-records";
import { stripeEvents } from "@/db/schema";
import {
  type ClaimedOutboxJob,
  findPurchaseOutboxJobState,
  type OutboxDeliveryResult,
} from "@/db/transactional-outbox";

import { deliverPurchaseAccessFromOutbox } from "./side-effects/purchase-access";
import { deliverPurchaseSuccessEmailFromOutbox } from "./side-effects/purchase-email";
import { deliverPurchaseAlertFromOutbox } from "./side-effects/purchase-telegram-alert";
import type { StripeWebhookSyncResult } from "./side-effects/types";

// The registry order is also the delivery order: access, then email, then alert.
export const STRIPE_OUTBOX_KINDS = [
  "telegram_access_delivery",
  "purchase_success_email",
  "admin_telegram_alert",
] as const;

const UNFINISHED_JOB_STATUSES = new Set(["pending", "sending", "failed"]);

/**
 * The purchase email waits until the access job of the same purchase is final. A
 * rejected access job lets the email go: the purchase stands and the alert names
 * the reason.
 */
const waitForPurchaseAccessJob = async (purchaseId: string | null) => {
  if (!purchaseId) return;

  const accessJob = await findPurchaseOutboxJobState(
    purchaseId,
    "telegram_access_delivery",
  );

  if (accessJob && UNFINISHED_JOB_STATUSES.has(accessJob.status)) {
    throw new Error("purchase_email_waiting_for_access_delivery");
  }
};

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

  if (job.kind === "telegram_access_delivery") {
    return deliverPurchaseAccessFromOutbox({
      event: context.event,
      paymentRecord: context.paymentRecord,
      purchaseId: job.purchaseId,
      stripe,
    });
  }

  if (job.kind === "purchase_success_email") {
    await waitForPurchaseAccessJob(job.purchaseId);

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
      purchaseId: job.purchaseId,
    });
  }

  throw new NonRetryableOutboxDeliveryError("unsupported_stripe_outbox_kind");
};
