import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, type TestContext } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import { domainRepositories } from "@/db/domain-repositories";
import { findPaymentAccessRecord } from "@/lib/payment-read-runtime";

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

const restoreEnvironmentVariable = (name: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
};

const removeGoogleCredentials = (context: TestContext) => {
  const names = [
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_SHEETS_SPREADSHEET_ID",
  ] as const;
  const previousValues = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );

  names.forEach((name) => delete process.env[name]);
  context.after(() => {
    names.forEach((name) => restoreEnvironmentVariable(name, previousValues[name]));
  });
};

test("reads payments and Stripe event state from PostgreSQL without Google credentials", async (t) => {
  const suffix = randomUUID().replaceAll("-", "");
  const checkoutSessionId = `cs_read02_${suffix}`;
  const eventId = `evt_read02_${suffix}`;
  const paymentIntentIds = Array.from(
    { length: 12 },
    (_, index) => `pi_read02_${suffix}_${index}`,
  );
  const latestPaymentIntentId = paymentIntentIds[paymentIntentIds.length - 1]!;

  removeGoogleCredentials(t);

  try {
    for (const [index, paymentIntentId] of paymentIntentIds.entries()) {
      const timestamp = new Date(Date.UTC(2026, 7, 13, 8, index));

      await client`
        INSERT INTO purchases (
          payment_intent_id,
          checkout_session_id,
          customer_email_snapshot,
          amount_minor,
          currency,
          stripe_status,
          outcome,
          first_seen_at,
          created_at,
          updated_at
        ) VALUES (
          ${paymentIntentId},
          ${checkoutSessionId},
          ${`read02-${index}@example.com`},
          ${1_000 + index},
          'pln',
          'succeeded',
          'succeeded',
          ${timestamp},
          ${timestamp},
          ${timestamp}
        )
      `;
    }

    await client`
      INSERT INTO stripe_events (
        stripe_event_id,
        event_type,
        payment_intent_id,
        stripe_created_at,
        processed_at,
        processing_status,
        provider_payload_verified,
        payment_status_snapshot,
        outcome_snapshot,
        payload
      ) VALUES (
        ${eventId},
        'payment_intent.succeeded',
        ${latestPaymentIntentId},
        '2026-08-13T08:12:00.000Z',
        '2026-08-13T08:12:01.000Z',
        'processed',
        true,
        'succeeded',
        'succeeded',
        ${client.json({ id: eventId, object: "event" })}
      )
    `;

    const latestCheckoutRecord = await findPaymentAccessRecord({
      checkoutSessionId,
      environment: { DB_PAYMENT_EVENTS_MODE: "database" },
      paymentIntentId: `pi_read02_missing_${suffix}`,
    });
    const directIntentRecord = await findPaymentAccessRecord({
      checkoutSessionId,
      environment: { DB_PAYMENT_EVENTS_MODE: "database" },
      paymentIntentId: paymentIntentIds[0],
    });
    const missingRecord = await findPaymentAccessRecord({
      checkoutSessionId: `cs_read02_missing_${suffix}`,
      environment: { DB_PAYMENT_EVENTS_MODE: "database" },
      paymentIntentId: `pi_read02_missing_${suffix}`,
    });
    const stripeEvent = await domainRepositories.stripeInbox.findReadModel(eventId);

    assert.equal(latestCheckoutRecord?.payment_intent_id, latestPaymentIntentId);
    assert.equal(latestCheckoutRecord?.amount, "1011");
    assert.equal(directIntentRecord?.payment_intent_id, paymentIntentIds[0]);
    assert.equal(missingRecord, null);
    assert.deepEqual(stripeEvent, {
      eventType: "payment_intent.succeeded",
      outcome: "succeeded",
      paymentIntentId: latestPaymentIntentId,
      paymentStatus: "succeeded",
      processingStatus: "processed",
      stripeEventId: eventId,
    });
  } finally {
    await client`
      DELETE FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;
    await client`
      DELETE FROM purchases
      WHERE checkout_session_id = ${checkoutSessionId}
    `;
  }
});
