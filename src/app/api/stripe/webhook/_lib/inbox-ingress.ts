import type Stripe from "stripe";

import {
  recordVerifiedStripeEvent,
  type StripeInboxReceipt,
  type VerifiedStripeInboxEvent,
} from "@/db/stripe-event-inbox";

type RecordVerifiedStripeEvent = (
  event: VerifiedStripeInboxEvent,
) => Promise<StripeInboxReceipt>;

export const toVerifiedStripeInboxEvent = ({
  event,
  receivedAt = new Date(),
}: {
  event: Stripe.Event;
  receivedAt?: Date;
}): VerifiedStripeInboxEvent => ({
  apiVersion: event.api_version ?? null,
  eventType: event.type,
  livemode: event.livemode,
  payload: event as unknown as Record<string, unknown>,
  receivedAt,
  stripeCreatedAt: new Date(event.created * 1000),
  stripeEventId: event.id,
});

export const persistVerifiedStripeWebhookEvent = async ({
  event,
  receivedAt,
  record = recordVerifiedStripeEvent,
}: {
  event: Stripe.Event;
  receivedAt?: Date;
  record?: RecordVerifiedStripeEvent;
}): Promise<StripeInboxReceipt> =>
  record(
    toVerifiedStripeInboxEvent({
      event,
      receivedAt,
    }),
  );
