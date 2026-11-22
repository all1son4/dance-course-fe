import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, type TestContext } from "node:test";

import postgres from "postgres";

import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import { getDatabase, getDatabaseClient } from "@/db/client";
import { listStartedPlusHubsWithoutInvite } from "@/db/hub-period-start";
import {
  createEmptyPaymentRecord,
  type PaymentRecordSnapshot,
} from "@/lib/payment-record";
import { ensureOnlineGroupAccessForPayment } from "@/lib/telegram/online-group-access";

import { upsertPaymentRecordToDatabase } from "../helpers/legacy-payment-writer";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.TELEGRAM_BOT_TOKEN = "plus-hub-start-day-test-token";

const applicationClient = getDatabaseClient();
const client = postgres(databaseUrl, { max: 3, prepare: false });

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const PLUS_OFFER = SELLABLE_PRODUCTS["online-group-anna-strok"].offers.find(
  (offer) => offer.id === "off_online_group_anna_strok_library_access",
)!;

const stubTelegram = (context: TestContext) =>
  context.mock.method(globalThis, "fetch", async (url: string | URL) => {
    const method = String(url).split("/").pop() ?? "";
    const result =
      method === "createChatInviteLink"
        ? { invite_link: `https://t.me/+plushub${randomUUID().slice(0, 8)}` }
        : true;
    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { "Content-Type": "application/json" },
    });
  });

test("HUB-D49: a new Plus buyer outside the Hub gets the Hub invite at payment, before the start", async (t) => {
  stubTelegram(t);
  const mainChat = `plus_hub_main_${randomUUID()}`;
  const hubChat = `plus_hub_hub_${randomUUID()}`;
  const startsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  await client`INSERT INTO telegram_chats (chat_id, title, type) VALUES
    (${mainChat}, 'Cohort 3', 'supergroup'), (${hubChat}, 'Hub', 'supergroup')`;
  const [cohort] = await client<{ id: string }[]>`
    INSERT INTO online_group_cohorts (title, main_chat_id, starts_at, sales_enabled)
    VALUES ('Cohort 3', ${mainChat}, ${startsAt.toISOString()}, true) RETURNING id`;
  const record: PaymentRecordSnapshot = {
    ...createEmptyPaymentRecord(),
    access_workflow: "telegram-online-group",
    amount: "38000",
    currency: "pln",
    customer_email: `plus_hub_${randomUUID()}@example.test`,
    delivery_channel: "telegram",
    first_seen_at: new Date().toISOString(),
    offer_id: PLUS_OFFER.id,
    outcome: "succeeded",
    payment_intent_id: `pi_plus_hub_${randomUUID()}`,
    status: "succeeded",
    telegram_channel_chat_id: mainChat,
    telegram_inspiration_chat_id: hubChat,
    updated_at: new Date().toISOString(),
  };

  try {
    await upsertPaymentRecordToDatabase(record);
    await client`UPDATE purchases SET online_group_cohort_id = ${cohort!.id}
      WHERE payment_intent_id = ${record.payment_intent_id}`;

    // HUB-D49: both invites at payment; the days before the start are a gift.
    const atPayment = (await ensureOnlineGroupAccessForPayment(record)) ?? [];
    const main = atPayment.find((access) => access.accessKey === "main-group");
    const hub = atPayment.find((access) => access.accessKey === "inspiration-hub");
    assert.equal(main?.status, "ready");
    assert.equal(hub?.status, "ready");
    assert.match(hub?.accessUrl ?? "", /^https:\/\/t\.me\//u);
    assert.equal(hub?.accessStartsAt, "");

    // The start-day job has nothing left to send for this purchase.
    await client`UPDATE online_group_cohorts
      SET starts_at = (date_trunc('day', now() AT TIME ZONE 'Europe/Warsaw')
        + interval '23 hours 59 minutes') AT TIME ZONE 'Europe/Warsaw'
      WHERE id = ${cohort!.id}`;
    const due = await listStartedPlusHubsWithoutInvite(getDatabase(), {
      livemode: false,
      now: new Date(),
    });
    assert.equal(
      due.some((item) => item.paymentIntentId === record.payment_intent_id),
      false,
      "the invite went out at payment",
    );
  } finally {
    await client`DELETE FROM purchases WHERE payment_intent_id = ${record.payment_intent_id}`;
    await client`DELETE FROM online_group_cohorts WHERE id = ${cohort!.id}`;
    await client`DELETE FROM telegram_chats WHERE chat_id IN (${mainChat}, ${hubChat})`;
  }
});
