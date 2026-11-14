import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, type TestContext } from "node:test";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { buildPurchaseSuccessEmail } from "@/app/api/stripe/webhook/_lib/purchase-success-email";
import { POST as requestAccessLink } from "@/app/api/telegram/access-link/route";
import {
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { getDatabaseClient } from "@/db/client";
import { findPaymentRecordByIntentIdFromDatabase } from "@/db/payment-records";
import { ensureHubPurchaseAccessInDatabase } from "@/db/purchase-access-source";
import * as schema from "@/db/schema";
import {
  ensureOnlineGroupAccessForPayment,
  syncOnlineGroupMembership,
} from "@/lib/telegram/online-group-access";
import { revokeExpiredOnlineGroupHubAccess } from "@/lib/telegram/online-group-hub-expiry";

import { lockHubSettingsForTest } from "../helpers/hub-settings-lock";
import { createTestTelegramUserIdPair } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.TELEGRAM_BOT_TOKEN = "hub-delivery-test-token";

const applicationClient = getDatabaseClient();
const client = postgres(databaseUrl, { max: 3, prepare: false });
const db = drizzle(client, { schema });

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const DAY_MS = 24 * 60 * 60 * 1000;
const [OWNER, STRANGER] = createTestTelegramUserIdPair();
const ROLLBACK = new Error("rollback_hub_delivery_cron");

type TelegramCall = { method: string; chatId: string; userId: string };

function stubTelegram(context: TestContext): TelegramCall[] {
  const calls: TelegramCall[] = [];
  context.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL, init?: RequestInit) => {
      const method = String(url).split("/").pop() ?? "";
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ method, chatId: String(body.chat_id), userId: String(body.user_id) });
      const result =
        method === "createChatInviteLink"
          ? { invite_link: `https://t.me/+hub${randomUUID().slice(0, 8)}` }
          : true;
      return Response.json({ ok: true, result });
    },
  );
  return calls;
}

/** A paid full-price Hub purchase whose access job (А4) has run. */
async function buyHub(hubChatId: string) {
  const paymentIntentId = `pi_hub_delivery_${randomUUID()}`;
  const checkoutSessionId = `checkout_${randomUUID()}`;
  const paidAt = new Date(Date.now() - DAY_MS);
  const [purchase] = await client<{ id: string }[]>`
    INSERT INTO purchases (payment_intent_id, amount_minor, currency, stripe_status, outcome,
      succeeded_at, offer_external_id, product_external_id, checkout_session_id,
      customer_email_snapshot)
    VALUES (${paymentIntentId}, 4000, 'eur', 'succeeded', 'succeeded', ${paidAt.toISOString()},
      ${INSPIRATION_HUB_ACCESS_OFFER_ID}, ${SELLABLE_PRODUCTS["inspiration-hub"].id},
      ${checkoutSessionId}, ${`hub_${randomUUID()}@example.test`})
    RETURNING id
  `;
  assert.ok(purchase);
  const right = await ensureHubPurchaseAccessInDatabase({
    purchaseId: purchase.id,
    continuationCohortId: null,
    processedAt: new Date(),
    verifiedTelegramUserId: null,
  });
  assert.ok(right.right.expiresAt);
  return {
    checkoutSessionId,
    hubChatId,
    paymentIntentId,
    periodEnd: right.right.expiresAt,
    purchaseId: purchase.id,
    rightId: right.right.id,
  };
}

async function withHubChat(run: (hubChatId: string) => Promise<void>) {
  const unlock = await lockHubSettingsForTest(client);
  const hubChatId = `hub_delivery_${randomUUID()}`;
  await client`INSERT INTO telegram_chats (chat_id, title, type)
    VALUES (${hubChatId}, 'Inspiration Hub', 'supergroup')`;
  const [previous] = await client<{ telegram_chat_id: string }[]>`
    SELECT telegram_chat_id FROM inspiration_hub_settings WHERE id = 1`;
  await client`INSERT INTO inspiration_hub_settings (telegram_chat_id) VALUES (${hubChatId})
    ON CONFLICT (id) DO UPDATE SET telegram_chat_id = excluded.telegram_chat_id`;
  try {
    await run(hubChatId);
  } finally {
    if (previous) {
      await client`UPDATE inspiration_hub_settings
        SET telegram_chat_id = ${previous.telegram_chat_id} WHERE id = 1`;
    } else {
      await client`DELETE FROM inspiration_hub_settings WHERE id = 1`;
    }
    await client`DELETE FROM purchases WHERE offer_external_id = ${INSPIRATION_HUB_ACCESS_OFFER_ID}
      AND id IN (SELECT purchase_id FROM telegram_access_tokens WHERE chat_id = ${hubChatId})`;
    await client`DELETE FROM purchases WHERE id IN (
      SELECT purchase_id FROM access_entitlements WHERE telegram_chat_id = ${hubChatId})`;
    await client`DELETE FROM telegram_chats WHERE chat_id = ${hubChatId}`;
    await unlock();
  }
}

const readRight = async (rightId: string) => {
  const [right] = await client<
    { status: string; telegram_chat_id: string | null; telegram_user_id: string | null }[]
  >`SELECT status, telegram_chat_id, telegram_user_id FROM access_entitlements
    WHERE id = ${rightId}`;
  return right;
};

test("Hub purchase → invite in email and on the success page → join → removal after the end", async (t) => {
  const calls = stubTelegram(t);
  await withHubChat(async (hubChatId) => {
    const purchase = await buyHub(hubChatId);
    const paymentRecord = await findPaymentRecordByIntentIdFromDatabase(
      purchase.paymentIntentId,
    );
    assert.ok(paymentRecord);

    // No main-group right is created for a Hub purchase (А9).
    const [rights] = await client<{ keys: string[] }[]>`
      SELECT array_agg(access_key ORDER BY access_key) AS keys FROM access_entitlements
      WHERE purchase_id = ${purchase.purchaseId}`;
    assert.deepEqual(rights?.keys, ["inspiration-hub"]);

    // The email path: one personal invite into the shared Hub, until the period end.
    const [access] = (await ensureOnlineGroupAccessForPayment(paymentRecord)) ?? [];
    assert.equal(access?.accessKey, "inspiration-hub");
    assert.equal(access?.status, "ready");
    assert.equal(access?.accessExpiresAt, purchase.periodEnd.toISOString());
    const invite = calls.find((call) => call.method === "createChatInviteLink");
    assert.equal(invite?.chatId, hubChatId);

    const email = buildPurchaseSuccessEmail({
      accessDurationDays: 56,
      accessKind: "telegram-inspiration-hub",
      amountMinor: "4000",
      checkoutCurrency: "eur",
      checkoutLocale: "ru",
      inspirationAccessExpiresAt: access.accessExpiresAt,
      offerLabel: "Полная цена",
      productTitle: "Inspiration Hub",
      receiptLink: null,
      subjectLine: "Inspiration Hub",
      telegramAccessLinks: [access],
    });
    assert.ok(email.html.includes(access.accessUrl));
    assert.match(email.text, /Доступ в Inspiration Hub/u);
    assert.doesNotMatch(email.text, /на время потока/u);

    // The success page asks the same route and gets the same invite.
    const page = await requestAccessLink(
      new Request("http://localhost/api/telegram/access-link", {
        body: JSON.stringify({
          checkoutSessionId: purchase.checkoutSessionId,
          paymentIntentId: purchase.paymentIntentId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
    const pageBody = (await page.json()) as {
      accesses?: { accessUrl: string }[];
      status: string;
    };
    assert.equal(pageBody.status, "ready");
    assert.equal(pageBody.accesses?.[0]?.accessUrl, access.accessUrl);

    // Joining through the invite binds the account and names the purchase owner.
    assert.equal(
      await syncOnlineGroupMembership({
        chatId: hubChatId,
        inviteLink: access.accessUrl,
        membershipStatus: "joined",
        telegramUserId: OWNER,
      }),
      true,
    );
    assert.deepEqual(await readRight(purchase.rightId), {
      status: "activated",
      telegram_chat_id: hubChatId,
      telegram_user_id: OWNER,
    });
    const [owner] = await client<{ telegram_user_id: string }[]>`
      SELECT telegram_user_id FROM purchases WHERE id = ${purchase.purchaseId}`;
    assert.equal(owner?.telegram_user_id, OWNER);

    // A member who is already in the Hub gets no second invite.
    const [again] = (await ensureOnlineGroupAccessForPayment(paymentRecord)) ?? [];
    assert.equal(again?.status, "active");

    // After the period the cron removes the member and marks the right expired.
    const afterEnd = new Date(purchase.periodEnd.getTime() + DAY_MS);
    try {
      await db.transaction(async (tx) => {
        await revokeExpiredOnlineGroupHubAccess({
          database: tx,
          now: afterEnd,
          reportProblems: async () => {},
        });
        const [ended] = await tx
          .select({ status: schema.accessEntitlements.status })
          .from(schema.accessEntitlements)
          .where(eq(schema.accessEntitlements.id, purchase.rightId));
        assert.equal(ended?.status, "expired");
        assert.ok(
          calls.some(
            (call) =>
              call.method === "banChatMember" &&
              call.chatId === hubChatId &&
              call.userId === OWNER,
          ),
        );
        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }
  });
});

test("a different account cannot use the Hub invite", async (t) => {
  const calls = stubTelegram(t);
  await withHubChat(async (hubChatId) => {
    const purchase = await buyHub(hubChatId);
    await client`UPDATE purchases SET telegram_user_id = ${OWNER} WHERE id = ${purchase.purchaseId}`;
    const paymentRecord = await findPaymentRecordByIntentIdFromDatabase(
      purchase.paymentIntentId,
    );
    assert.ok(paymentRecord);
    const [access] = (await ensureOnlineGroupAccessForPayment(paymentRecord)) ?? [];
    assert.ok(access?.accessUrl);

    await syncOnlineGroupMembership({
      chatId: hubChatId,
      inviteLink: access.accessUrl,
      membershipStatus: "joined",
      telegramUserId: STRANGER,
    });

    assert.ok(
      calls.some((call) => call.method === "banChatMember" && call.userId === STRANGER),
    );
    assert.equal((await readRight(purchase.rightId))?.telegram_user_id, OWNER);
  });
});
