import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import postgres from "postgres";
import Stripe from "stripe";

import { getDatabaseClient } from "@/db/client";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
const stripeSecretKey = "sk_test_write01";
const webhookSecret = "whsec_write01";

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.STRIPE_SECRET_KEY = stripeSecretKey;
process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

const stripe = new Stripe(stripeSecretKey);
const client = postgres(databaseUrl, {
  max: 2,
  prepare: false,
});
const applicationClient = getDatabaseClient();
let POST: (request: Request) => Promise<Response>;

const clearGoogleSheetsConfiguration = () => {
  delete process.env.GOOGLE_PRIVATE_KEY;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
};

before(async () => {
  clearGoogleSheetsConfiguration();
  ({ POST } = await import("@/app/api/stripe/webhook/route"));
});

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const createEvent = ({
  eventId,
  eventType = "customer.created",
}: {
  eventId: string;
  eventType?: string;
}) => ({
  api_version: "2026-07-29.basil",
  created: 1_786_457_540,
  data: {
    object: {
      id: `cus_${eventId}`,
      object: "customer",
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
  type: eventType,
});

const createSignedRequest = (
  event: ReturnType<typeof createEvent>,
  signingSecret = webhookSecret,
) => {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: signingSecret,
  });

  return new Request("http://localhost/api/stripe/webhook", {
    body: payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    method: "POST",
  });
};

const deleteEvent = async (eventId: string) => {
  await client`
    DELETE FROM stripe_events
    WHERE stripe_event_id = ${eventId}
  `;
};

test("persists a verified event before acknowledging it from the durable inbox", async () => {
  const eventId = `evt_write01_success_${randomUUID()}`;
  const event = createEvent({ eventId });

  try {
    const firstResponse = await POST(createSignedRequest(event));
    const duplicateResponse = await POST(createSignedRequest(event));

    assert.equal(firstResponse.status, 200);
    assert.equal(duplicateResponse.status, 200);
    assert.deepEqual(await firstResponse.json(), {
      eventId,
      queued: true,
      received: true,
      type: "customer.created",
    });

    const [stored] = await client<
      {
        count: number;
        event_type: string;
        processing_status: string;
        provider_payload_verified: boolean;
      }[]
    >`
      SELECT
        count(*) OVER ()::int AS count,
        event_type,
        processing_status,
        provider_payload_verified
      FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;

    assert.equal(stored?.count, 1);
    assert.equal(stored?.event_type, event.type);
    assert.ok(
      stored?.processing_status === "pending" || stored?.processing_status === "skipped",
    );
    assert.equal(stored?.provider_payload_verified, true);
  } finally {
    await deleteEvent(eventId);
  }
});

test("does not require Google credentials after accepting verified evidence", async () => {
  clearGoogleSheetsConfiguration();
  const eventId = `evt_write01_legacy_outage_${randomUUID()}`;

  try {
    const response = await POST(createSignedRequest(createEvent({ eventId })));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      eventId,
      queued: true,
      received: true,
      type: "customer.created",
    });

    const [stored] = await client<
      { processing_status: string; provider_payload_verified: boolean }[]
    >`
      SELECT processing_status, provider_payload_verified
      FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;

    assert.ok(
      stored?.processing_status === "pending" || stored?.processing_status === "skipped",
    );
    assert.equal(stored?.provider_payload_verified, true);
  } finally {
    await deleteEvent(eventId);
  }
});

test("does not persist an event before its Stripe signature is verified", async () => {
  const eventId = `evt_write01_invalid_signature_${randomUUID()}`;

  const response = await POST(
    createSignedRequest(createEvent({ eventId }), "whsec_wrong"),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    errorCode: "invalid_webhook_signature",
  });

  const [stored] = await client<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM stripe_events
    WHERE stripe_event_id = ${eventId}
  `;

  assert.equal(stored?.count, 0);
});

test("returns a retryable error when verified evidence cannot enter the inbox", async () => {
  const eventId = `evt_write01_invalid_${randomUUID()}`;
  const response = await POST(
    createSignedRequest(
      createEvent({
        eventId,
        eventType: "",
      }),
    ),
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    errorCode: "stripe_webhook_inbox_failed",
  });

  const [stored] = await client<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM stripe_events
    WHERE stripe_event_id = ${eventId}
  `;

  assert.equal(stored?.count, 0);
});
