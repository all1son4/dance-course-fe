import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabase, getDatabaseClient } from "@/db/client";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

/*
 * «Твой путь» counts the Online Group cycles behind a customer, also those given
 * through an admin offer link: such a purchase has no customer and no email, only
 * the Telegram account the bot saw (the owner's case, 2026-11-19).
 */

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, { max: 2, prepare: false });
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

test("cycles bought under the customer's Telegram account count; another account's do not", async () => {
  const run = randomUUID().replaceAll("-", "").slice(0, 12);
  const chat = `mat_chat_${run}`;
  const nextChat = `mat_chat_next_${run}`;
  const telegram = `mat_tg_${run}`;
  const strangerTelegram = `mat_tg_other_${run}`;
  const intents: string[] = [];
  const purchase = async (values: Record<string, unknown>) => {
    const paymentIntentId = `pi_mat_${run}_${intents.length}`;
    intents.push(paymentIntentId);
    const [row] = await client<{ id: string }[]>`
      INSERT INTO purchases ${client({
        amount_minor: 5000,
        currency: "pln",
        outcome: "succeeded",
        payment_intent_id: paymentIntentId,
        stripe_status: "succeeded",
        ...values,
      })}
      RETURNING id`;
    return row!.id;
  };

  await client`INSERT INTO telegram_chats (chat_id, title, type) VALUES
    (${chat}, 'Path chat 2.0', 'supergroup'), (${nextChat}, 'Path chat 3.0', 'supergroup')`;
  const [closed] = await client<{ id: string }[]>`
    INSERT INTO online_group_cohorts (title, main_chat_id, starts_at, lessons_cleared_at,
      closed_at, access_ends_at)
    VALUES ('Path 2.0', ${chat}, '2026-08-10T16:00:00Z', '2026-11-16T09:00:00Z',
      '2026-11-16T10:00:00Z', '2026-11-16T23:00:00Z')
    RETURNING id`;
  const [open] = await client<{ id: string }[]>`
    INSERT INTO online_group_cohorts (title, main_chat_id, starts_at)
    VALUES ('Path 3.0', ${nextChat}, '2026-11-23T17:00:00Z')
    RETURNING id`;
  const [customer] = await client<{ id: string }[]>`
    INSERT INTO customers (email, normalized_email, full_name)
    VALUES (${`mat_${run}@example.test`}, ${`mat_${run}@example.test`}, 'Path Tester')
    RETURNING id`;

  try {
    // Her own purchase of the open cycle, through Stripe: it gives the Telegram account.
    await purchase({
      customer_email_snapshot: `mat_${run}@example.test`,
      customer_id: customer!.id,
      offer_external_id: "off_online_group_anna_strok_renewal_library_access",
      online_group_cohort_id: open!.id,
      product_external_id: "prd_L9aK3mT7qP2x",
      source: "stripe",
      succeeded_at: new Date("2026-11-16T12:00:00Z"),
      telegram_user_id: telegram,
    });
    // The closed cycle given by Anna through an admin offer link: no customer, no email.
    const adminCycle = await purchase({
      offer_external_id: "off_online_group_anna_strok_library_access",
      online_group_cohort_id: closed!.id,
      product_external_id: "prd_L9aK3mT7qP2x",
      source: "admin_offer_link",
      telegram_user_id: telegram,
    });
    // Someone else's admin link to the same closed cycle.
    await purchase({
      offer_external_id: "off_online_group_anna_strok_library_access",
      online_group_cohort_id: closed!.id,
      product_external_id: "prd_L9aK3mT7qP2x",
      source: "admin_offer_link",
      telegram_user_id: strangerTelegram,
    });

    const { readMyAccessSnapshot } = await import("@/db/my-access");
    const snapshot = await readMyAccessSnapshot(getDatabase(), customer!.id);

    assert.deepEqual(snapshot?.closedCohortIdsOfTelegram, [closed!.id]);
    // The cards keep to her own purchases: the admin link adds no card.
    assert.equal(
      snapshot?.purchases.some((row) => row.id === adminCycle),
      false,
    );
  } finally {
    await client`DELETE FROM purchases WHERE payment_intent_id IN ${client(intents)}`;
    await client`DELETE FROM customers WHERE id = ${customer!.id}`;
    await client`DELETE FROM online_group_cohorts WHERE id IN (${closed!.id}, ${open!.id})`;
    await client`DELETE FROM telegram_chats WHERE chat_id IN (${chat}, ${nextChat})`;
  }
});
