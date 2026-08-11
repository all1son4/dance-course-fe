import assert from "node:assert/strict";
import test from "node:test";

import type Stripe from "stripe";

import {
  persistVerifiedStripeWebhookEvent,
  toVerifiedStripeInboxEvent,
} from "./inbox-ingress";

const createStripeEvent = (): Stripe.Event =>
  ({
    api_version: "2026-07-29.basil",
    created: 1_786_457_540,
    data: {
      object: {
        id: "cus_write01",
        object: "customer",
      },
    },
    id: "evt_write01",
    livemode: false,
    object: "event",
    pending_webhooks: 1,
    request: {
      id: null,
      idempotency_key: null,
    },
    type: "customer.created",
  }) as Stripe.Event;

test("maps verified Stripe evidence into an immutable inbox command", () => {
  const event = createStripeEvent();
  const receivedAt = new Date("2026-08-11T14:10:00.000Z");
  const inboxEvent = toVerifiedStripeInboxEvent({ event, receivedAt });

  assert.deepEqual(inboxEvent, {
    apiVersion: "2026-07-29.basil",
    eventType: "customer.created",
    livemode: false,
    payload: event,
    receivedAt,
    stripeCreatedAt: new Date("2026-08-11T14:12:20.000Z"),
    stripeEventId: "evt_write01",
  });
});

test("awaits durable persistence and returns its duplicate-safe receipt", async () => {
  const event = createStripeEvent();
  const receivedAt = new Date("2026-08-11T14:10:00.000Z");
  const recordedEvents: unknown[] = [];

  const receipt = await persistVerifiedStripeWebhookEvent({
    event,
    receivedAt,
    record: async (inboxEvent) => {
      recordedEvents.push(inboxEvent);

      return {
        duplicate: false,
        id: "inbox-row",
        processingStatus: "pending",
      };
    },
  });

  assert.equal(recordedEvents.length, 1);
  assert.equal((recordedEvents[0] as { stripeEventId: string }).stripeEventId, event.id);
  assert.deepEqual(receipt, {
    duplicate: false,
    id: "inbox-row",
    processingStatus: "pending",
  });
});

test("does not swallow an inbox persistence failure", async () => {
  await assert.rejects(
    persistVerifiedStripeWebhookEvent({
      event: createStripeEvent(),
      record: async () => {
        throw new Error("database unavailable");
      },
    }),
    /database unavailable/u,
  );
});
