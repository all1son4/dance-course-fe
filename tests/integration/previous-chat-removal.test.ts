import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, type TestContext } from "node:test";

import postgres from "postgres";

import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import { getDatabaseClient } from "@/db/client";
import {
  createEmptyPaymentRecord,
  type PaymentRecordSnapshot,
} from "@/lib/payment-record";
import {
  ensureOnlineGroupAccessForPayment,
  syncOnlineGroupMembership,
} from "@/lib/telegram/online-group-access";

import { upsertPaymentRecordToDatabase } from "../helpers/legacy-payment-writer";
import { createTestTelegramUserIdPair } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.TELEGRAM_BOT_TOKEN = "previous-chat-removal-test-token";

const applicationClient = getDatabaseClient();
const client = postgres(databaseUrl, { max: 3, prepare: false });

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const [MEMBER] = createTestTelegramUserIdPair();
const STANDARD_OFFER = SELLABLE_PRODUCTS["online-group-anna-strok"].offers[0]!;

type TelegramCall = { method: string; body: Record<string, unknown> };

/** Telegram stub: invites and bans succeed, getChatMember answers `previousStatus`. */
const stubTelegram = (context: TestContext, previousStatus: string) => {
  const calls: TelegramCall[] = [];
  context.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL, init?: RequestInit) => {
      const method = String(url).split("/").pop() ?? "";
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ body, method });
      const result =
        method === "createChatInviteLink"
          ? { invite_link: `https://t.me/+removal${randomUUID().slice(0, 8)}` }
          : method === "getChatMember"
            ? { status: previousStatus, user: { id: Number(body.user_id) } }
            : true;
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  return calls;
};

/** Cohort #2 (closed) and cohort #3 with the switch as given; a Standard buyer of #3. */
const setUp = async (removes: boolean) => {
  const previousChat = `removal_prev_${randomUUID()}`;
  const newChat = `removal_new_${randomUUID()}`;
  await client`INSERT INTO telegram_chats (chat_id, title, type) VALUES
    (${previousChat}, 'Cohort 2', 'supergroup'), (${newChat}, 'Cohort 3', 'supergroup')`;
  const [previous] = await client<{ id: string }[]>`
    INSERT INTO online_group_cohorts (title, main_chat_id, starts_at, closed_at, access_ends_at,
      lessons_cleared_at)
    VALUES ('Cohort 2', ${previousChat}, now() - interval '90 days',
      now() - interval '3 days', now() - interval '2 days', now() - interval '3 days')
    RETURNING id`;
  const [cohort] = await client<{ id: string }[]>`
    INSERT INTO online_group_cohorts (title, main_chat_id, starts_at, previous_cohort_id,
      sales_enabled, removes_previous_chat_members)
    VALUES ('Cohort 3', ${newChat}, now() - interval '1 day', ${previous!.id}, true, ${removes})
    RETURNING id`;
  const record: PaymentRecordSnapshot = {
    ...createEmptyPaymentRecord(),
    access_workflow: "telegram-online-group",
    amount: "22000",
    currency: "pln",
    customer_email: `removal_${randomUUID()}@example.test`,
    delivery_channel: "telegram",
    first_seen_at: new Date().toISOString(),
    offer_id: STANDARD_OFFER.id,
    outcome: "succeeded",
    payment_intent_id: `pi_removal_${randomUUID()}`,
    status: "succeeded",
    telegram_channel_chat_id: newChat,
    updated_at: new Date().toISOString(),
  };
  await upsertPaymentRecordToDatabase(record);
  await client`UPDATE purchases SET online_group_cohort_id = ${cohort!.id}
    WHERE payment_intent_id = ${record.payment_intent_id}`;

  const cleanup = async () => {
    await client`DELETE FROM purchase_side_effects WHERE purchase_id IN (
      SELECT id FROM purchases WHERE payment_intent_id = ${record.payment_intent_id})`;
    await client`DELETE FROM purchases WHERE payment_intent_id = ${record.payment_intent_id}`;
    await client`DELETE FROM online_group_cohorts WHERE id = ${cohort!.id}`;
    await client`DELETE FROM online_group_cohorts WHERE id = ${previous!.id}`;
    await client`DELETE FROM telegram_chats WHERE chat_id IN (${previousChat}, ${newChat})`;
  };

  return { cleanup, newChat, previousChat, record };
};

const joinNewCohort = async (record: PaymentRecordSnapshot, newChat: string) => {
  const [access] = (await ensureOnlineGroupAccessForPayment(record)) ?? [];
  assert.equal(access?.status, "ready");
  return syncOnlineGroupMembership({
    chatId: newChat,
    inviteLink: access!.accessUrl,
    membershipStatus: "joined",
    telegramUserId: MEMBER,
  });
};

test("HUB-D44 on: joining cohort #3 by one's own invite removes the member from #2", async (t) => {
  const calls = stubTelegram(t, "member");
  const { cleanup, newChat, previousChat, record } = await setUp(true);
  try {
    assert.equal(await joinNewCohort(record, newChat), true);

    const ban = calls.find((call) => call.method === "banChatMember");
    assert.equal(ban?.body.chat_id, previousChat);
    assert.equal(String(ban?.body.user_id), MEMBER);
    assert.ok(
      Number(ban?.body.until_date) > Date.now() / 1000,
      "a short ban, not forever",
    );

    const [job] = await client<{ status: string }[]>`
      SELECT effect.status FROM purchase_side_effects effect
      JOIN purchases purchase ON purchase.id = effect.purchase_id
      WHERE purchase.payment_intent_id = ${record.payment_intent_id}
        AND effect.kind = 'online_group_previous_chat_removal'`;
    assert.equal(job?.status, "sent");
  } finally {
    await cleanup();
  }
});

test("HUB-D44 off (the default): the member stays in the previous chat", async (t) => {
  const calls = stubTelegram(t, "member");
  const { cleanup, newChat, record } = await setUp(false);
  try {
    assert.equal(await joinNewCohort(record, newChat), true);

    assert.equal(
      calls.some((call) => call.method === "banChatMember"),
      false,
    );
    const jobs = await client`
      SELECT 1 FROM purchase_side_effects effect
      JOIN purchases purchase ON purchase.id = effect.purchase_id
      WHERE purchase.payment_intent_id = ${record.payment_intent_id}
        AND effect.kind = 'online_group_previous_chat_removal'`;
    assert.equal(jobs.length, 0);
  } finally {
    await cleanup();
  }
});

test("an administrator of the previous chat is never removed", async (t) => {
  const calls = stubTelegram(t, "administrator");
  const { cleanup, newChat, record } = await setUp(true);
  try {
    assert.equal(await joinNewCohort(record, newChat), true);

    assert.ok(calls.some((call) => call.method === "getChatMember"));
    assert.equal(
      calls.some((call) => call.method === "banChatMember"),
      false,
    );
  } finally {
    await cleanup();
  }
});
