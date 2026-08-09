import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import {
  recordVerifiedStripeEvent,
  type VerifiedStripeInboxEvent,
} from "@/db/stripe-event-inbox";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, {
  max: 4,
  prepare: false,
});
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const createInboxEvent = (
  eventId: string,
  payloadMarker = "original",
): VerifiedStripeInboxEvent => ({
  apiVersion: "2026-07-29.basil",
  eventType: "payment_intent.succeeded",
  livemode: false,
  payload: {
    id: eventId,
    marker: payloadMarker,
    object: "event",
  },
  receivedAt: new Date("2026-08-09T12:00:00.000Z"),
  stripeCreatedAt: new Date("2026-08-09T11:59:00.000Z"),
  stripeEventId: eventId,
});

test("records one pending inbox row under concurrent duplicate receipts", async () => {
  const eventId = `evt_inbox_concurrent_${randomUUID()}`;

  try {
    const receipts = await Promise.all([
      recordVerifiedStripeEvent(createInboxEvent(eventId)),
      recordVerifiedStripeEvent(createInboxEvent(eventId)),
    ]);

    assert.equal(receipts.filter((receipt) => !receipt.duplicate).length, 1);
    assert.equal(receipts.filter((receipt) => receipt.duplicate).length, 1);
    assert.ok(receipts.every((receipt) => receipt.processingStatus === "pending"));

    const [stored] = await client<
      {
        attempt_count: number;
        count: number;
        processing_status: string;
        provider_payload_verified: boolean;
      }[]
    >`
      SELECT
        count(*) OVER ()::int AS count,
        attempt_count,
        processing_status,
        provider_payload_verified
      FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;

    assert.equal(stored?.count, 1);
    assert.equal(stored?.attempt_count, 0);
    assert.equal(stored?.processing_status, "pending");
    assert.equal(stored?.provider_payload_verified, true);
  } finally {
    await client`
      DELETE FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;
  }
});

test("keeps verified provider evidence immutable across duplicate receipts", async () => {
  const eventId = `evt_inbox_immutable_${randomUUID()}`;

  try {
    await recordVerifiedStripeEvent(createInboxEvent(eventId));
    const duplicate = await recordVerifiedStripeEvent(
      createInboxEvent(eventId, "conflicting-duplicate"),
    );

    assert.equal(duplicate.duplicate, true);

    const [stored] = await client<{ marker: string }[]>`
      SELECT payload ->> 'marker' AS marker
      FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;

    assert.equal(stored?.marker, "original");

    await assert.rejects(
      client`
        UPDATE stripe_events
        SET payload = '{"marker":"tampered"}'::jsonb
        WHERE stripe_event_id = ${eventId}
      `,
      (error: unknown) =>
        Boolean(
          error && typeof error === "object" && "code" in error && error.code === "55000",
        ),
    );
  } finally {
    await client`
      DELETE FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;
  }
});

test("promotes a legacy event to verified evidence without replaying it", async () => {
  const eventId = `evt_inbox_legacy_${randomUUID()}`;

  try {
    await client`
      INSERT INTO stripe_events (
        stripe_event_id,
        event_type,
        processed_at,
        processing_status,
        payload
      ) VALUES (
        ${eventId},
        'legacy.unknown',
        '2026-08-09T11:00:00.000Z',
        'processed',
        '{"source":"legacy-sheet"}'::jsonb
      )
    `;

    const receipt = await recordVerifiedStripeEvent(createInboxEvent(eventId));

    assert.equal(receipt.duplicate, true);
    assert.equal(receipt.processingStatus, "processed");

    const [stored] = await client<
      {
        event_type: string;
        marker: string;
        processing_status: string;
        provider_payload_verified: boolean;
      }[]
    >`
      SELECT
        event_type,
        payload ->> 'marker' AS marker,
        processing_status,
        provider_payload_verified
      FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;

    assert.equal(stored?.event_type, "payment_intent.succeeded");
    assert.equal(stored?.marker, "original");
    assert.equal(stored?.processing_status, "processed");
    assert.equal(stored?.provider_payload_verified, true);
  } finally {
    await client`
      DELETE FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;
  }
});

test("requires an active lease for processing inbox rows", async () => {
  const eventId = `evt_inbox_invalid_lease_${randomUUID()}`;

  await assert.rejects(
    client`
      INSERT INTO stripe_events (
        stripe_event_id,
        event_type,
        processing_status,
        payload
      ) VALUES (
        ${eventId},
        'payment_intent.succeeded',
        'processing',
        '{}'::jsonb
      )
    `,
    (error: unknown) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23514" &&
        "constraint_name" in error &&
        error.constraint_name === "stripe_events_lifecycle_check",
      ),
  );
});
