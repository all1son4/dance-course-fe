import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import { upsertPaymentRecordToDatabase } from "@/db/payment-records";
import {
  PAYMENT_SHEET_HEADERS,
  type PaymentSheetRecord,
} from "@/lib/google-sheets-schema";

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

const createPaymentRecord = ({
  eventId,
  outcome,
  paymentIntentId,
  status,
  timestamp,
}: {
  eventId: string;
  outcome: PaymentSheetRecord["outcome"];
  paymentIntentId: string;
  status: string;
  timestamp: string;
}): PaymentSheetRecord => ({
  ...(Object.fromEntries(
    PAYMENT_SHEET_HEADERS.map((header) => [header, ""]),
  ) as PaymentSheetRecord),
  amount: "5000",
  checkout_currency: "eur",
  currency: "eur",
  first_seen_at: "2026-08-08T08:00:00.000Z",
  latest_event_id: eventId,
  latest_event_type: `payment_intent.${status}`,
  outcome,
  payment_intent_id: paymentIntentId,
  status,
  updated_at: timestamp,
});

const readPaymentState = async (paymentIntentId: string) => {
  const [row] = await client<
    {
      latestEventId: string | null;
      outcome: string;
      stripeStatus: string;
    }[]
  >`
    SELECT
      latest_event_id AS "latestEventId",
      outcome,
      stripe_status AS "stripeStatus"
    FROM purchases
    WHERE payment_intent_id = ${paymentIntentId}
  `;

  return row;
};

const deletePayment = (paymentIntentId: string) => client`
  DELETE FROM purchases
  WHERE payment_intent_id = ${paymentIntentId}
`;

test("preserves normal retries and rejects a stale post-success state", async () => {
  const paymentIntentId = `pi_safe04_sequence_${randomUUID().replaceAll("-", "")}`;

  try {
    await upsertPaymentRecordToDatabase(
      createPaymentRecord({
        eventId: "evt_safe04_failed",
        outcome: "failed",
        paymentIntentId,
        status: "requires_payment_method",
        timestamp: "2026-08-08T08:01:00.000Z",
      }),
    );
    await upsertPaymentRecordToDatabase(
      createPaymentRecord({
        eventId: "evt_safe04_processing",
        outcome: "processing",
        paymentIntentId,
        status: "processing",
        timestamp: "2026-08-08T08:02:00.000Z",
      }),
    );
    await upsertPaymentRecordToDatabase(
      createPaymentRecord({
        eventId: "evt_safe04_succeeded",
        outcome: "succeeded",
        paymentIntentId,
        status: "succeeded",
        timestamp: "2026-08-08T08:03:00.000Z",
      }),
    );

    const staleResult = await upsertPaymentRecordToDatabase(
      createPaymentRecord({
        eventId: "evt_safe04_stale_failed",
        outcome: "failed",
        paymentIntentId,
        status: "requires_payment_method",
        timestamp: "2026-08-08T08:04:00.000Z",
      }),
    );
    const storedState = await readPaymentState(paymentIntentId);

    assert.equal(staleResult.outcome, "succeeded");
    assert.equal(staleResult.status, "succeeded");
    assert.equal(staleResult.latest_event_id, "evt_safe04_succeeded");
    assert.deepEqual(storedState, {
      latestEventId: "evt_safe04_succeeded",
      outcome: "succeeded",
      stripeStatus: "succeeded",
    });
  } finally {
    await deletePayment(paymentIntentId);
  }
});

test("keeps success under concurrent success and failure projections", async () => {
  const paymentIntentId = `pi_safe04_concurrent_${randomUUID().replaceAll("-", "")}`;

  try {
    await upsertPaymentRecordToDatabase(
      createPaymentRecord({
        eventId: "evt_safe04_initial_processing",
        outcome: "processing",
        paymentIntentId,
        status: "processing",
        timestamp: "2026-08-08T09:00:00.000Z",
      }),
    );

    await Promise.all([
      upsertPaymentRecordToDatabase(
        createPaymentRecord({
          eventId: "evt_safe04_concurrent_succeeded",
          outcome: "succeeded",
          paymentIntentId,
          status: "succeeded",
          timestamp: "2026-08-08T09:01:00.000Z",
        }),
      ),
      upsertPaymentRecordToDatabase(
        createPaymentRecord({
          eventId: "evt_safe04_concurrent_failed",
          outcome: "failed",
          paymentIntentId,
          status: "requires_payment_method",
          timestamp: "2026-08-08T09:02:00.000Z",
        }),
      ),
    ]);

    const storedState = await readPaymentState(paymentIntentId);

    assert.deepEqual(storedState, {
      latestEventId: "evt_safe04_concurrent_succeeded",
      outcome: "succeeded",
      stripeStatus: "succeeded",
    });
  } finally {
    await deletePayment(paymentIntentId);
  }
});
