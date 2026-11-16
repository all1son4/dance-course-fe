import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import {
  findPaymentRecordByIntentIdFromDatabase,
  upsertPaymentRecordToDatabase,
} from "@/db/payment-records";
import {
  createEmptyPaymentRecord,
  type PaymentRecordSnapshot,
} from "@/lib/payment-record";

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

test("legacy payment projection preserves classified cohort, owner and access source", async () => {
  const suffix = randomUUID();
  const paymentIntentId = `pi_hub_source_projection_${suffix}`;
  const chatId = `hub_source_projection_${suffix}`;
  const cohortId = randomUUID();
  const telegramUserId = "123456789";
  const record: PaymentRecordSnapshot = {
    ...createEmptyPaymentRecord(),
    access_workflow: "telegram-online-group",
    amount: "5000",
    currency: "eur",
    delivery_channel: "telegram",
    first_seen_at: "2026-09-14T08:00:00.000Z",
    outcome: "succeeded",
    payment_intent_id: paymentIntentId,
    status: "succeeded",
    telegram_access_status: "activated",
    telegram_channel_chat_id: chatId,
    telegram_token_used_at: "2026-09-14T08:01:00.000Z",
    telegram_user_id: telegramUserId,
    updated_at: "2026-09-14T08:02:00.000Z",
  };

  try {
    await client`
      INSERT INTO telegram_chats (chat_id, title, type)
      VALUES (${chatId}, 'Classified purchase regression', 'supergroup')
    `;
    await client`
      INSERT INTO online_group_cohorts (id, title, main_chat_id, starts_at)
      VALUES (${cohortId}, 'Classified purchase regression', ${chatId},
        '2026-09-01T08:00:00.000Z')
    `;
    await upsertPaymentRecordToDatabase(record);

    const [purchase] = await client<{ id: string }[]>`
      UPDATE purchases
      SET online_group_cohort_id = ${cohortId}, telegram_user_id = ${telegramUserId}
      WHERE payment_intent_id = ${paymentIntentId}
      RETURNING id
    `;
    assert.ok(purchase);
    await client`
      UPDATE access_entitlements SET source_kind = 'online_group'
      WHERE purchase_id = ${purchase.id} AND access_key = 'primary'
    `;

    await upsertPaymentRecordToDatabase({
      ...record,
      updated_at: "2026-09-14T08:03:00.000Z",
    });

    const [provenance] = await client<
      {
        online_group_cohort_id: string;
        telegram_user_id: string;
        source_kind: string;
      }[]
    >`
      SELECT purchase.online_group_cohort_id, purchase.telegram_user_id,
        entitlement.source_kind
      FROM purchases purchase
      JOIN access_entitlements entitlement ON entitlement.purchase_id = purchase.id
      WHERE purchase.id = ${purchase.id} AND entitlement.access_key = 'primary'
    `;

    assert.deepEqual(provenance, {
      online_group_cohort_id: cohortId,
      telegram_user_id: telegramUserId,
      source_kind: "online_group",
    });
  } finally {
    await client`DELETE FROM purchases WHERE payment_intent_id = ${paymentIntentId}`;
    await client`DELETE FROM online_group_cohorts WHERE id = ${cohortId}`;
    await client`DELETE FROM telegram_chats WHERE chat_id = ${chatId}`;
  }
});
