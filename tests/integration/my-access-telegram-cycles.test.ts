import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabase, getDatabaseClient } from "@/db/client";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

/*
 * «Твой путь» counts the Online Group cycles behind a customer from purchase data
 * only (owner, 2026-11-19): purchases of the customer or of their Telegram account
 * (an admin offer link carries nothing else), a renewal proving the cycle of its
 * campaign's source chat, and membership the site verified in a cycle's chat.
 */

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, { max: 2, prepare: false });
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const GROUP = "prd_L9aK3mT7qP2x";
const PLUS = "off_online_group_anna_strok_library_access";
const RENEWAL_PLUS = "off_online_group_anna_strok_renewal_library_access";

test("the cycles behind a customer come from their purchases, renewals and verified chats", async () => {
  const run = randomUUID().replaceAll("-", "").slice(0, 12);
  const chat = (name: string) => `mat_${name}_${run}`;
  const telegram = `mat_tg_${run}`;
  const stranger = `mat_tg_other_${run}`;
  const intents: string[] = [];
  const chats = ["c0", "c1", "c2", "c3", "c4"].map(chat);

  await client`INSERT INTO telegram_chats ${client(
    chats.map((chatId) => ({ chat_id: chatId, title: chatId, type: "supergroup" })),
  )}`;
  const cohort = async (name: string, closed: boolean) => {
    const [row] = await client<{ id: string }[]>`
      INSERT INTO online_group_cohorts ${client({
        main_chat_id: chat(name),
        starts_at: new Date("2026-03-01T10:00:00Z"),
        title: `Path ${name}`,
        ...(closed
          ? {
              access_ends_at: new Date("2026-04-02T00:00:00Z"),
              closed_at: new Date("2026-04-01T10:00:00Z"),
              lessons_cleared_at: new Date("2026-04-01T09:00:00Z"),
            }
          : {}),
      })}
      RETURNING id`;
    return row!.id;
  };
  const c0 = await cohort("c0", true);
  const c1 = await cohort("c1", true);
  const c2 = await cohort("c2", true);
  const c3 = await cohort("c3", false);
  const c4 = await cohort("c4", true);
  const [customer] = await client<{ id: string }[]>`
    INSERT INTO customers (email, normalized_email, full_name)
    VALUES (${`mat_${run}@example.test`}, ${`mat_${run}@example.test`}, 'Path Tester')
    RETURNING id`;
  const purchase = async (values: Record<string, unknown>) => {
    const paymentIntentId = `pi_mat_${run}_${intents.length}`;
    intents.push(paymentIntentId);
    await client`
      INSERT INTO purchases ${client({
        amount_minor: 5000,
        currency: "pln",
        outcome: "succeeded",
        payment_intent_id: paymentIntentId,
        product_external_id: GROUP,
        stripe_status: "succeeded",
        ...values,
      })}`;
  };
  const [campaign] = await client<{ id: string }[]>`
    INSERT INTO renewal_campaigns (slug, source_chat_id, target_chat_id, product_external_id,
      offer_external_id, title, status)
    VALUES (${`mat-${run}`}, ${chat("c1")}, ${chat("c2")}, ${GROUP}, ${RENEWAL_PLUS},
      'Path renewal', 'archived')
    RETURNING id`;

  try {
    // Her own renewal into c2 (paid by card): proves c1, the campaign's source.
    await purchase({
      customer_email_snapshot: `mat_${run}@example.test`,
      customer_id: customer!.id,
      offer_external_id: RENEWAL_PLUS,
      online_group_cohort_id: c2,
      source: "stripe",
      succeeded_at: new Date("2026-03-01T12:00:00Z"),
      telegram_user_id: telegram,
    });
    // c3 through an admin link on her Telegram account: not closed, not behind yet.
    await purchase({
      offer_external_id: PLUS,
      online_group_cohort_id: c3,
      source: "admin_offer_link",
      telegram_user_id: telegram,
    });
    // Someone else's admin link to c4.
    await purchase({
      offer_external_id: PLUS,
      online_group_cohort_id: c4,
      source: "admin_offer_link",
      telegram_user_id: stranger,
    });
    // The site verified her Telegram account in the c0 chat at a renewal checkout.
    await client`
      INSERT INTO telegram_renewal_verifications (campaign_id, checkout_session_id,
        telegram_user_id, source_chat_id, target_chat_id, status, verified_at, expires_at)
      VALUES (${campaign!.id}, ${`cs_mat_${run}`}, ${telegram}, ${chat("c0")}, ${chat("c2")},
        'verified', now(), now() + interval '1 day'),
      (${campaign!.id}, ${`cs_mat_other_${run}`}, ${stranger}, ${chat("c4")}, ${chat("c2")},
        'verified', now(), now() + interval '1 day')`;

    const { readMyAccessSnapshot } = await import("@/db/my-access");
    const snapshot = await readMyAccessSnapshot(getDatabase(), customer!.id);

    assert.deepEqual(
      [...(snapshot?.completedCohortIds ?? [])].sort(),
      [c0, c1, c2].sort(),
    );
    // The cards keep to her own purchases: the admin link adds none.
    assert.equal(snapshot?.purchases.length, 1);
  } finally {
    await client`DELETE FROM renewal_campaigns WHERE id = ${campaign!.id}`;
    await client`DELETE FROM purchases WHERE payment_intent_id IN ${client(intents)}`;
    await client`DELETE FROM customers WHERE id = ${customer!.id}`;
    await client`DELETE FROM online_group_cohorts WHERE id IN ${client([c0, c1, c2, c3, c4])}`;
    await client`DELETE FROM telegram_chats WHERE chat_id IN ${client(chats)}`;
  }
});

test("a purchase without a payment moment dates «Мой доступ» by the day it was recorded", async () => {
  const run = randomUUID().replaceAll("-", "").slice(0, 12);
  const email = `mad_${run}@example.test`;
  const [customer] = await client<{ id: string }[]>`
    INSERT INTO customers (email, normalized_email, full_name)
    VALUES (${email}, ${email}, 'Dates Tester')
    RETURNING id`;
  const intents = [`pi_mad_${run}_card`, `adm_offer_pi_mad_${run}`];

  try {
    await client`
      INSERT INTO purchases ${client([
        {
          amount_minor: 5000,
          currency: "pln",
          customer_email_snapshot: email,
          customer_id: customer!.id,
          first_seen_at: new Date("2026-11-19T12:00:00Z"),
          offer_external_id: PLUS,
          outcome: "succeeded",
          payment_intent_id: intents[0]!,
          product_external_id: GROUP,
          source: "stripe",
          stripe_status: "succeeded",
          succeeded_at: new Date("2026-11-19T12:00:00Z"),
        },
        // Anna's personal link of an earlier cycle: no payment moment on record.
        {
          amount_minor: 0,
          currency: "pln",
          customer_email_snapshot: email,
          customer_id: customer!.id,
          first_seen_at: new Date("2026-08-04T09:00:00Z"),
          offer_external_id: PLUS,
          outcome: "succeeded",
          payment_intent_id: intents[1]!,
          product_external_id: GROUP,
          source: "admin_offer_link",
          stripe_status: "succeeded",
          succeeded_at: null,
        },
      ])}`;

    const { readMyAccessSnapshot } = await import("@/db/my-access");
    const { buildMyAccessJourney } = await import("@/lib/my-access/journey");
    const snapshot = await readMyAccessSnapshot(getDatabase(), customer!.id);

    // The header reads the first one: «с нами с» August, not the day of the card.
    assert.deepEqual(
      snapshot?.purchases.map((purchase) => purchase.boughtAt.toISOString()),
      ["2026-08-04T09:00:00.000Z", "2026-11-19T12:00:00.000Z"],
    );
    const [step] = buildMyAccessJourney({ ...snapshot!, completedCohortIds: ["x"] }, []);
    assert.equal(step?.since, "2026-08-04T09:00:00.000Z");
    assert.equal(step?.purchasedAt, "2026-11-19T12:00:00.000Z");
  } finally {
    await client`DELETE FROM purchases WHERE payment_intent_id IN ${client(intents)}`;
    await client`DELETE FROM customers WHERE id = ${customer!.id}`;
  }
});
