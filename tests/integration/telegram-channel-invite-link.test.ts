import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test, { after, type TestContext } from "node:test";

import postgres from "postgres";

import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import { getDatabaseClient } from "@/db/client";
import { findPaymentRecordByIntentIdFromDatabase } from "@/db/payment-records";
import { ensureTelegramAccessLinkForPayment } from "@/lib/telegram/access";
import { upsertTelegramUserBindingRecord } from "@/lib/telegram/access-persistence";

import { createTestTelegramUserIdPair } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

// Characterisation of the choreo / first-touch / lifetime channel link as it is
// issued today (HARD-05): the behaviour must survive moving the code around.

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.TELEGRAM_BOT_TOKEN = "channel-invite-link-test-token";
delete process.env.TELEGRAM_ACCESS_LINK_TTL_DAYS;
delete process.env.TELEGRAM_CHOREO_ACCESS_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN = randomUUID().replaceAll("-", "").slice(0, 12);
const CHOREO = SELLABLE_PRODUCTS["choreo-still-alive"];
const CHOREO_OFFER = CHOREO.offers[0]!.id;
const UNCONFIGURED_CHOREO_OFFER = CHOREO.offers[1]!.id;
const LIFETIME = SELLABLE_PRODUCTS["choreo-birthday-drop"];
const LIFETIME_OFFER = LIFETIME.offers[0]!.id;
const ONLINE_GROUP = SELLABLE_PRODUCTS["online-group-anna-strok"];
const CHOREO_CHAT = `-100${RUN}1`;
const LIFETIME_CHAT = `-100${RUN}2`;
const [OWNER] = createTestTelegramUserIdPair();

process.env.TELEGRAM_CHANNEL_TARGETS_JSON = JSON.stringify({
  [CHOREO_OFFER]: { chatId: CHOREO_CHAT },
  [LIFETIME_OFFER]: { chatId: LIFETIME_CHAT },
});

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

function stubTelegram(
  context: TestContext,
  { failInvite = false }: { failInvite?: boolean } = {},
): TelegramCall[] {
  const calls: TelegramCall[] = [];
  context.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL, init?: RequestInit) => {
      const method = String(url).split("/").pop() ?? "";
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ body, method });
      if (method === "createChatInviteLink" && failInvite) {
        return Response.json(
          { description: "Bad Request: not enough rights", ok: false },
          { status: 400 },
        );
      }
      const result =
        method === "createChatInviteLink"
          ? { invite_link: `https://t.me/+chan${randomUUID().slice(0, 10)}` }
          : true;
      return Response.json({ ok: true, result });
    },
  );
  return calls;
}

async function insertPayment({
  email = `channel_${randomUUID()}@example.test`,
  expiresAt = null,
  offerId,
  outcome = "succeeded",
  productId,
  startsAt = null,
}: {
  email?: string;
  expiresAt?: Date | null;
  offerId: string;
  outcome?: string;
  productId: string;
  startsAt?: Date | null;
}) {
  const paymentIntentId = `pi_channel_link_${randomUUID()}`;
  createdIntents.push(paymentIntentId);
  const [purchase] = await client<{ id: string }[]>`
    INSERT INTO purchases (payment_intent_id, customer_email_snapshot, product_external_id,
      offer_external_id, amount_minor, currency, stripe_status, outcome)
    VALUES (${paymentIntentId}, ${email}, ${productId}, ${offerId}, 6000, 'pln',
      ${outcome}, ${outcome})
    RETURNING id
  `;
  assert.ok(purchase);
  await client`
    INSERT INTO access_entitlements (purchase_id, access_key, delivery_channel, access_workflow,
      status, external_target_type, starts_at, expires_at)
    VALUES (${purchase.id}, 'primary', 'telegram', 'telegram-chat', 'pending', 'telegram_chat',
      ${startsAt}, ${expiresAt})
  `;
  const paymentRecord = await findPaymentRecordByIntentIdFromDatabase(paymentIntentId);
  assert.ok(paymentRecord);
  return { email, paymentIntentId, paymentRecord, purchaseId: purchase.id };
}

async function insertToken({
  chatId,
  expiresAt,
  purchaseId,
  status,
  telegramUserId = null,
}: {
  chatId: string;
  expiresAt: Date;
  purchaseId: string;
  status: "issued" | "used";
  telegramUserId?: string | null;
}) {
  const link = `https://t.me/+old${randomUUID().slice(0, 10)}`;
  const tokenId = `tgi_old_${randomUUID().slice(0, 12)}`;
  await client`
    INSERT INTO telegram_access_tokens (token_id, token_hash, token_value, purchase_id,
      link_kind, chat_id, status, expires_at, used_at, telegram_user_id, created_at)
    VALUES (${tokenId}, ${createHash("sha256").update(link).digest("hex")},
      ${status === "issued" ? link : null}, ${purchaseId}, 'channel_invite', ${chatId},
      ${status}, ${expiresAt}, ${status === "used" ? new Date() : null}, ${telegramUserId},
      ${new Date(Date.now() - DAY_MS)})
  `;
  return { link, tokenId };
}

const readEntitlement = async (purchaseId: string) => {
  const [row] = await client<
    {
      currentTokenId: string | null;
      expiresAt: Date | null;
      revokedAt: Date | null;
      status: string;
      telegramChatId: string | null;
      telegramUserId: string | null;
    }[]
  >`SELECT current_token_id AS "currentTokenId", expires_at AS "expiresAt",
      revoked_at AS "revokedAt", status, telegram_chat_id AS "telegramChatId",
      telegram_user_id AS "telegramUserId"
    FROM access_entitlements WHERE purchase_id = ${purchaseId} AND access_key = 'primary'`;
  return row;
};

const readTokens = (purchaseId: string) =>
  client<
    {
      accessExpiresAt: Date | null;
      chatId: string | null;
      expiresAt: Date;
      linkKind: string;
      status: string;
      tokenHash: string;
      tokenId: string;
      tokenValue: string | null;
    }[]
  >`SELECT access_expires_at AS "accessExpiresAt", chat_id AS "chatId", expires_at AS "expiresAt",
      link_kind AS "linkKind", status, token_hash AS "tokenHash", token_id AS "tokenId",
      token_value AS "tokenValue"
    FROM telegram_access_tokens WHERE purchase_id = ${purchaseId} ORDER BY created_at`;

test("an Online Group, an unpaid or an unconfigured payment gets no channel link", async (t) => {
  const calls = stubTelegram(t);
  const group = await insertPayment({
    offerId: ONLINE_GROUP.offers[0]!.id,
    productId: ONLINE_GROUP.id,
  });
  const unpaid = await insertPayment({
    offerId: CHOREO_OFFER,
    outcome: "processing",
    productId: CHOREO.id,
  });
  const unconfigured = await insertPayment({
    offerId: UNCONFIGURED_CHOREO_OFFER,
    productId: CHOREO.id,
  });
  const empty = {
    accessUrl: null,
    status: "not_available",
    tokenExpiresAt: null,
    tokenId: null,
  };

  assert.deepEqual(await ensureTelegramAccessLinkForPayment(group.paymentRecord), {
    ...empty,
    reason: "offer_not_supported",
  });
  assert.deepEqual(await ensureTelegramAccessLinkForPayment(unpaid.paymentRecord), {
    ...empty,
    reason: "not_succeeded_payment",
  });
  assert.deepEqual(await ensureTelegramAccessLinkForPayment(unconfigured.paymentRecord), {
    ...empty,
    reason: "channel_not_configured",
  });
  assert.equal(calls.length, 0);
  assert.equal((await readEntitlement(unconfigured.purchaseId))?.status, "pending");
});

test("a paid choreo gets one single-use 30-day link; asking again returns the same one", async (t) => {
  const calls = stubTelegram(t);
  const payment = await insertPayment({ offerId: CHOREO_OFFER, productId: CHOREO.id });
  const before = Date.now();

  const first = await ensureTelegramAccessLinkForPayment(payment.paymentRecord);
  const [again, concurrentA, concurrentB] = await Promise.all([
    ensureTelegramAccessLinkForPayment(payment.paymentRecord),
    ensureTelegramAccessLinkForPayment(payment.paymentRecord),
    ensureTelegramAccessLinkForPayment(payment.paymentRecord),
  ]);

  assert.equal(first.status, "ready");
  assert.ok(first.accessUrl?.startsWith("https://t.me/+chan"));
  assert.match(first.tokenId ?? "", /^tgi_[0-9a-f]{16}$/);
  assert.deepEqual(again, first);
  assert.deepEqual(concurrentA, first);
  assert.deepEqual(concurrentB, first);

  assert.deepEqual(
    calls.map((call) => call.method),
    ["createChatInviteLink"],
  );
  const invite = calls[0]!.body;
  assert.equal(invite.chat_id, CHOREO_CHAT);
  assert.equal(invite.member_limit, 1);
  assert.equal(invite.name, first.tokenId);
  const expireDate = Number(invite.expire_date) * 1000;
  assert.ok(Math.abs(expireDate - (before + 30 * DAY_MS)) < 60_000);
  assert.equal(
    Math.floor(Date.parse(first.tokenExpiresAt ?? "") / 1000),
    Number(invite.expire_date),
  );

  const tokens = await readTokens(payment.purchaseId);
  assert.equal(tokens.length, 1);
  assert.deepEqual(
    { ...tokens[0], expiresAt: tokens[0]!.expiresAt.toISOString() },
    {
      accessExpiresAt: null,
      chatId: CHOREO_CHAT,
      expiresAt: first.tokenExpiresAt,
      linkKind: "channel_invite",
      status: "issued",
      tokenHash: createHash("sha256")
        .update(first.accessUrl ?? "")
        .digest("hex"),
      tokenId: first.tokenId,
      tokenValue: first.accessUrl,
    },
  );
  assert.deepEqual(await readEntitlement(payment.purchaseId), {
    currentTokenId: first.tokenId,
    expiresAt: null,
    revokedAt: null,
    status: "token_issued",
    telegramChatId: CHOREO_CHAT,
    telegramUserId: null,
  });
});

test("a lifetime offer gets a link and never an access end", async (t) => {
  const calls = stubTelegram(t);
  const payment = await insertPayment({
    offerId: LIFETIME_OFFER,
    productId: LIFETIME.id,
  });

  const result = await ensureTelegramAccessLinkForPayment(payment.paymentRecord);

  assert.equal(result.status, "ready");
  assert.equal(calls[0]?.body.chat_id, LIFETIME_CHAT);
  const entitlement = await readEntitlement(payment.purchaseId);
  assert.equal(entitlement?.status, "token_issued");
  assert.equal(entitlement?.expiresAt, null);
  assert.equal((await readTokens(payment.purchaseId))[0]?.accessExpiresAt, null);
});

test("a Telegram failure leaves link_failed and no token", async (t) => {
  stubTelegram(t, { failInvite: true });
  const payment = await insertPayment({ offerId: CHOREO_OFFER, productId: CHOREO.id });

  const result = await ensureTelegramAccessLinkForPayment(payment.paymentRecord);

  assert.deepEqual(result, {
    accessUrl: null,
    reason: "telegram_api_failed",
    status: "not_available",
    tokenExpiresAt: null,
    tokenId: null,
  });
  assert.equal((await readTokens(payment.purchaseId)).length, 0);
  const entitlement = await readEntitlement(payment.purchaseId);
  assert.equal(entitlement?.status, "link_failed");
  assert.equal(entitlement?.telegramChatId, CHOREO_CHAT);
});

test("a used link for the channel answers already_activated without a new link", async (t) => {
  const calls = stubTelegram(t);
  const payment = await insertPayment({ offerId: CHOREO_OFFER, productId: CHOREO.id });
  await insertToken({
    chatId: CHOREO_CHAT,
    expiresAt: new Date(Date.now() + DAY_MS),
    purchaseId: payment.purchaseId,
    status: "used",
    telegramUserId: OWNER,
  });

  const result = await ensureTelegramAccessLinkForPayment(payment.paymentRecord);

  assert.equal(result.status, "not_available");
  assert.equal(result.status === "not_available" && result.reason, "already_activated");
  assert.equal(calls.length, 0);
});

test("an issued link that ran out is replaced and the old one closed", async (t) => {
  const calls = stubTelegram(t);
  const payment = await insertPayment({ offerId: CHOREO_OFFER, productId: CHOREO.id });
  const old = await insertToken({
    chatId: CHOREO_CHAT,
    expiresAt: new Date(Date.now() - 60_000),
    purchaseId: payment.purchaseId,
    status: "issued",
  });

  const result = await ensureTelegramAccessLinkForPayment(payment.paymentRecord);

  assert.equal(result.status, "ready");
  assert.notEqual(result.tokenId, old.tokenId);
  assert.equal(calls.length, 1);
  const tokens = await readTokens(payment.purchaseId);
  assert.deepEqual(
    tokens.map((token) => [token.tokenId, token.status, token.tokenValue]),
    [
      [old.tokenId, "revoked", null],
      [result.tokenId, "issued", result.accessUrl],
    ],
  );
});

test("an ended access window answers access_window_expired and records it", async (t) => {
  const calls = stubTelegram(t);
  const payment = await insertPayment({
    expiresAt: new Date(Date.now() - DAY_MS),
    offerId: CHOREO_OFFER,
    productId: CHOREO.id,
    startsAt: new Date(Date.now() - 61 * DAY_MS),
  });

  const result = await ensureTelegramAccessLinkForPayment(payment.paymentRecord);

  assert.equal(
    result.status === "not_available" && result.reason,
    "access_window_expired",
  );
  assert.equal(calls.length, 0);
  const entitlement = await readEntitlement(payment.purchaseId);
  assert.equal(entitlement?.status, "expired");
  assert.equal(entitlement?.telegramChatId, CHOREO_CHAT);
  assert.ok(entitlement?.revokedAt);
});

test("a repeat buyer whose account already sits in the channel is bound at once", async (t) => {
  stubTelegram(t);
  const email = `channel_repeat_${randomUUID()}@example.test`;
  const earlier = await insertPayment({
    email,
    offerId: CHOREO_OFFER,
    productId: CHOREO.id,
  });
  const runningUntil = new Date(Date.now() + 30 * DAY_MS);
  await upsertTelegramUserBindingRecord({
    access_expires_at: runningUntil.toISOString(),
    bound_at: new Date(Date.now() - 30 * DAY_MS).toISOString(),
    chat_id: CHOREO_CHAT,
    customer_email: email,
    invite_link: "",
    last_seen_at: new Date().toISOString(),
    offer_id: CHOREO_OFFER,
    payment_intent_id: earlier.paymentIntentId,
    product_id: CHOREO.id,
    revoked_at: "",
    revoked_reason: "",
    status: "active",
    telegram_user_id: OWNER,
    telegram_username: "repeat_buyer",
  });
  const renewedUntil = new Date(Date.now() + 60 * DAY_MS);
  const repeat = await insertPayment({
    email,
    expiresAt: renewedUntil,
    offerId: CHOREO_OFFER,
    productId: CHOREO.id,
  });

  const result = await ensureTelegramAccessLinkForPayment(repeat.paymentRecord);

  assert.equal(result.status, "ready");
  assert.equal(
    (await readTokens(repeat.purchaseId))[0]?.accessExpiresAt?.toISOString(),
    renewedUntil.toISOString(),
  );
  const entitlement = await readEntitlement(repeat.purchaseId);
  assert.equal(entitlement?.status, "activated");
  assert.equal(entitlement?.telegramUserId, OWNER);
  assert.equal(entitlement?.expiresAt?.toISOString(), renewedUntil.toISOString());
  const [binding] = await client<
    { accessExpiresAt: Date | null; status: string; telegramUserId: string }[]
  >`SELECT access_expires_at AS "accessExpiresAt", status, telegram_user_id AS "telegramUserId"
    FROM telegram_user_bindings WHERE purchase_id = ${repeat.purchaseId}`;
  assert.deepEqual(binding, {
    accessExpiresAt: renewedUntil,
    status: "active",
    telegramUserId: OWNER,
  });
});
