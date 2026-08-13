import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";
import type Stripe from "stripe";

import { processNextStripeWebhookInboxJob } from "@/app/api/stripe/webhook/_lib/inbox-worker";
import { deliverStripeOutboxJob } from "@/app/api/stripe/webhook/_lib/outbox-delivery";
import { getDatabaseClient } from "@/db/client";
import { recordVerifiedStripeEvent } from "@/db/stripe-event-inbox";
import { processNextOutboxJob } from "@/db/transactional-outbox";
import { deliverSheetsExportOutboxJob } from "@/lib/sheets-export-outbox";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, {
  max: 4,
  prepare: false,
});
const applicationClient = getDatabaseClient();

const restoreEnvironmentVariable = (name: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
};

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const createSucceededEvent = ({
  eventId,
  paymentIntentId,
}: {
  eventId: string;
  paymentIntentId: string;
}) =>
  ({
    api_version: "2026-07-29.basil",
    created: 1_786_457_540,
    data: {
      object: {
        amount: 5_000,
        created: 1_786_457_500,
        currency: "eur",
        description: "WRITE-02 integration purchase",
        id: paymentIntentId,
        last_payment_error: null,
        latest_charge: `ch_${paymentIntentId}`,
        livemode: false,
        metadata: {
          checkout_currency: "eur",
          checkout_locale: "en",
          checkout_session_id: `checkout_${paymentIntentId}`,
          customer_address: "Test street 1",
          customer_city: "Warsaw",
          customer_country: "PL",
          customer_full_name: "Integration Test",
          customer_nickname: "write02test",
          customer_postal_code: "00-001",
          lesson_language: "en",
          offer_id: "off_4BcM9pR6tH1x",
          offer_label: "Standard access",
          product_id: "prd_7VnL4kX2mQ8s",
          product_title: "First Touch",
        },
        object: "payment_intent",
        receipt_email: "write02@example.test",
        status: "succeeded",
      },
    },
    id: eventId,
    livemode: false,
    object: "event",
    pending_webhooks: 1,
    request: {
      id: null,
      idempotency_key: null,
    },
    type: "payment_intent.succeeded",
  }) as unknown as Stripe.Event;

const createStripeFixture = (paymentIntentId: string) =>
  ({
    paymentIntents: {
      retrieve: async () => ({
        id: paymentIntentId,
        latest_charge: {
          balance_transaction: {
            amount: 5_000,
            currency: "eur",
            exchange_rate: null,
            fee: 150,
            id: `txn_${paymentIntentId}`,
            net: 4_850,
          },
        },
      }),
    },
  }) as unknown as Stripe;

test("projects a verified success and its three outbox jobs atomically", async () => {
  const runId = randomUUID();
  const eventId = `evt_write02_${runId}`;
  const paymentIntentId = `pi_write02_${runId}`;
  const event = createSucceededEvent({ eventId, paymentIntentId });

  try {
    await recordVerifiedStripeEvent({
      apiVersion: event.api_version ?? null,
      eventType: event.type,
      livemode: event.livemode,
      payload: event as unknown as Record<string, unknown>,
      stripeCreatedAt: new Date(event.created * 1_000),
      stripeEventId: event.id,
    });

    const stripe = createStripeFixture(paymentIntentId);
    const result = await processNextStripeWebhookInboxJob({
      eventTypes: [event.type],
      stripe,
    });
    const emailDelivery = await processNextOutboxJob({
      deliver: (job) => deliverStripeOutboxJob({ job, stripe }),
      kinds: ["purchase_success_email"],
    });
    const alertDelivery = await processNextOutboxJob({
      deliver: (job) => deliverStripeOutboxJob({ job, stripe }),
      kinds: ["admin_telegram_alert"],
    });
    const [stored] = await client<
      {
        event_status: string;
        outcome: string;
        outbox_count: number;
        pending_count: number;
        skipped_count: number;
        versioned_count: number;
      }[]
    >`
      SELECT
        event.processing_status AS event_status,
        purchase.outcome,
        count(effect.id)::int AS outbox_count,
        count(effect.id) FILTER (WHERE effect.status = 'pending')::int
          AS pending_count,
        count(effect.id) FILTER (WHERE effect.status = 'skipped')::int
          AS skipped_count,
        count(effect.id) FILTER (
          WHERE effect.payload @> '{"_outboxVersion":1}'::jsonb
        )::int AS versioned_count
      FROM stripe_events event
      JOIN purchases purchase ON purchase.id = event.purchase_id
      LEFT JOIN purchase_side_effects effect ON effect.purchase_id = purchase.id
      WHERE event.stripe_event_id = ${eventId}
      GROUP BY event.processing_status, purchase.outcome
    `;

    assert.equal(result.status, "processed");
    assert.equal(emailDelivery.status, "skipped");
    assert.equal(alertDelivery.status, "skipped");
    assert.deepEqual(stored, {
      event_status: "processed",
      outcome: "succeeded",
      outbox_count: 3,
      pending_count: 1,
      skipped_count: 2,
      versioned_count: 3,
    });
  } finally {
    await client`
      DELETE FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id = ${paymentIntentId}
    `;
  }
});

test("marks unsupported verified events skipped instead of growing the queue", async () => {
  const eventId = `evt_write02_skipped_${randomUUID()}`;
  const event = {
    api_version: "2026-07-29.basil",
    created: 1_786_457_540,
    data: { object: { id: "cus_write02", object: "customer" } },
    id: eventId,
    livemode: false,
    object: "event",
    type: `write02.unsupported.${randomUUID()}`,
  } as unknown as Stripe.Event;

  try {
    await recordVerifiedStripeEvent({
      apiVersion: event.api_version ?? null,
      eventType: event.type,
      livemode: event.livemode,
      payload: event as unknown as Record<string, unknown>,
      stripeCreatedAt: new Date(event.created * 1_000),
      stripeEventId: event.id,
    });

    const result = await processNextStripeWebhookInboxJob({
      eventTypes: [event.type],
      stripe: createStripeFixture("pi_unused"),
    });
    const [stored] = await client<{ processing_status: string }[]>`
      SELECT processing_status
      FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;

    assert.equal(result.status, "skipped");
    assert.equal(stored?.processing_status, "skipped");
  } finally {
    await client`
      DELETE FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;
  }
});

test("isolates a blocked Sheets API from the completed purchase workflow", async (t) => {
  const previousExportMode = process.env.DB_SHEETS_EXPORT_MODE;
  const runId = randomUUID();
  const eventId = `evt_write07_blocked_${runId}`;
  const paymentIntentId = `pi_write07_blocked_${runId}`;
  const event = createSucceededEvent({ eventId, paymentIntentId });
  let exportedProjection: Record<string, string> | null = null;

  process.env.DB_SHEETS_EXPORT_MODE = "legacy";
  t.after(() => {
    restoreEnvironmentVariable("DB_SHEETS_EXPORT_MODE", previousExportMode);
  });

  try {
    await recordVerifiedStripeEvent({
      apiVersion: event.api_version ?? null,
      eventType: event.type,
      livemode: event.livemode,
      payload: event as unknown as Record<string, unknown>,
      stripeCreatedAt: new Date(event.created * 1_000),
      stripeEventId: event.id,
    });

    const stripe = createStripeFixture(paymentIntentId);
    const inboxResult = await processNextStripeWebhookInboxJob({
      eventTypes: [event.type],
      stripe,
    });
    const emailDelivery = await processNextOutboxJob({
      deliver: (job) => deliverStripeOutboxJob({ job, stripe }),
      kinds: ["purchase_success_email"],
    });
    const alertDelivery = await processNextOutboxJob({
      deliver: (job) => deliverStripeOutboxJob({ job, stripe }),
      kinds: ["admin_telegram_alert"],
    });
    const exportDelivery = await processNextOutboxJob({
      deliver: (job) =>
        deliverSheetsExportOutboxJob(job, {
          appendSuccessfulCustomer: async (projection) => {
            exportedProjection = projection;
            throw new Error("blocked_google_sheets_api");
          },
          environment: { DB_SHEETS_EXPORT_MODE: "legacy" },
        }),
      kinds: ["successful_customer_export"],
    });
    const [stored] = await client<
      {
        eventStatus: string;
        exportStatus: string;
        otherSideEffectsFinal: number;
        outcome: string;
      }[]
    >`
      SELECT
        max(event.processing_status) AS "eventStatus",
        max(effect.status) FILTER (
          WHERE effect.kind = 'successful_customer_export'
        ) AS "exportStatus",
        count(effect.id) FILTER (
          WHERE effect.kind IN ('purchase_success_email', 'admin_telegram_alert')
            AND effect.status IN ('sent', 'skipped')
        )::int AS "otherSideEffectsFinal",
        max(purchase.outcome) AS outcome
      FROM stripe_events event
      JOIN purchases purchase ON purchase.id = event.purchase_id
      JOIN purchase_side_effects effect ON effect.purchase_id = purchase.id
      WHERE event.stripe_event_id = ${eventId}
    `;

    assert.equal(inboxResult.status, "processed");
    assert.equal(emailDelivery.status, "skipped");
    assert.equal(alertDelivery.status, "skipped");
    assert.equal(exportDelivery.status, "retry");
    assert.deepEqual(stored, {
      eventStatus: "processed",
      exportStatus: "failed",
      otherSideEffectsFinal: 2,
      outcome: "succeeded",
    });
    assert.deepEqual(Object.keys(exportedProjection ?? {}).sort(), [
      "customer_country",
      "customer_email",
      "customer_full_address",
      "customer_full_name",
      "customer_nickname",
      "offer_id",
      "offer_label",
      "payment_intent_id",
      "product_id",
      "product_title",
      "purchase_item",
    ]);
  } finally {
    await client`
      DELETE FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id = ${paymentIntentId}
    `;
  }
});

test("does not enqueue a Sheets export after the sink is retired", async (t) => {
  const previousExportMode = process.env.DB_SHEETS_EXPORT_MODE;
  const runId = randomUUID();
  const eventId = `evt_write07_retired_${runId}`;
  const paymentIntentId = `pi_write07_retired_${runId}`;
  const event = createSucceededEvent({ eventId, paymentIntentId });

  process.env.DB_SHEETS_EXPORT_MODE = "database";
  t.after(() => {
    restoreEnvironmentVariable("DB_SHEETS_EXPORT_MODE", previousExportMode);
  });

  try {
    await recordVerifiedStripeEvent({
      apiVersion: event.api_version ?? null,
      eventType: event.type,
      livemode: event.livemode,
      payload: event as unknown as Record<string, unknown>,
      stripeCreatedAt: new Date(event.created * 1_000),
      stripeEventId: event.id,
    });

    const result = await processNextStripeWebhookInboxJob({
      eventTypes: [event.type],
      stripe: createStripeFixture(paymentIntentId),
    });
    const [stored] = await client<
      { exportCount: number; outboxCount: number; outcome: string }[]
    >`
      SELECT
        count(effect.id) FILTER (
          WHERE effect.kind = 'successful_customer_export'
        )::int AS "exportCount",
        count(effect.id)::int AS "outboxCount",
        max(purchase.outcome) AS outcome
      FROM stripe_events event
      JOIN purchases purchase ON purchase.id = event.purchase_id
      LEFT JOIN purchase_side_effects effect ON effect.purchase_id = purchase.id
      WHERE event.stripe_event_id = ${eventId}
    `;

    assert.equal(result.status, "processed");
    assert.deepEqual(stored, {
      exportCount: 0,
      outboxCount: 2,
      outcome: "succeeded",
    });
  } finally {
    await client`
      DELETE FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id = ${paymentIntentId}
    `;
  }
});

test("keeps non-payment Checkout Sessions ignored in async mode", async () => {
  const eventId = `evt_write02_checkout_skipped_${randomUUID()}`;
  const event = {
    api_version: "2026-07-29.basil",
    created: 1_786_457_540,
    data: {
      object: {
        id: `cs_write02_${randomUUID()}`,
        mode: "setup",
        object: "checkout.session",
        payment_intent: null,
      },
    },
    id: eventId,
    livemode: false,
    object: "event",
    type: "checkout.session.completed",
  } as unknown as Stripe.Event;

  try {
    await recordVerifiedStripeEvent({
      apiVersion: event.api_version ?? null,
      eventType: event.type,
      livemode: event.livemode,
      payload: event as unknown as Record<string, unknown>,
      stripeCreatedAt: new Date(event.created * 1_000),
      stripeEventId: event.id,
    });

    const result = await processNextStripeWebhookInboxJob({
      eventTypes: [event.type],
      stripe: createStripeFixture("pi_unused"),
    });
    const [stored] = await client<{ processing_status: string }[]>`
      SELECT processing_status
      FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;

    assert.equal(result.status, "skipped");
    assert.equal(stored?.processing_status, "skipped");
  } finally {
    await client`
      DELETE FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;
  }
});

test("enriches a charge settlement through the leased inbox worker", async () => {
  const runId = randomUUID();
  const eventId = `evt_write02_charge_${runId}`;
  const paymentIntentId = `pi_write02_charge_${runId}`;
  const event = {
    api_version: "2026-07-29.basil",
    created: 1_786_457_540,
    data: {
      object: {
        balance_transaction: {
          amount: 6_000,
          currency: "pln",
          exchange_rate: "0.22",
          fee: 180,
          id: `txn_${runId}`,
          net: 5_820,
        },
        id: `ch_${runId}`,
        object: "charge",
        payment_intent: paymentIntentId,
      },
    },
    id: eventId,
    livemode: false,
    object: "event",
    type: "charge.updated",
  } as unknown as Stripe.Event;

  try {
    await client`
      INSERT INTO purchases (
        payment_intent_id,
        amount_minor,
        currency,
        stripe_status,
        outcome
      ) VALUES (
        ${paymentIntentId},
        6000,
        'pln',
        'succeeded',
        'succeeded'
      )
    `;
    await recordVerifiedStripeEvent({
      apiVersion: event.api_version ?? null,
      eventType: event.type,
      livemode: event.livemode,
      payload: event as unknown as Record<string, unknown>,
      stripeCreatedAt: new Date(event.created * 1_000),
      stripeEventId: event.id,
    });

    const result = await processNextStripeWebhookInboxJob({
      eventTypes: [event.type],
      stripe: createStripeFixture(paymentIntentId),
    });
    const [stored] = await client<
      {
        event_status: string;
        settlement_amount_minor: number | null;
        stripe_balance_transaction_id: string | null;
      }[]
    >`
      SELECT
        event.processing_status AS event_status,
        purchase.settlement_amount_minor,
        purchase.stripe_balance_transaction_id
      FROM stripe_events event
      JOIN purchases purchase
        ON purchase.id = event.purchase_id
      WHERE event.stripe_event_id = ${eventId}
    `;

    assert.equal(result.status, "processed");
    assert.deepEqual(stored, {
      event_status: "processed",
      settlement_amount_minor: 6_000,
      stripe_balance_transaction_id: `txn_${runId}`,
    });
  } finally {
    await client`
      DELETE FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id = ${paymentIntentId}
    `;
  }
});
