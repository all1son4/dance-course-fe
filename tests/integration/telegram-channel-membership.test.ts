import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test, { after, type TestContext } from "node:test";

import postgres from "postgres";

import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import { getDatabaseClient } from "@/db/client";
import { upsertTelegramUserBindingRecord } from "@/lib/telegram/access-persistence";
import { syncTelegramChannelMembership } from "@/lib/telegram/channel-membership";

import { createTestTelegramUserIdPair } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

// Characterisation of channel joins and leaves (choreo / lifetime) as the Telegram
// webhook drives them today (HARD-05).

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.TELEGRAM_BOT_TOKEN = "channel-membership-test-token";
delete process.env.TELEGRAM_CHOREO_ACCESS_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;
const CHOREO = SELLABLE_PRODUCTS["choreo-still-alive"];
const CHOREO_OFFER = CHOREO.offers[0]!.id;
const LIFETIME = SELLABLE_PRODUCTS["choreo-birthday-drop"];
const LIFETIME_OFFER = LIFETIME.offers[0]!.id;
const [OWNER, STRANGER] = createTestTelegramUserIdPair();

const applicationClient = getDatabaseClient();
const client = postgres(databaseUrl, { max: 3, prepare: false });
const createdIntents: string[] = [];

after(async () => {
  if (createdIntents.length) {
    await client`DELETE FROM purchases WHERE payment_intent_id IN ${client(createdIntents)}`;
  }
  await Promise.all([client.end(), applicationClient.end()]);
});

type TelegramCall = { body: Record<string, unknown>; method: string };

function stubTelegram(context: TestContext): TelegramCall[] {
  const calls: TelegramCall[] = [];
  context.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL, init?: RequestInit) => {
      calls.push({
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
        method: String(url).split("/").pop() ?? "",
      });
      return Response.json({ ok: true, result: true });
    },
  );
  return calls;
}

/** A paid channel purchase with one issued single-use invite, as the issuer leaves it. */
async function issueChannelInvite({
  expiresAt = null,
  offerId,
  outcome = "succeeded",
  productId,
  startsAt = null,
}: {
  expiresAt?: Date | null;
  offerId: string;
  outcome?: string;
  productId: string;
  startsAt?: Date | null;
}) {
  const paymentIntentId = `pi_channel_member_${randomUUID()}`;
  const email = `channel_member_${randomUUID()}@example.test`;
  const chatId = `-100${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const inviteLink = `https://t.me/+member${randomUUID().slice(0, 10)}`;
  const tokenId = `tgi_member_${randomUUID().slice(0, 12)}`;
  createdIntents.push(paymentIntentId);
  const [purchase] = await client<{ id: string }[]>`
    INSERT INTO purchases (payment_intent_id, customer_email_snapshot, product_external_id,
      offer_external_id, amount_minor, currency, stripe_status, outcome)
    VALUES (${paymentIntentId}, ${email}, ${productId}, ${offerId}, 6000, 'pln',
      ${outcome}, ${outcome})
    RETURNING id
  `;
  assert.ok(purchase);
  const [entitlement] = await client<{ id: string }[]>`
    INSERT INTO access_entitlements (purchase_id, access_key, delivery_channel, access_workflow,
      status, external_target_type, telegram_chat_id, current_token_id, starts_at, expires_at)
    VALUES (${purchase.id}, 'primary', 'telegram', 'telegram-chat', 'token_issued',
      'telegram_chat', ${chatId}, ${tokenId}, ${startsAt}, ${expiresAt})
    RETURNING id
  `;
  assert.ok(entitlement);
  await client`
    INSERT INTO telegram_access_tokens (token_id, token_hash, token_value, purchase_id,
      entitlement_id, link_kind, chat_id, status, expires_at, access_expires_at)
    VALUES (${tokenId}, ${createHash("sha256").update(inviteLink).digest("hex")}, ${inviteLink},
      ${purchase.id}, ${entitlement.id}, 'channel_invite', ${chatId}, 'issued',
      ${new Date(Date.now() + 30 * DAY_MS)}, ${expiresAt})
  `;
  return { chatId, email, inviteLink, paymentIntentId, purchaseId: purchase.id, tokenId };
}

const join = (
  fixture: { chatId: string; inviteLink: string },
  telegramUserId: string,
  username = "member_name",
) =>
  syncTelegramChannelMembership({
    chatId: fixture.chatId,
    inviteLink: fixture.inviteLink,
    membershipStatus: "joined",
    telegramUserId,
    telegramUsername: username,
  });

const leave = (fixture: { chatId: string }, telegramUserId: string) =>
  syncTelegramChannelMembership({
    chatId: fixture.chatId,
    membershipStatus: "left",
    telegramUserId,
  });

const readState = async (purchaseId: string) => {
  const [row] = await client<
    {
      bindingExpiresAt: Date | null;
      bindingReason: string | null;
      bindingStatus: string | null;
      bindingUserId: string | null;
      entitlementExpiresAt: Date | null;
      entitlementStartsAt: Date | null;
      entitlementStatus: string;
      tokenLastError: string | null;
      tokenStatus: string;
      tokenUserId: string | null;
    }[]
  >`
    SELECT binding.access_expires_at AS "bindingExpiresAt",
      binding.revoked_reason AS "bindingReason", binding.status AS "bindingStatus",
      binding.telegram_user_id AS "bindingUserId",
      entitlement.expires_at AS "entitlementExpiresAt",
      entitlement.starts_at AS "entitlementStartsAt", entitlement.status AS "entitlementStatus",
      token.last_error AS "tokenLastError", token.status AS "tokenStatus",
      token.telegram_user_id AS "tokenUserId"
    FROM purchases purchase
    JOIN access_entitlements entitlement
      ON entitlement.purchase_id = purchase.id AND entitlement.access_key = 'primary'
    JOIN telegram_access_tokens token ON token.purchase_id = purchase.id
    LEFT JOIN telegram_user_bindings binding ON binding.purchase_id = purchase.id
    WHERE purchase.id = ${purchaseId}
  `;
  assert.ok(row);
  return row;
};

const banCalls = (calls: TelegramCall[]) =>
  calls
    .filter((call) => call.method === "banChatMember")
    .map((call) => [call.body.chat_id, call.body.user_id]);

test("an event without chat, user or a tracked invite is not handled", async (t) => {
  const calls = stubTelegram(t);

  assert.deepEqual(
    await syncTelegramChannelMembership({
      chatId: " ",
      inviteLink: "https://t.me/+x",
      membershipStatus: "joined",
      telegramUserId: OWNER,
    }),
    { handled: false, reason: "missing_chat_or_user" },
  );
  assert.deepEqual(
    await syncTelegramChannelMembership({
      chatId: "-1001",
      membershipStatus: "joined",
      telegramUserId: OWNER,
    }),
    { handled: false, reason: "missing_invite_link" },
  );
  assert.deepEqual(
    await join(
      { chatId: "-1001", inviteLink: `https://t.me/+none${randomUUID()}` },
      OWNER,
    ),
    { handled: false, reason: "invite_link_not_tracked" },
  );
  assert.equal(calls.length, 0);
});

test("an invite of a purchase that is not paid is closed on use", async (t) => {
  const calls = stubTelegram(t);
  const fixture = await issueChannelInvite({
    offerId: CHOREO_OFFER,
    outcome: "processing",
    productId: CHOREO.id,
  });

  assert.deepEqual(await join(fixture, OWNER), {
    handled: false,
    reason: "payment_not_available",
  });
  const state = await readState(fixture.purchaseId);
  assert.equal(state.tokenStatus, "revoked");
  assert.equal(state.tokenLastError, "payment_not_available");
  assert.equal(state.bindingStatus, null);
  assert.equal(calls.length, 0);
});

test("a choreo join starts its 60-day window at the join", async (t) => {
  const calls = stubTelegram(t);
  const fixture = await issueChannelInvite({
    offerId: CHOREO_OFFER,
    productId: CHOREO.id,
  });

  assert.deepEqual(await join(fixture, OWNER), { handled: true });

  const state = await readState(fixture.purchaseId);
  assert.ok(state.entitlementStartsAt);
  assert.ok(Math.abs(state.entitlementStartsAt.getTime() - Date.now()) < 60_000);
  // The window is computed from the moment the join is first written; the final write
  // stamps the event's own (a few ms earlier) time as the start, so the end may lie a
  // few ms past start + 60 days.
  const windowMs =
    (state.entitlementExpiresAt?.getTime() ?? 0) - state.entitlementStartsAt.getTime();
  assert.ok(windowMs >= 60 * DAY_MS && windowMs < 60 * DAY_MS + 1_000, String(windowMs));
  assert.deepEqual(
    {
      bindingExpiresAt: state.bindingExpiresAt?.getTime(),
      bindingStatus: state.bindingStatus,
      bindingUserId: state.bindingUserId,
      entitlementStatus: state.entitlementStatus,
      tokenStatus: state.tokenStatus,
      tokenUserId: state.tokenUserId,
    },
    {
      bindingExpiresAt: state.entitlementExpiresAt?.getTime(),
      bindingStatus: "active",
      bindingUserId: OWNER,
      entitlementStatus: "activated",
      tokenStatus: "used",
      tokenUserId: OWNER,
    },
  );
  assert.equal(calls.length, 0);
});

test("a lifetime join, leave, second leave and rejoin", async (t) => {
  const calls = stubTelegram(t);
  const fixture = await issueChannelInvite({
    offerId: LIFETIME_OFFER,
    productId: LIFETIME.id,
  });

  assert.deepEqual(await join(fixture, OWNER), { handled: true });
  const joined = await readState(fixture.purchaseId);
  assert.equal(joined.entitlementStatus, "activated");
  assert.equal(joined.entitlementExpiresAt, null);
  assert.equal(joined.bindingExpiresAt, null);
  assert.equal(joined.bindingStatus, "active");

  assert.deepEqual(await leave(fixture, OWNER), { handled: true });
  const left = await readState(fixture.purchaseId);
  assert.equal(left.bindingStatus, "left");
  assert.equal(left.bindingReason, "left_channel");
  assert.equal(left.entitlementStatus, "left_channel");
  assert.deepEqual(await leave(fixture, OWNER), {
    handled: false,
    reason: "no_active_bindings",
  });
  assert.equal(calls.length, 0);

  assert.deepEqual(await join(fixture, OWNER), {
    handled: false,
    reason: "rejoin_not_allowed",
  });
  assert.deepEqual(banCalls(calls), [[fixture.chatId, OWNER]]);
  const rejoined = await readState(fixture.purchaseId);
  assert.equal(rejoined.tokenStatus, "used");
  assert.equal(rejoined.tokenLastError, "rejoin_not_allowed");
  assert.equal(rejoined.bindingStatus, "left");
});

test("another account using a claimed invite is removed", async (t) => {
  const calls = stubTelegram(t);
  const fixture = await issueChannelInvite({
    offerId: LIFETIME_OFFER,
    productId: LIFETIME.id,
  });

  assert.deepEqual(await join(fixture, OWNER), { handled: true });
  assert.deepEqual(await join(fixture, STRANGER, "stranger"), {
    handled: false,
    reason: "invite_claimed_by_another_user",
  });

  assert.deepEqual(banCalls(calls), [[fixture.chatId, STRANGER]]);
  const state = await readState(fixture.purchaseId);
  assert.equal(state.bindingUserId, OWNER);
  assert.equal(state.tokenUserId, OWNER);
});

test("a purchase already bound to another account removes the joiner", async (t) => {
  const calls = stubTelegram(t);
  const fixture = await issueChannelInvite({
    offerId: LIFETIME_OFFER,
    productId: LIFETIME.id,
  });
  await upsertTelegramUserBindingRecord({
    access_expires_at: "",
    bound_at: new Date().toISOString(),
    chat_id: fixture.chatId,
    customer_email: fixture.email,
    invite_link: "",
    last_seen_at: new Date().toISOString(),
    offer_id: LIFETIME_OFFER,
    payment_intent_id: fixture.paymentIntentId,
    product_id: LIFETIME.id,
    revoked_at: "",
    revoked_reason: "",
    status: "active",
    telegram_user_id: OWNER,
    telegram_username: "owner",
  });

  assert.deepEqual(await join(fixture, STRANGER, "stranger"), {
    handled: false,
    reason: "binding_claimed_by_another_user",
  });
  assert.deepEqual(banCalls(calls), [[fixture.chatId, STRANGER]]);
  const state = await readState(fixture.purchaseId);
  assert.equal(state.tokenStatus, "issued");
  assert.equal(state.bindingUserId, OWNER);
});

test("a join after the access window ended is recorded as revoked and removed", async (t) => {
  const calls = stubTelegram(t);
  const fixture = await issueChannelInvite({
    expiresAt: new Date(Date.now() - DAY_MS),
    offerId: CHOREO_OFFER,
    productId: CHOREO.id,
    startsAt: new Date(Date.now() - 61 * DAY_MS),
  });

  assert.deepEqual(await join(fixture, OWNER), { handled: true });

  assert.deepEqual(banCalls(calls), [[fixture.chatId, OWNER]]);
  const state = await readState(fixture.purchaseId);
  assert.equal(state.tokenStatus, "expired");
  assert.equal(state.bindingStatus, "revoked");
  assert.equal(state.bindingReason, "expired");
  assert.equal(state.bindingUserId, OWNER);
  assert.equal(state.entitlementStatus, "revoked");
});
