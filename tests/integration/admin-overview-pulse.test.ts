import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import { readOperationalDatabaseStatus } from "@/db/operational-status";
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
  feeMinor,
  outcome,
  paymentIntentId,
  settlementMinor,
  sql = client,
}: {
  createdAt: string;
  outcome: string;
  paymentIntentId: string;
  settlementMinor?: number;
  /** Stripe's fee of a settled sale; its net is the settlement minus the fee. */
  feeMinor?: number;
  sql?: postgres.ISql;
}) => {
  await sql`
    INSERT INTO purchases (
      payment_intent_id, amount_minor, currency, stripe_status, outcome, source,
      settlement_amount_minor, settlement_currency,
      stripe_fee_amount_minor, stripe_net_amount_minor, stripe_balance_transaction_id,
      succeeded_at, first_seen_at, created_at, updated_at
    ) VALUES (
      ${paymentIntentId}, ${settlementMinor ?? 1000}, 'pln', ${outcome}, ${outcome}, 'stripe',
      ${settlementMinor ?? null}, ${settlementMinor ? "pln" : null},
      ${settlementMinor && feeMinor !== undefined ? feeMinor : null},
      ${settlementMinor && feeMinor !== undefined ? settlementMinor - feeMinor : null},
      ${settlementMinor && feeMinor !== undefined ? `txn_${paymentIntentId}` : null},
      ${outcome === "succeeded" ? createdAt : null}, ${createdAt}, ${createdAt}, ${createdAt}
    )
  `;
};

test("overview earnings: net after Stripe fees, confirmed sales only, unsettled apart", async () => {
  // A month of its own, so no other test's purchases fall into it.
  const now = new Date("2031-02-15T12:00:00.000Z");
  const suffix = randomUUID().replaceAll("-", "");
  const confirmed = `pi_overview_confirmed_${suffix}`;
  const unconfirmed = `pi_overview_unconfirmed_${suffix}`;
  const unsettled = `pi_overview_unsettled_${suffix}`;

  try {
    await insertPurchase({
      createdAt: "2031-02-10T10:00:00.000Z",
      feeMinor: 200,
      outcome: "succeeded",
      paymentIntentId: confirmed,
      settlementMinor: 5000,
    });
    // Confirmed, but Stripe has not sent its balance transaction yet.
    await insertPurchase({
      createdAt: "2031-02-12T10:00:00.000Z",
      outcome: "succeeded",
      paymentIntentId: unsettled,
      settlementMinor: 3000,
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
      ), (
        ${`evt_${unsettled}`}, 'payment_intent.succeeded', ${unsettled},
        '2031-02-12T10:00:00.000Z', 'processed', '2031-02-12T10:00:00.000Z',
        'succeeded', '{}'::jsonb
      )
    `;

    const sales = await readSalesMetrics(now);

    assert.equal(sales.monthNet, "48 PLN");
    assert.equal(sales.monthCount, 2);
    assert.equal(sales.monthUnsettled, 1);
  } finally {
    await client`DELETE FROM stripe_events WHERE payment_intent_id IN (${confirmed}, ${unconfirmed}, ${unsettled})`;
    await client`DELETE FROM purchases WHERE payment_intent_id IN (${confirmed}, ${unconfirmed}, ${unsettled})`;
  }
});

test("access in progress counts only paid purchases of this Stripe mode", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids = {
    abandoned: `pi_access_abandoned_${suffix}`,
    otherMode: `pi_access_other_mode_${suffix}`,
    paid: `pi_access_paid_${suffix}`,
  };
  const now = new Date().toISOString();
  const rollback = new Error("rollback_access_in_progress_fixture");

  try {
    // The count is database-wide and other files commit paid purchases meanwhile, so
    // both reads share one snapshot that sees only this test's rows change.
    await client.begin("isolation level repeatable read", async (tx) => {
      const pendingOf = async () =>
        (await readOperationalDatabaseStatus(tx)).access.pending;
      const before = await pendingOf();
      await insertPurchase({
        createdAt: now,
        outcome: "failed",
        paymentIntentId: ids.abandoned,
        sql: tx,
      });
      await insertPurchase({
        createdAt: now,
        outcome: "succeeded",
        paymentIntentId: ids.paid,
        sql: tx,
      });
      await insertPurchase({
        createdAt: now,
        outcome: "succeeded",
        paymentIntentId: ids.otherMode,
        sql: tx,
      });
      // The test database is "development", so only test-mode purchases are its own.
      await tx`UPDATE purchases SET livemode = true WHERE payment_intent_id = ${ids.otherMode}`;
      // Every checkout writes its entitlement up front, paid or not.
      await tx`
        INSERT INTO access_entitlements (purchase_id)
        SELECT id FROM purchases WHERE payment_intent_id IN ${tx(Object.values(ids))}
      `;

      assert.equal((await pendingOf()) - before, 1);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
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
