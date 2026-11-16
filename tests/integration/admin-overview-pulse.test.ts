import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import { readSalesMetrics } from "@/lib/admin/overview";
import { getSystemPulse } from "@/lib/admin/system-pulse";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
// No network in tests: without a token the bot check reports "Нет ответа".
process.env.TELEGRAM_BOT_TOKEN = "";

const client = postgres(databaseUrl, { max: 4, prepare: false });
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const insertPurchase = async ({
  createdAt,
  outcome,
  paymentIntentId,
  settlementMinor,
}: {
  createdAt: string;
  outcome: string;
  paymentIntentId: string;
  settlementMinor?: number;
}) => {
  await client`
    INSERT INTO purchases (
      payment_intent_id, amount_minor, currency, stripe_status, outcome, source,
      settlement_amount_minor, settlement_currency,
      succeeded_at, first_seen_at, created_at, updated_at
    ) VALUES (
      ${paymentIntentId}, ${settlementMinor ?? 1000}, 'pln', ${outcome}, ${outcome}, 'stripe',
      ${settlementMinor ?? null}, ${settlementMinor ? "pln" : null},
      ${outcome === "succeeded" ? createdAt : null}, ${createdAt}, ${createdAt}, ${createdAt}
    )
  `;
};

test("overview revenue counts only sales confirmed by a processed Stripe event", async () => {
  // A month of its own, so no other test's purchases fall into it.
  const now = new Date("2031-02-15T12:00:00.000Z");
  const suffix = randomUUID().replaceAll("-", "");
  const confirmed = `pi_overview_confirmed_${suffix}`;
  const unconfirmed = `pi_overview_unconfirmed_${suffix}`;

  try {
    await insertPurchase({
      createdAt: "2031-02-10T10:00:00.000Z",
      outcome: "succeeded",
      paymentIntentId: confirmed,
      settlementMinor: 5000,
    });
    await insertPurchase({
      createdAt: "2031-02-11T10:00:00.000Z",
      outcome: "succeeded",
      paymentIntentId: unconfirmed,
      settlementMinor: 7000,
    });
    await client`
      INSERT INTO stripe_events (
        stripe_event_id, event_type, payment_intent_id, stripe_created_at,
        processing_status, processed_at, outcome_snapshot, payload
      ) VALUES (
        ${`evt_${confirmed}`}, 'payment_intent.succeeded', ${confirmed},
        '2031-02-10T10:00:00.000Z', 'processed', '2031-02-10T10:00:00.000Z',
        'succeeded', '{}'::jsonb
      )
    `;

    const sales = await readSalesMetrics(now);

    assert.equal(sales.monthGross, "50 PLN");
    assert.equal(sales.monthCount, 1);
  } finally {
    await client`DELETE FROM stripe_events WHERE payment_intent_id IN (${confirmed}, ${unconfirmed})`;
    await client`DELETE FROM purchases WHERE payment_intent_id IN (${confirmed}, ${unconfirmed})`;
  }
});

test("pulse flags payments stuck at the bank and a failing day", async () => {
  // A day of its own: the windowed counts see only this test's purchases.
  const now = new Date("2031-03-20T12:00:00.000Z");
  const suffix = randomUUID().replaceAll("-", "");
  const ids = [
    `pi_pulse_stuck_${suffix}`,
    `pi_pulse_failed_a_${suffix}`,
    `pi_pulse_failed_b_${suffix}`,
    `pi_pulse_failed_c_${suffix}`,
  ];

  try {
    await insertPurchase({
      createdAt: "2031-03-20T09:30:00.000Z",
      outcome: "requires_action",
      paymentIntentId: ids[0]!,
    });
    for (const id of ids.slice(1)) {
      await insertPurchase({
        createdAt: "2031-03-20T11:00:00.000Z",
        outcome: "failed",
        paymentIntentId: id,
      });
    }

    const pulse = await getSystemPulse(now);
    const signal = (id: string) => pulse.signals.find((entry) => entry.id === id);

    assert.equal(signal("stuck-payments")?.value, "1");
    assert.equal(signal("stuck-payments")?.tone, "warning");
    assert.equal(signal("fail-rate")?.value, "3 из 4");
    assert.equal(signal("fail-rate")?.tone, "danger");
    assert.equal(signal("telegram")?.value, "Нет ответа");
  } finally {
    await client`DELETE FROM purchases WHERE payment_intent_id IN ${client(ids)}`;
  }
});
