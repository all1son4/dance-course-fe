import assert from "node:assert/strict";
import test from "node:test";

import {
  PAYMENT_SHEET_HEADERS,
  type PaymentSheetRecord,
  TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
  TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
  type TelegramAccessTokenSheetRecord,
  type TelegramUserBindingSheetRecord,
} from "@/lib/google-sheets-schema";

import {
  claimTelegramAccessTokenRecord,
  persistTelegramPaymentAccess,
  type TelegramAccessPersistenceDependencies,
  upsertTelegramAccessTokenRecord,
  upsertTelegramUserBindingRecord,
} from "./access-persistence";

const fromHeaders = <Header extends string>(headers: readonly Header[]) =>
  Object.fromEntries(headers.map((header) => [header, ""])) as Record<Header, string>;

const createPaymentRecord = (): PaymentSheetRecord => ({
  ...fromHeaders(PAYMENT_SHEET_HEADERS),
  access_workflow: "telegram-chat",
  delivery_channel: "telegram",
  payment_intent_id: "pi_test",
  telegram_access_status: "pending",
});

const createTokenRecord = (): TelegramAccessTokenSheetRecord => ({
  ...fromHeaders(TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS),
  payment_intent_id: "pi_test",
  status: "issued",
  token_hash: "token_hash_test",
  token_id: "tga_test",
});

const createBindingRecord = (): TelegramUserBindingSheetRecord => ({
  ...fromHeaders(TELEGRAM_USER_BINDINGS_SHEET_HEADERS),
  chat_id: "-1001",
  payment_intent_id: "pi_test",
  status: "active",
  telegram_user_id: "user_test",
});

const createDependencies = (
  overrides: Partial<TelegramAccessPersistenceDependencies> = {},
): TelegramAccessPersistenceDependencies => {
  const paymentRecord = createPaymentRecord();
  const tokenRecord = createTokenRecord();
  const bindingRecord = createBindingRecord();

  return {
    claimToken: async () => ({ record: tokenRecord, status: "claimed" }),
    updatePaymentAccess: async () => paymentRecord,
    upsertBinding: async () => bindingRecord,
    upsertToken: async () => tokenRecord,
    ...overrides,
  };
};

test("routes token, claim, and binding writes only to PostgreSQL commands", async () => {
  const calls: unknown[] = [];
  const tokenRecord = createTokenRecord();
  const bindingRecord = createBindingRecord();
  const claim = {
    claimedAt: "2026-09-01T10:00:00.000Z",
    telegramUserId: "user_test",
    telegramUsername: "username_test",
    tokenHash: "token_hash_test",
  };
  const dependencies = createDependencies({
    claimToken: async (input) => {
      calls.push(["claim", input]);
      return { record: tokenRecord, status: "claimed" };
    },
    upsertBinding: async (record) => {
      calls.push(["binding", record]);
      return record;
    },
    upsertToken: async (record) => {
      calls.push(["token", record]);
      return record;
    },
  });

  const results = await Promise.all([
    upsertTelegramAccessTokenRecord(tokenRecord, dependencies),
    claimTelegramAccessTokenRecord(claim, dependencies),
    upsertTelegramUserBindingRecord(bindingRecord, dependencies),
  ]);

  assert.deepEqual(results, [
    tokenRecord,
    { record: tokenRecord, status: "claimed" },
    bindingRecord,
  ]);
  assert.deepEqual(calls, [
    ["token", tokenRecord],
    ["claim", claim],
    ["binding", bindingRecord],
  ]);
});

test("maps payment access patches to the PostgreSQL entitlement command", async () => {
  const paymentRecord = createPaymentRecord();
  let capturedCommand:
    | Parameters<TelegramAccessPersistenceDependencies["updatePaymentAccess"]>[0]
    | null = null;
  const dependencies = createDependencies({
    updatePaymentAccess: async (command) => {
      capturedCommand = command;
      return paymentRecord;
    },
  });

  const result = await persistTelegramPaymentAccess({
    dependencies,
    patch: {
      telegram_access_expires_at: "2026-11-01T10:00:00.000Z",
      telegram_access_revoked_at: "",
      telegram_access_status: "activated",
      telegram_channel_chat_id: "-1001",
      telegram_token_id: "tga_test",
      telegram_token_used_at: "2026-09-01T10:00:00.000Z",
      telegram_user_id: "user_test",
      telegram_username: "username_test",
      updated_at: "2026-09-01T10:00:01.000Z",
    },
    paymentRecord,
  });

  assert.deepEqual(capturedCommand, {
    accessWorkflow: "telegram-chat",
    currentTokenId: "tga_test",
    deliveryChannel: "telegram",
    expiresAt: new Date("2026-11-01T10:00:00.000Z"),
    externalTargetType: "telegram_chat",
    initialStatus: "pending",
    paymentIntentId: "pi_test",
    revokedAt: null,
    startsAt: new Date("2026-09-01T10:00:00.000Z"),
    status: "activated",
    telegramChatId: "-1001",
    telegramUserId: "user_test",
    telegramUsername: "username_test",
    updatedAt: new Date("2026-09-01T10:00:01.000Z"),
  });
  assert.equal(result.telegram_access_status, "activated");
  assert.equal(result.telegram_token_id, "tga_test");
  assert.equal(result.updated_at, "2026-09-01T10:00:01.000Z");
});

test("fails closed before writing an invalid access timestamp", async () => {
  let updateCalls = 0;
  const dependencies = createDependencies({
    updatePaymentAccess: async () => {
      updateCalls += 1;
      return createPaymentRecord();
    },
  });

  await assert.rejects(
    persistTelegramPaymentAccess({
      dependencies,
      patch: { telegram_access_expires_at: "invalid" },
      paymentRecord: createPaymentRecord(),
    }),
    /telegram_access_invalid_timestamp/u,
  );
  assert.equal(updateCalls, 0);
});
