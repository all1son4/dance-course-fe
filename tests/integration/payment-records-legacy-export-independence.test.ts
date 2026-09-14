import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import {
  findPaymentRecordByIntentIdFromDatabase,
  upsertPaymentRecordToDatabase,
} from "@/db/payment-records";
import { createEmptyPaymentRecord } from "@/lib/payment-record";

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

test("payment persistence ignores retained legacy export fields and rows", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const paymentIntentId = `pi_drop05_export_independence_${suffix}`;

  try {
    const saved = await upsertPaymentRecordToDatabase({
      ...createEmptyPaymentRecord(),
      amount: "5000",
      currency: "pln",
      first_seen_at: "2026-09-14T08:00:00.000Z",
      outcome: "succeeded",
      payment_intent_id: paymentIntentId,
      status: "succeeded",
      successful_customer_log_status: "sent",
      successful_customer_logged_at: "2026-09-14T08:01:00.000Z",
      updated_at: "2026-09-14T08:02:00.000Z",
    });

    assert.equal(saved.successful_customer_log_status, "");
    assert.equal(saved.successful_customer_logged_at, "");

    const [purchase] = await client<{ id: string }[]>`
      SELECT id
      FROM purchases
      WHERE payment_intent_id = ${paymentIntentId}
    `;

    assert.ok(purchase);

    const [createdByRuntime] = await client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM purchase_side_effects
      WHERE purchase_id = ${purchase.id}
        AND kind = 'successful_customer_export'
    `;

    assert.equal(createdByRuntime?.count, 0);

    await client`
      INSERT INTO purchase_side_effects (
        purchase_id,
        deduplication_key,
        kind,
        provider,
        status,
        sent_at
      ) VALUES (
        ${purchase.id},
        ${`${paymentIntentId}:successful_customer_export`},
        'successful_customer_export',
        'google_sheets',
        'sent',
        '2026-09-14T08:03:00.000Z'
      )
    `;

    const withLegacyRow = await findPaymentRecordByIntentIdFromDatabase(paymentIntentId);

    await client`
      UPDATE purchase_side_effects
      SET
        sent_at = '2025-01-01T00:00:00.000Z',
        status = 'failed'
      WHERE purchase_id = ${purchase.id}
        AND kind = 'successful_customer_export'
    `;

    const withChangedLegacyRow =
      await findPaymentRecordByIntentIdFromDatabase(paymentIntentId);

    await client`
      DELETE FROM purchase_side_effects
      WHERE purchase_id = ${purchase.id}
        AND kind = 'successful_customer_export'
    `;

    const withoutLegacyRow =
      await findPaymentRecordByIntentIdFromDatabase(paymentIntentId);

    assert.deepEqual(withChangedLegacyRow, withLegacyRow);
    assert.deepEqual(withoutLegacyRow, withLegacyRow);
    assert.equal(withoutLegacyRow?.successful_customer_log_status, "");
    assert.equal(withoutLegacyRow?.successful_customer_logged_at, "");
  } finally {
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id = ${paymentIntentId}
    `;
  }
});
