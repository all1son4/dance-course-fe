import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test, { after, before, type TestContext } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import { findPaymentRecordByIntentIdFromDatabase } from "@/db/payment-records";
import {
  findTelegramUserBindingByPaymentIntentIdFromDatabase,
  upsertTelegramUserBindingRecordToDatabase,
} from "@/db/sheet-records";
import {
  findActiveTelegramUserBindings,
  findLatestTelegramAccessTokenRecordByPaymentIntentId,
  findPaymentRecordByIntentId,
  findTelegramAccessTokenRecordByTokenHash,
  findTelegramAccessTokenRecordByTokenValue,
  findTelegramUserBindingByPaymentIntentId,
  findTelegramUserBindingsByCustomerEmail,
  findTelegramUserBindingsByTelegramUserId,
  findTelegramUserBindingsByTelegramUserIdAndChatId,
} from "@/lib/telegram/access-read-runtime";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, {
  max: 4,
  prepare: false,
});
const applicationClient = getDatabaseClient();
let activateTelegramStartToken: typeof import("@/lib/telegram/access").activateTelegramStartToken;
let ensureLegacyTelegramBotStartLinkForPayment: typeof import("@/lib/telegram/access").ensureLegacyTelegramBotStartLinkForPayment;
let syncTelegramChannelMembership: typeof import("@/lib/telegram/access").syncTelegramChannelMembership;

before(async () => {
  ({
    activateTelegramStartToken,
    ensureLegacyTelegramBotStartLinkForPayment,
    syncTelegramChannelMembership,
  } = await import("@/lib/telegram/access"));
});

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const restoreEnvironmentVariable = (name: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
};

const configureDatabaseOnlyTelegramAccess = (context: TestContext) => {
  const previousMode = process.env.DB_TELEGRAM_ACCESS_MODE;
  const previousBotUsername = process.env.TELEGRAM_BOT_USERNAME;
  const previousGooglePrivateKey = process.env.GOOGLE_PRIVATE_KEY;
  const previousGoogleEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const previousGoogleSheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  process.env.DB_TELEGRAM_ACCESS_MODE = "database";
  process.env.TELEGRAM_BOT_USERNAME = "write04_fixture_bot";
  delete process.env.GOOGLE_PRIVATE_KEY;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  context.after(() => {
    restoreEnvironmentVariable("DB_TELEGRAM_ACCESS_MODE", previousMode);
    restoreEnvironmentVariable("TELEGRAM_BOT_USERNAME", previousBotUsername);
    restoreEnvironmentVariable("GOOGLE_PRIVATE_KEY", previousGooglePrivateKey);
    restoreEnvironmentVariable("GOOGLE_SERVICE_ACCOUNT_EMAIL", previousGoogleEmail);
    restoreEnvironmentVariable("GOOGLE_SHEETS_SPREADSHEET_ID", previousGoogleSheetId);
  });
};

test("activates legacy Telegram access through PostgreSQL without Sheets", async (t) => {
  const suffix = randomUUID().replaceAll("-", "");
  const paymentIntentId = `pi_write04_${suffix}`;

  configureDatabaseOnlyTelegramAccess(t);

  try {
    const [purchase] = await client<{ id: string }[]>`
      INSERT INTO purchases (
        payment_intent_id,
        customer_email_snapshot,
        product_external_id,
        offer_external_id,
        amount_minor,
        currency,
        stripe_status,
        outcome
      ) VALUES (
        ${paymentIntentId},
        'write04@example.test',
        'prd_2QfH8nW5cK3y',
        'off_5DxR2mL8qJ4v',
        6000,
        'pln',
        'succeeded',
        'succeeded'
      )
      RETURNING id
    `;

    assert.ok(purchase);

    await client`
      INSERT INTO access_entitlements (
        purchase_id,
        access_key,
        delivery_channel,
        access_workflow,
        status,
        external_target_type
      ) VALUES (
        ${purchase.id},
        'primary',
        'telegram',
        'telegram-bot',
        'pending',
        'telegram_bot'
      )
    `;

    const paymentRecord = await findPaymentRecordByIntentIdFromDatabase(paymentIntentId);

    assert.ok(paymentRecord);

    const accessUrl = await ensureLegacyTelegramBotStartLinkForPayment(paymentRecord);

    assert.ok(accessUrl);
    const tokenValue = new URL(accessUrl).searchParams.get("start");

    assert.ok(tokenValue);

    const activation = await activateTelegramStartToken({
      telegramUserId: "write04-user",
      telegramUsername: "write04_username",
      tokenValue,
    });
    const retry = await activateTelegramStartToken({
      telegramUserId: "write04-user",
      telegramUsername: "write04_username",
      tokenValue,
    });
    const binding =
      await findTelegramUserBindingByPaymentIntentIdFromDatabase(paymentIntentId);

    assert.ok(binding);

    const tokenHash = createHash("sha256").update(tokenValue).digest("hex");
    const [
      runtimePayment,
      latestToken,
      tokenByHash,
      tokenByValue,
      runtimeBinding,
      bindingsByEmail,
      bindingsByUser,
      bindingsByUserAndChat,
      activeBindings,
    ] = await Promise.all([
      findPaymentRecordByIntentId(paymentIntentId),
      findLatestTelegramAccessTokenRecordByPaymentIntentId(paymentIntentId),
      findTelegramAccessTokenRecordByTokenHash(tokenHash),
      findTelegramAccessTokenRecordByTokenValue(tokenValue),
      findTelegramUserBindingByPaymentIntentId(paymentIntentId),
      findTelegramUserBindingsByCustomerEmail("WRITE04@example.test"),
      findTelegramUserBindingsByTelegramUserId("write04-user"),
      findTelegramUserBindingsByTelegramUserIdAndChatId({
        chatId: "",
        telegramUserId: "write04-user",
      }),
      findActiveTelegramUserBindings(),
    ]);

    assert.equal(runtimePayment?.payment_intent_id, paymentIntentId);
    assert.ok(latestToken);
    assert.ok(latestToken.token_id.startsWith("tga_"));
    assert.equal(tokenByHash?.token_id, latestToken.token_id);
    assert.equal(tokenByValue?.token_id, latestToken.token_id);
    assert.equal(runtimeBinding?.payment_intent_id, paymentIntentId);
    assert.ok(
      bindingsByEmail.some((record) => record.payment_intent_id === paymentIntentId),
    );
    assert.ok(
      bindingsByUser.some((record) => record.payment_intent_id === paymentIntentId),
    );
    assert.ok(
      bindingsByUserAndChat.some(
        (record) => record.payment_intent_id === paymentIntentId,
      ),
    );
    assert.ok(
      activeBindings.some((record) => record.payment_intent_id === paymentIntentId),
    );

    await Promise.all(
      Array.from({ length: 8 }, () => upsertTelegramUserBindingRecordToDatabase(binding)),
    );
    const [stored] = await client<
      {
        amountMinor: number;
        bindingCount: number;
        bindingStatus: string;
        currentTokenId: string | null;
        entitlementStatus: string;
        outcome: string;
        tokenStatus: string;
        tokenUserId: string | null;
      }[]
    >`
      SELECT
        purchase.amount_minor AS "amountMinor",
        count(binding.id)::int AS "bindingCount",
        max(binding.status) AS "bindingStatus",
        entitlement.current_token_id AS "currentTokenId",
        entitlement.status AS "entitlementStatus",
        purchase.outcome,
        token.status AS "tokenStatus",
        token.telegram_user_id AS "tokenUserId"
      FROM purchases purchase
      JOIN access_entitlements entitlement
        ON entitlement.purchase_id = purchase.id
        AND entitlement.access_key = 'primary'
      JOIN telegram_access_tokens token
        ON token.purchase_id = purchase.id
      LEFT JOIN telegram_user_bindings binding
        ON binding.purchase_id = purchase.id
      WHERE purchase.payment_intent_id = ${paymentIntentId}
      GROUP BY
        purchase.amount_minor,
        entitlement.current_token_id,
        entitlement.status,
        purchase.outcome,
        token.status,
        token.telegram_user_id
    `;

    assert.equal(activation.status, "activated");
    assert.equal(retry.status, "already_activated");
    assert.ok(stored);
    const { currentTokenId, ...storedWithoutTokenId } = stored;

    assert.ok(currentTokenId?.startsWith("tga_"));
    assert.deepEqual(storedWithoutTokenId, {
      amountMinor: 6_000,
      bindingCount: 1,
      bindingStatus: "active",
      entitlementStatus: "activated",
      outcome: "succeeded",
      tokenStatus: "used",
      tokenUserId: "write04-user",
    });
  } finally {
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id = ${paymentIntentId}
    `;
  }
});

test("preserves timed join and leave semantics in PostgreSQL-only mode", async (t) => {
  const suffix = randomUUID().replaceAll("-", "");
  const paymentIntentId = `pi_write04_timed_${suffix}`;
  const inviteLink = `https://t.me/+write04-${suffix}`;
  const chatId = `-100${suffix.slice(0, 12)}`;

  configureDatabaseOnlyTelegramAccess(t);

  try {
    const [purchase] = await client<{ id: string }[]>`
      INSERT INTO purchases (
        payment_intent_id,
        customer_email_snapshot,
        product_external_id,
        offer_external_id,
        amount_minor,
        currency,
        stripe_status,
        outcome
      ) VALUES (
        ${paymentIntentId},
        'write04-timed@example.test',
        'prd_7VnL4kX2mQ8s',
        'off_4BcM9pR6tH1x',
        5000,
        'eur',
        'succeeded',
        'succeeded'
      )
      RETURNING id
    `;

    assert.ok(purchase);

    const [entitlement] = await client<{ id: string }[]>`
      INSERT INTO access_entitlements (
        purchase_id,
        access_key,
        delivery_channel,
        access_workflow,
        status,
        external_target_type
      ) VALUES (
        ${purchase.id},
        'primary',
        'telegram',
        'telegram-chat',
        'token_issued',
        'telegram_chat'
      )
      RETURNING id
    `;

    assert.ok(entitlement);

    await client`
      INSERT INTO telegram_access_tokens (
        token_id,
        token_hash,
        token_value,
        purchase_id,
        entitlement_id,
        link_kind,
        chat_id,
        status,
        expires_at
      ) VALUES (
        ${`tgi_write04_${suffix}`},
        ${`hash_write04_${suffix}`},
        ${inviteLink},
        ${purchase.id},
        ${entitlement.id},
        'channel_invite',
        ${chatId},
        'issued',
        ${new Date(Date.now() + 24 * 60 * 60 * 1_000)}
      )
    `;

    const joined = await syncTelegramChannelMembership({
      chatId,
      inviteLink,
      membershipStatus: "joined",
      telegramUserId: "write04-timed-user",
      telegramUsername: "write04_timed_username",
    });
    const [afterJoin] = await client<
      {
        bindingStatus: string;
        entitlementExpiresAt: Date | null;
        entitlementStartsAt: Date | null;
        entitlementStatus: string;
        tokenStatus: string;
      }[]
    >`
      SELECT
        binding.status AS "bindingStatus",
        entitlement.expires_at AS "entitlementExpiresAt",
        entitlement.starts_at AS "entitlementStartsAt",
        entitlement.status AS "entitlementStatus",
        token.status AS "tokenStatus"
      FROM purchases purchase
      JOIN access_entitlements entitlement
        ON entitlement.purchase_id = purchase.id
        AND entitlement.access_key = 'primary'
      JOIN telegram_access_tokens token
        ON token.purchase_id = purchase.id
      JOIN telegram_user_bindings binding
        ON binding.purchase_id = purchase.id
      WHERE purchase.payment_intent_id = ${paymentIntentId}
    `;

    assert.deepEqual(joined, { handled: true });
    assert.equal(afterJoin?.bindingStatus, "active");
    assert.equal(afterJoin?.entitlementStatus, "activated");
    assert.equal(afterJoin?.tokenStatus, "used");
    assert.ok(afterJoin?.entitlementStartsAt);
    assert.ok(afterJoin?.entitlementExpiresAt);
    assert.ok(
      afterJoin.entitlementExpiresAt.getTime() > afterJoin.entitlementStartsAt.getTime(),
    );

    const left = await syncTelegramChannelMembership({
      chatId,
      membershipStatus: "left",
      telegramUserId: "write04-timed-user",
      telegramUsername: "write04_timed_username",
    });
    const [afterLeave] = await client<
      { bindingStatus: string; entitlementStatus: string }[]
    >`
      SELECT
        binding.status AS "bindingStatus",
        entitlement.status AS "entitlementStatus"
      FROM purchases purchase
      JOIN access_entitlements entitlement
        ON entitlement.purchase_id = purchase.id
        AND entitlement.access_key = 'primary'
      JOIN telegram_user_bindings binding
        ON binding.purchase_id = purchase.id
      WHERE purchase.payment_intent_id = ${paymentIntentId}
    `;

    assert.deepEqual(left, { handled: true });
    assert.deepEqual(afterLeave, {
      bindingStatus: "left",
      entitlementStatus: "left_channel",
    });
  } finally {
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id = ${paymentIntentId}
    `;
  }
});
