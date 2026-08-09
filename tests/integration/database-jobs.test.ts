import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import { allocateInvoice } from "@/db/invoice-repository";
import {
  type PaymentProjectionCommand,
  projectPaymentStateInTransaction,
} from "@/db/payment-projection";
import {
  processNextStripeInboxEvent,
  recordVerifiedStripeEvent,
} from "@/db/stripe-event-inbox";
import {
  claimNextOutboxJob,
  enqueueOutboxJob,
  enqueueOutboxJobInTransaction,
  processNextOutboxJob,
} from "@/db/transactional-outbox";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, {
  max: 8,
  prepare: false,
});
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const createPaymentProjection = ({
  eventId,
  outcome,
  outboxKey,
  paymentIntentId,
}: {
  eventId: string;
  outcome: PaymentProjectionCommand["purchase"]["outcome"];
  outboxKey: string;
  paymentIntentId: string;
}): PaymentProjectionCommand => ({
  access: {
    accessKey: "primary",
    accessWorkflow: "telegram-bot",
    currentTokenId: null,
    deliveryChannel: "telegram",
    expiresAt: null,
    externalTargetType: "telegram_bot",
    revokedAt: null,
    startsAt: null,
    status: "pending",
    telegramChatId: null,
    telegramUserId: null,
    telegramUsername: null,
  },
  catalog: {
    offerExternalId: null,
    productExternalId: null,
  },
  customer: {
    addressLine: null,
    city: null,
    country: null,
    email: null,
    fullName: null,
    normalizedEmail: null,
    postalCode: null,
    stripeCustomerId: null,
    telegramUsername: null,
  },
  invoice: null,
  outboxJobs: [
    {
      deduplicationKey: outboxKey,
      kind: "telegram_access_delivery",
      payload: { paymentIntentId },
      provider: "telegram",
    },
  ],
  purchase: {
    amountMinor: 5000,
    checkoutCurrency: "eur",
    checkoutLocale: "en",
    checkoutSessionId: null,
    currency: "eur",
    customerAddressLineSnapshot: null,
    customerCitySnapshot: null,
    customerCountrySnapshot: null,
    customerEmailSnapshot: null,
    customerFullNameSnapshot: null,
    customerPostalCodeSnapshot: null,
    customerTelegramUsernameSnapshot: null,
    firstSeenAt: new Date("2026-08-09T10:00:00.000Z"),
    inspirationChatIdSnapshot: null,
    lastPaymentErrorCode: null,
    lastPaymentErrorMessage: null,
    latestEventId: eventId,
    latestEventType: `payment_intent.${outcome}`,
    lessonLanguage: "en",
    livemode: false,
    offerLabelSnapshot: null,
    outcome,
    paymentIntentId,
    productTitleSnapshot: "DB-04 projection test",
    purchaseItemSnapshot: "DB-04 projection test",
    settlementAmountMinor: outcome === "succeeded" ? 5000 : null,
    settlementCurrency: outcome === "succeeded" ? "eur" : null,
    source: "stripe",
    stripeBalanceTransactionId: outcome === "succeeded" ? `txn_${eventId}` : null,
    stripeExchangeRate: null,
    stripeFeeAmountMinor: outcome === "succeeded" ? 100 : null,
    stripeNetAmountMinor: outcome === "succeeded" ? 4900 : null,
    stripeStatus: outcome,
    succeededAt: outcome === "succeeded" ? new Date("2026-08-09T10:01:00.000Z") : null,
    updatedAt: new Date("2026-08-09T10:02:00.000Z"),
  },
});

test("deduplicates concurrent outbox enqueue and preserves the first payload", async () => {
  const deduplicationKey = `db05:dedupe:${randomUUID()}`;

  try {
    const results = await Promise.all([
      enqueueOutboxJob({
        deduplicationKey,
        kind: "google_sheets_export",
        payload: { marker: "first" },
        provider: "google_sheets",
      }),
      enqueueOutboxJob({
        deduplicationKey,
        kind: "google_sheets_export",
        payload: { marker: "duplicate" },
        provider: "google_sheets",
      }),
    ]);

    assert.equal(results.filter((result) => !result.duplicate).length, 1);
    assert.equal(results.filter((result) => result.duplicate).length, 1);

    const [stored] = await client<{ count: number; marker: string }[]>`
      SELECT
        count(*) OVER ()::int AS count,
        payload ->> 'marker' AS marker
      FROM purchase_side_effects
      WHERE deduplication_key = ${deduplicationKey}
    `;

    assert.equal(stored?.count, 1);
    assert.ok(stored?.marker === "first" || stored?.marker === "duplicate");
  } finally {
    await client`
      DELETE FROM purchase_side_effects
      WHERE deduplication_key = ${deduplicationKey}
    `;
  }
});

test("retries an uncertain outbox response without a second visible delivery", async () => {
  const deduplicationKey = `db05:retry:${randomUUID()}`;
  const providerDeliveries = new Set<string>();
  let callCount = 0;

  try {
    await enqueueOutboxJob({
      deduplicationKey,
      kind: "campaign_email_delivery",
      payload: { campaignKey: "db05-test" },
      provider: "resend",
    });

    const deliver = async (job: { deduplicationKey: string }) => {
      callCount += 1;
      providerDeliveries.add(job.deduplicationKey);

      if (callCount === 1) {
        throw new Error("response_lost_after_provider_acceptance");
      }

      return { externalMessageId: "provider-message-1" };
    };
    const firstAttempt = await processNextOutboxJob({
      deliver,
      kinds: ["campaign_email_delivery"],
    });
    const secondAttempt = await processNextOutboxJob({
      deliver,
      kinds: ["campaign_email_delivery"],
      now: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });

    assert.equal(firstAttempt.status, "retry");
    assert.equal(secondAttempt.status, "sent");
    assert.equal(callCount, 2);
    assert.equal(providerDeliveries.size, 1);

    const [stored] = await client<
      { attemptCount: number; externalMessageId: string | null; status: string }[]
    >`
      SELECT
        attempt_count AS "attemptCount",
        external_message_id AS "externalMessageId",
        status
      FROM purchase_side_effects
      WHERE deduplication_key = ${deduplicationKey}
    `;

    assert.deepEqual(stored, {
      attemptCount: 2,
      externalMessageId: "provider-message-1",
      status: "sent",
    });
  } finally {
    await client`
      DELETE FROM purchase_side_effects
      WHERE deduplication_key = ${deduplicationKey}
    `;
  }
});

test("allows exactly one concurrent worker to claim an outbox job", async () => {
  const deduplicationKey = `db06:claim:${randomUUID()}`;

  try {
    await enqueueOutboxJob({
      deduplicationKey,
      kind: "monthly_report_delivery",
      payload: { reportKey: "db06-test" },
      provider: "resend",
    });

    const claims = await Promise.all(
      Array.from({ length: 8 }, () =>
        claimNextOutboxJob({ kinds: ["monthly_report_delivery"] }),
      ),
    );

    assert.equal(claims.filter((claim) => claim !== null).length, 1);
    assert.equal(claims.find((claim) => claim)?.deduplicationKey, deduplicationKey);
  } finally {
    await client`
      DELETE FROM purchase_side_effects
      WHERE deduplication_key = ${deduplicationKey}
    `;
  }
});

test("commits projection, outbox, and inbox completion atomically", async () => {
  const eventType = `db04.projection.${randomUUID()}`;
  const stripeEventId = `evt_db04_${randomUUID()}`;
  const outboxKey = `db04:projection:${stripeEventId}`;

  try {
    await recordVerifiedStripeEvent({
      apiVersion: "2026-07-29.basil",
      eventType,
      livemode: false,
      payload: { id: stripeEventId, object: "event" },
      stripeCreatedAt: new Date("2026-08-09T12:00:00.000Z"),
      stripeEventId,
    });

    const result = await processNextStripeInboxEvent({
      eventTypes: [eventType],
      project: async ({ event, transaction }) => {
        await enqueueOutboxJobInTransaction(transaction, {
          deduplicationKey: outboxKey,
          kind: "google_sheets_export",
          payload: { stripeEventId: event.stripeEventId },
          provider: "google_sheets",
        });

        return {
          outcomeSnapshot: "succeeded",
          paymentIntentId: `pi_${stripeEventId}`,
          paymentStatusSnapshot: "succeeded",
          skipped: false,
        };
      },
    });
    const replay = await processNextStripeInboxEvent({
      eventTypes: [eventType],
      project: async () => {
        throw new Error("processed event must not replay automatically");
      },
    });
    const [stored] = await client<{ outboxCount: number; processingStatus: string }[]>`
      SELECT
        event.processing_status AS "processingStatus",
        count(effect.id)::int AS "outboxCount"
      FROM stripe_events event
      LEFT JOIN purchase_side_effects effect
        ON effect.deduplication_key = ${outboxKey}
      WHERE event.stripe_event_id = ${stripeEventId}
      GROUP BY event.processing_status
    `;

    assert.equal(result.status, "processed");
    assert.equal(replay.status, "empty");
    assert.deepEqual(stored, {
      outboxCount: 1,
      processingStatus: "processed",
    });
  } finally {
    await client`
      DELETE FROM purchase_side_effects
      WHERE deduplication_key = ${outboxKey}
    `;
    await client`
      DELETE FROM stripe_events
      WHERE stripe_event_id = ${stripeEventId}
    `;
  }
});

test("uses one monotonic projector for inbox purchases, access, and outbox jobs", async () => {
  const runId = randomUUID();
  const eventType = `db04.payment-projection.${runId}`;
  const successEventId = `evt_db04_success_${runId}`;
  const staleEventId = `evt_db04_stale_${runId}`;
  const paymentIntentId = `pi_db04_${runId}`;
  const successOutboxKey = `db04:success:${runId}`;
  const staleOutboxKey = `db04:stale:${runId}`;

  try {
    for (const stripeEventId of [successEventId, staleEventId]) {
      await recordVerifiedStripeEvent({
        apiVersion: "2026-07-29.basil",
        eventType,
        livemode: false,
        payload: { id: stripeEventId, object: "event" },
        stripeCreatedAt: new Date("2026-08-09T10:00:00.000Z"),
        stripeEventId,
      });
    }

    const projectNext = (command: PaymentProjectionCommand) =>
      processNextStripeInboxEvent({
        eventTypes: [eventType],
        project: async ({ transaction }) => {
          const projection = await projectPaymentStateInTransaction({
            command,
            transaction,
          });

          return {
            outcomeSnapshot: command.purchase.outcome,
            paymentIntentId,
            paymentStatusSnapshot: command.purchase.stripeStatus,
            purchaseId: projection.purchaseId,
          };
        },
      });
    const success = await projectNext(
      createPaymentProjection({
        eventId: successEventId,
        outcome: "succeeded",
        outboxKey: successOutboxKey,
        paymentIntentId,
      }),
    );
    const stale = await projectNext(
      createPaymentProjection({
        eventId: staleEventId,
        outcome: "failed",
        outboxKey: staleOutboxKey,
        paymentIntentId,
      }),
    );
    const [stored] = await client<
      {
        entitlementCount: number;
        outcome: string;
        staleOutboxCount: number;
        successOutboxCount: number;
      }[]
    >`
      SELECT
        purchase.outcome,
        (
          SELECT count(*)::int
          FROM access_entitlements entitlement
          WHERE entitlement.purchase_id = purchase.id
        ) AS "entitlementCount",
        (
          SELECT count(*)::int
          FROM purchase_side_effects effect
          WHERE effect.deduplication_key = ${successOutboxKey}
        ) AS "successOutboxCount",
        (
          SELECT count(*)::int
          FROM purchase_side_effects effect
          WHERE effect.deduplication_key = ${staleOutboxKey}
        ) AS "staleOutboxCount"
      FROM purchases purchase
      WHERE purchase.payment_intent_id = ${paymentIntentId}
    `;

    assert.equal(success.status, "processed");
    assert.equal(stale.status, "processed");
    assert.deepEqual(stored, {
      entitlementCount: 1,
      outcome: "succeeded",
      staleOutboxCount: 0,
      successOutboxCount: 1,
    });
  } finally {
    await client`
      DELETE FROM stripe_events
      WHERE stripe_event_id IN (${successEventId}, ${staleEventId})
    `;
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id = ${paymentIntentId}
    `;
  }
});

test("rolls back projected jobs before scheduling an inbox retry", async () => {
  const eventType = `db04.rollback.${randomUUID()}`;
  const stripeEventId = `evt_db04_rollback_${randomUUID()}`;
  const outboxKey = `db04:rollback:${stripeEventId}`;

  try {
    await recordVerifiedStripeEvent({
      apiVersion: null,
      eventType,
      livemode: false,
      payload: { id: stripeEventId, object: "event" },
      stripeCreatedAt: new Date("2026-08-09T12:00:00.000Z"),
      stripeEventId,
    });

    const result = await processNextStripeInboxEvent({
      eventTypes: [eventType],
      project: async ({ transaction }) => {
        await enqueueOutboxJobInTransaction(transaction, {
          deduplicationKey: outboxKey,
          kind: "google_sheets_export",
          provider: "google_sheets",
        });
        throw new Error("projection_failed_after_outbox_enqueue");
      },
    });
    const [stored] = await client<{ outboxCount: number; processingStatus: string }[]>`
      SELECT
        event.processing_status AS "processingStatus",
        count(effect.id)::int AS "outboxCount"
      FROM stripe_events event
      LEFT JOIN purchase_side_effects effect
        ON effect.deduplication_key = ${outboxKey}
      WHERE event.stripe_event_id = ${stripeEventId}
      GROUP BY event.processing_status
    `;

    assert.equal(result.status, "retry");
    assert.deepEqual(stored, {
      outboxCount: 0,
      processingStatus: "failed",
    });
  } finally {
    await client`
      DELETE FROM purchase_side_effects
      WHERE deduplication_key = ${outboxKey}
    `;
    await client`
      DELETE FROM stripe_events
      WHERE stripe_event_id = ${stripeEventId}
    `;
  }
});

test("allocates one invoice per purchase and unique monthly sequences concurrently", async () => {
  const runId = randomUUID().replaceAll("-", "");
  const paymentIntentIds = Array.from(
    { length: 6 },
    (_, index) => `pi_db06_invoice_${runId}_${index}`,
  );
  const issuedAt = new Date("2098-04-17T10:00:00.000Z");

  try {
    const purchaseRows = await client<{ id: string; payment_intent_id: string }[]>`
      INSERT INTO purchases (
        payment_intent_id,
        amount_minor,
        currency,
        stripe_status,
        outcome
      )
      SELECT
        payment_intent_id,
        5000,
        'eur',
        'succeeded',
        'succeeded'
      FROM unnest(${paymentIntentIds}::text[]) AS input(payment_intent_id)
      RETURNING id, payment_intent_id
    `;
    const allocations = await Promise.all(
      purchaseRows.map((purchase) =>
        allocateInvoice({
          amountMinor: 5000,
          currency: "eur",
          issuedAt,
          purchaseId: purchase.id,
        }),
      ),
    );
    const samePurchaseAllocations = await Promise.all(
      Array.from({ length: 6 }, () =>
        allocateInvoice({
          amountMinor: 5000,
          currency: "eur",
          issuedAt,
          purchaseId: purchaseRows[0].id,
        }),
      ),
    );
    const invoiceIds = new Set(
      samePurchaseAllocations.map((allocation) => allocation.invoice.id),
    );
    const sequences = new Set(
      allocations.map((allocation) => allocation.invoice.sequenceNumber),
    );

    assert.equal(allocations.filter((allocation) => allocation.created).length, 6);
    assert.equal(sequences.size, 6);
    assert.equal(invoiceIds.size, 1);
    assert.ok(samePurchaseAllocations.every((allocation) => !allocation.created));
  } finally {
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id IN ${client(paymentIntentIds)}
    `;
  }
});
