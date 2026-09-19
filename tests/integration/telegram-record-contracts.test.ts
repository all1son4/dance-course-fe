import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import {
  claimTelegramAccessTokenRecord,
  upsertTelegramAccessTokenRecord,
  upsertTelegramUserBindingRecord,
} from "@/lib/telegram/access-persistence";
import {
  findTelegramAccessTokenRecordByTokenHash,
  findTelegramUserBindingByPaymentIntentId,
} from "@/lib/telegram/access-read-runtime";

import {
  createTelegramBindingFixture,
  createTelegramTokenFixture,
} from "../helpers/telegram-records";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, { max: 4, prepare: false });
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const createdAt = "2026-09-07T08:00:00.000Z";
const expiresAt = "2026-09-08T08:00:00.000Z";
const createPurchase = async () => {
  const suffix = randomUUID();
  const paymentIntentId = `pi_drop04_telegram_${suffix}`;
  const [purchase] = await client<{ id: string }[]>`
    INSERT INTO purchases (
      payment_intent_id, customer_email_snapshot, product_external_id,
      offer_external_id, amount_minor, currency, stripe_status, outcome
    ) VALUES (
      ${paymentIntentId}, 'fallback@example.test', 'fixture_product',
      'fixture_offer', 5000, 'eur', 'succeeded', 'succeeded'
    ) RETURNING id
  `;
  assert.ok(purchase);
  return {
    id: purchase.id,
    paymentIntentId,
    token: createTelegramTokenFixture({
      created_at: createdAt,
      expires_at: expiresAt,
      link_kind: "channel_invite",
      payment_intent_id: paymentIntentId,
      status: "issued",
      token_hash: `hash_fixture_${suffix}`,
      token_id: `tga_fixture_${suffix}`,
    }),
  };
};

test("Telegram DB projections preserve every field, empty values and snapshot precedence", async () => {
  const fixture = await createPurchase();
  try {
    const expectedToken = {
      ...fixture.token,
      customer_email: "fallback@example.test",
      offer_id: "fixture_offer",
      product_id: "fixture_product",
    };
    assert.deepEqual(await upsertTelegramAccessTokenRecord(fixture.token), expectedToken);
    assert.deepEqual(
      await findTelegramAccessTokenRecordByTokenHash(fixture.token.token_hash),
      expectedToken,
    );

    const populatedToken = {
      ...expectedToken,
      access_expires_at: expiresAt,
      chat_id: "-1001234567890",
      customer_email: "token@example.test",
      last_error: "fixture_error",
      link_kind: "start_token",
      status: "used",
      telegram_user_id: "9007199254740993",
      telegram_username: "fixture_owner",
      token_value: "fixture_bearer+/=",
      used_at: createdAt,
    };
    assert.deepEqual(
      await upsertTelegramAccessTokenRecord(populatedToken),
      populatedToken,
    );

    const binding = createTelegramBindingFixture({
      bound_at: createdAt,
      payment_intent_id: fixture.paymentIntentId,
      status: "active",
      telegram_user_id: "9007199254740993",
    });
    const expectedBinding = {
      ...binding,
      customer_email: "fallback@example.test",
      last_seen_at: createdAt,
      offer_id: "fixture_offer",
      product_id: "fixture_product",
    };
    assert.deepEqual(await upsertTelegramUserBindingRecord(binding), expectedBinding);
    assert.deepEqual(
      await findTelegramUserBindingByPaymentIntentId(fixture.paymentIntentId),
      expectedBinding,
    );

    const populatedBinding = {
      ...expectedBinding,
      access_expires_at: expiresAt,
      chat_id: "-1001234567890",
      customer_email: "binding@example.test",
      invite_link: "https://t.me/+fixture_only",
      last_seen_at: expiresAt,
      revoked_at: expiresAt,
      revoked_reason: "fixture_expired",
      status: "revoked",
      telegram_username: "fixture_owner",
    };
    assert.deepEqual(
      await upsertTelegramUserBindingRecord(populatedBinding),
      populatedBinding,
    );
  } finally {
    await client`DELETE FROM purchases WHERE id = ${fixture.id}`;
  }
});

test("Telegram claim keeps the exact expiry boundary and distinct missing/unavailable results", async () => {
  const fixture = await createPurchase();
  const claim = {
    claimedAt: expiresAt,
    telegramUserId: "fixture_owner",
    telegramUsername: "fixture_owner",
    tokenHash: fixture.token.token_hash,
  };
  try {
    assert.deepEqual(await claimTelegramAccessTokenRecord(claim), {
      record: null,
      status: "not_found",
    });
    await upsertTelegramAccessTokenRecord(fixture.token);
    const expired = await claimTelegramAccessTokenRecord(claim);
    assert.equal(expired.status, "expired");
    assert.equal(expired.record?.status, "expired");
    assert.equal(expired.record?.used_at, "");
    assert.equal(expired.record?.telegram_user_id, "");

    const unavailable = await claimTelegramAccessTokenRecord(claim);
    assert.equal(unavailable.status, "unavailable");
    assert.deepEqual(unavailable.record, expired.record);
  } finally {
    await client`DELETE FROM purchases WHERE id = ${fixture.id}`;
  }
});
