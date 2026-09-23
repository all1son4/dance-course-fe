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

test("payment persistence stays independent and rejects retired export rows", async () => {
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
      updated_at: "2026-09-14T08:02:00.000Z",
    });

    assert.equal(saved.payment_intent_id, paymentIntentId);

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

    const beforeRejectedWrite =
      await findPaymentRecordByIntentIdFromDatabase(paymentIntentId);
    await assert.rejects(
      client`
        INSERT INTO purchase_side_effects (purchase_id, deduplication_key, kind,
          provider, status)
        VALUES (${purchase.id}, ${`${paymentIntentId}:retired-export`},
          'successful_customer_export', 'google_sheets', 'sent')
      `,
      { code: "23514", constraint_name: "purchase_side_effects_retired_values_check" },
    );
    assert.deepEqual(
      await findPaymentRecordByIntentIdFromDatabase(paymentIntentId),
      beforeRejectedWrite,
    );
  } finally {
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id = ${paymentIntentId}
    `;
  }
});
