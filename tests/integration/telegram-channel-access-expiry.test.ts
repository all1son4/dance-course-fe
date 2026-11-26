import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, type TestContext } from "node:test";

import postgres from "postgres";

import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import { getDatabaseClient } from "@/db/client";
import { revokeExpiredTelegramChannelAccess } from "@/lib/telegram/access";

import { createTestTelegramUserId } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

// Characterisation of the nightly sweep that ends timed channel access (HARD-05).
// The sweep reads every active binding in the database, so this file asserts only on
// its own rows; other files keep no ended timed channel binding.

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.TELEGRAM_BOT_TOKEN = "channel-access-expiry-test-token";
delete process.env.TELEGRAM_CHOREO_ACCESS_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;
const CHOREO = SELLABLE_PRODUCTS["choreo-still-alive"];
const CHOREO_OFFER = CHOREO.offers[0]!.id;
const LIFETIME = SELLABLE_PRODUCTS["choreo-birthday-drop"];
const LIFETIME_OFFER = LIFETIME.offers[0]!.id;

const applicationClient = getDatabaseClient();
const client = postgres(databaseUrl, { max: 3, prepare: false });
const createdIntents: string[] = [];

after(async () => {
  if (createdIntents.length) {
    await client`DELETE FROM purchases WHERE payment_intent_id IN ${client(createdIntents)}`;
  }
  await Promise.all([client.end(), applicationClient.end()]);
});

type TelegramCall = { chatId: string; method: string; userId: string };

function stubTelegram(
  context: TestContext,
  failures: Map<string, string> = new Map(),
): TelegramCall[] {
  const calls: TelegramCall[] = [];
  context.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const call = {
        chatId: String(body.chat_id),
        method: String(url).split("/").pop() ?? "",
        userId: String(body.user_id),
      };
      calls.push(call);
      const failure = failures.get(call.userId);
      return failure
        ? Response.json({ description: failure, ok: false }, { status: 400 })
        : Response.json({ ok: true, result: true });
    },
  );
  return calls;
}

const newChatId = () => `-100${randomUUID().replaceAll("-", "").slice(0, 12)}`;

/** An activated channel purchase whose member sits in the chat. */
async function seatMember({
  accessExpiresAt,
  boundAt = new Date(Date.now() - DAY_MS),
  chatId = newChatId(),
  offerId,
  productId,
  telegramUserId = createTestTelegramUserId(),
}: {
  accessExpiresAt: Date | null;
  boundAt?: Date;
  chatId?: string;
  offerId: string;
  productId: string;
  telegramUserId?: string;
}) {
  const paymentIntentId = `pi_channel_expiry_${randomUUID()}`;
  const email = `channel_expiry_${randomUUID()}@example.test`;
  createdIntents.push(paymentIntentId);
  const [purchase] = await client<{ id: string }[]>`
    INSERT INTO purchases (payment_intent_id, customer_email_snapshot, product_external_id,
      offer_external_id, amount_minor, currency, stripe_status, outcome)
    VALUES (${paymentIntentId}, ${email}, ${productId}, ${offerId}, 6000, 'pln',
      'succeeded', 'succeeded')
    RETURNING id
  `;
  assert.ok(purchase);
  const [entitlement] = await client<{ id: string }[]>`
    INSERT INTO access_entitlements (purchase_id, access_key, delivery_channel, access_workflow,
      status, external_target_type, telegram_chat_id, telegram_user_id, starts_at, expires_at)
    VALUES (${purchase.id}, 'primary', 'telegram', 'telegram-chat', 'activated',
      'telegram_chat', ${chatId}, ${telegramUserId}, ${boundAt}, ${accessExpiresAt})
    RETURNING id
  `;
  assert.ok(entitlement);
  await client`
    INSERT INTO telegram_user_bindings (purchase_id, entitlement_id, telegram_user_id,
      customer_email_snapshot, chat_id, bound_at, last_seen_at, access_expires_at, status)
    VALUES (${purchase.id}, ${entitlement.id}, ${telegramUserId}, ${email}, ${chatId},
      ${boundAt}, ${boundAt}, ${accessExpiresAt}, 'active')
  `;
  return { chatId, purchaseId: purchase.id, telegramUserId };
}

const readState = async (purchaseId: string) => {
  const [row] = await client<
    {
      bindingReason: string | null;
      bindingRevokedAt: Date | null;
      bindingStatus: string;
      entitlementRevokedAt: Date | null;
      entitlementStatus: string;
    }[]
  >`
    SELECT binding.revoked_reason AS "bindingReason", binding.revoked_at AS "bindingRevokedAt",
      binding.status AS "bindingStatus", entitlement.revoked_at AS "entitlementRevokedAt",
      entitlement.status AS "entitlementStatus"
    FROM telegram_user_bindings binding
    JOIN access_entitlements entitlement ON entitlement.purchase_id = binding.purchase_id
      AND entitlement.access_key = 'primary'
    WHERE binding.purchase_id = ${purchaseId}
  `;
  assert.ok(row);
  return row;
};

const isRevoked = (state: Awaited<ReturnType<typeof readState>>) =>
  state.bindingStatus === "revoked" &&
  state.bindingReason === "expired" &&
  Boolean(state.bindingRevokedAt) &&
  state.entitlementStatus === "revoked" &&
  Boolean(state.entitlementRevokedAt);

const isUntouched = (state: Awaited<ReturnType<typeof readState>>) =>
  state.bindingStatus === "active" &&
  state.bindingRevokedAt === null &&
  state.entitlementStatus === "activated";

test("the sweep removes only timed accesses whose latest end has passed", async (t) => {
  const calls = stubTelegram(t);
  const ended = await seatMember({
    accessExpiresAt: new Date(Date.now() - DAY_MS),
    offerId: CHOREO_OFFER,
    productId: CHOREO.id,
  });
  const running = await seatMember({
    accessExpiresAt: new Date(Date.now() + DAY_MS),
    offerId: CHOREO_OFFER,
    productId: CHOREO.id,
  });
  const lifetime = await seatMember({
    accessExpiresAt: new Date(Date.now() - DAY_MS),
    offerId: LIFETIME_OFFER,
    productId: LIFETIME.id,
  });
  // No saved end: bound 61 days ago, the 60-day choreo window has passed.
  const unsavedEnd = await seatMember({
    accessExpiresAt: null,
    boundAt: new Date(Date.now() - 61 * DAY_MS),
    offerId: CHOREO_OFFER,
    productId: CHOREO.id,
  });
  // One member, one chat, two purchases: the later end keeps both.
  const renewedOld = await seatMember({
    accessExpiresAt: new Date(Date.now() - DAY_MS),
    offerId: CHOREO_OFFER,
    productId: CHOREO.id,
  });
  const renewedNew = await seatMember({
    accessExpiresAt: new Date(Date.now() + 10 * DAY_MS),
    chatId: renewedOld.chatId,
    offerId: CHOREO_OFFER,
    productId: CHOREO.id,
    telegramUserId: renewedOld.telegramUserId,
  });

  const result = await revokeExpiredTelegramChannelAccess();

  assert.ok(isRevoked(await readState(ended.purchaseId)));
  assert.ok(isRevoked(await readState(unsavedEnd.purchaseId)));
  for (const fixture of [running, lifetime, renewedOld, renewedNew]) {
    assert.ok(isUntouched(await readState(fixture.purchaseId)), fixture.purchaseId);
  }
  const ownChats = new Set(
    [ended, running, lifetime, unsavedEnd, renewedOld].map((fixture) => fixture.chatId),
  );
  assert.deepEqual(
    calls
      .filter((call) => ownChats.has(call.chatId))
      .map((call) => [call.method, call.chatId, call.userId])
      .sort(),
    [
      ["banChatMember", ended.chatId, ended.telegramUserId],
      ["banChatMember", unsavedEnd.chatId, unsavedEnd.telegramUserId],
    ].sort(),
  );
  // Lifetime bindings never reach the groups; the renewed member is one group.
  assert.ok(result.processedGroups >= 4);
  assert.ok(result.revokedGroups >= 2);
  assert.ok(result.revokedBindings >= 2);
});

test("a refused kick keeps the access; a member already gone is closed", async (t) => {
  const refused = await seatMember({
    accessExpiresAt: new Date(Date.now() - DAY_MS),
    offerId: CHOREO_OFFER,
    productId: CHOREO.id,
  });
  const gone = await seatMember({
    accessExpiresAt: new Date(Date.now() - DAY_MS),
    offerId: CHOREO_OFFER,
    productId: CHOREO.id,
  });
  stubTelegram(
    t,
    new Map([
      [refused.telegramUserId, "Bad Request: not enough rights to restrict/unrestrict"],
      [gone.telegramUserId, "Bad Request: USER_NOT_PARTICIPANT"],
    ]),
  );

  const result = await revokeExpiredTelegramChannelAccess();

  assert.ok(isUntouched(await readState(refused.purchaseId)));
  assert.ok(isRevoked(await readState(gone.purchaseId)));
  assert.ok(result.failedGroups >= 1);
});
