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
  findActiveTelegramUserBindings,
  findLatestTelegramAccessTokenRecordByPaymentIntentId,
  findPaymentRecordByIntentId,
  findTelegramAccessTokenRecordByTokenHash,
  findTelegramAccessTokenRecordByTokenValue,
  findTelegramUserBindingByPaymentIntentId,
  findTelegramUserBindingsByCustomerEmail,
  findTelegramUserBindingsByTelegramUserId,
  findTelegramUserBindingsByTelegramUserIdAndChatId,
  type TelegramAccessReadDependencies,
  type TelegramAccessReadSource,
} from "./access-read-runtime";

const fromHeaders = <Header extends string>(headers: readonly Header[]) =>
  Object.fromEntries(headers.map((header) => [header, ""])) as Record<Header, string>;

const createPaymentRecord = (): PaymentSheetRecord => ({
  ...fromHeaders(PAYMENT_SHEET_HEADERS),
  payment_intent_id: "pi_test",
});

const createTokenRecord = (): TelegramAccessTokenSheetRecord => ({
  ...fromHeaders(TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS),
  payment_intent_id: "pi_test",
  status: "issued",
  token_hash: "token_hash_test",
  token_id: "tga_test",
  token_value: "bearer_test",
});

const createBindingRecord = (): TelegramUserBindingSheetRecord => ({
  ...fromHeaders(TELEGRAM_USER_BINDINGS_SHEET_HEADERS),
  chat_id: "-1001",
  customer_email: "customer@example.com",
  payment_intent_id: "pi_test",
  status: "active",
  telegram_user_id: "user_test",
});

const createSource = (
  overrides: Partial<TelegramAccessReadSource> = {},
): TelegramAccessReadSource => ({
  findActiveBindings: async () => [],
  findBindingByPaymentIntentId: async () => null,
  findBindingsByCustomerEmail: async () => [],
  findBindingsByTelegramUserId: async () => [],
  findBindingsByTelegramUserIdAndChatId: async () => [],
  findLatestTokenByPaymentIntentId: async () => null,
  findPaymentByIntentId: async () => null,
  findTokenByHash: async () => null,
  findTokenByValue: async () => null,
  ...overrides,
});

const createDependencies = (
  database: Partial<TelegramAccessReadSource> = {},
): TelegramAccessReadDependencies => ({
  database: createSource(database),
});

test("routes every Telegram access read to PostgreSQL with unchanged lookup keys", async () => {
  const calls: string[] = [];
  const paymentRecord = createPaymentRecord();
  const tokenRecord = createTokenRecord();
  const bindingRecord = createBindingRecord();
  const dependencies = createDependencies({
    findActiveBindings: async () => {
      calls.push("active");
      return [bindingRecord];
    },
    findBindingByPaymentIntentId: async (paymentIntentId) => {
      calls.push(`binding-payment:${paymentIntentId}`);
      return bindingRecord;
    },
    findBindingsByCustomerEmail: async (customerEmail) => {
      calls.push(`binding-email:${customerEmail}`);
      return [bindingRecord];
    },
    findBindingsByTelegramUserId: async (telegramUserId) => {
      calls.push(`binding-user:${telegramUserId}`);
      return [bindingRecord];
    },
    findBindingsByTelegramUserIdAndChatId: async (input) => {
      calls.push(`binding-user-chat:${input.telegramUserId}:${input.chatId}`);
      return [bindingRecord];
    },
    findLatestTokenByPaymentIntentId: async (paymentIntentId) => {
      calls.push(`token-payment:${paymentIntentId}`);
      return tokenRecord;
    },
    findPaymentByIntentId: async (paymentIntentId) => {
      calls.push(`payment:${paymentIntentId}`);
      return paymentRecord;
    },
    findTokenByHash: async (tokenHash) => {
      calls.push(`token-hash:${tokenHash}`);
      return tokenRecord;
    },
    findTokenByValue: async (tokenValue) => {
      calls.push(`token-value:${tokenValue}`);
      return tokenRecord;
    },
  });
  const options = { dependencies };

  const results = await Promise.all([
    findPaymentRecordByIntentId("pi_test", options),
    findLatestTelegramAccessTokenRecordByPaymentIntentId("pi_test", options),
    findTelegramAccessTokenRecordByTokenHash("token_hash_test", options),
    findTelegramAccessTokenRecordByTokenValue("bearer_test", options),
    findTelegramUserBindingByPaymentIntentId("pi_test", options),
    findTelegramUserBindingsByCustomerEmail("Customer@Example.com", options),
    findTelegramUserBindingsByTelegramUserId("user_test", options),
    findTelegramUserBindingsByTelegramUserIdAndChatId(
      { chatId: "-1001", telegramUserId: "user_test" },
      options,
    ),
    findActiveTelegramUserBindings(options),
  ]);

  assert.deepEqual(results, [
    paymentRecord,
    tokenRecord,
    tokenRecord,
    tokenRecord,
    bindingRecord,
    [bindingRecord],
    [bindingRecord],
    [bindingRecord],
    [bindingRecord],
  ]);
  assert.deepEqual(calls, [
    "payment:pi_test",
    "token-payment:pi_test",
    "token-hash:token_hash_test",
    "token-value:bearer_test",
    "binding-payment:pi_test",
    "binding-email:Customer@Example.com",
    "binding-user:user_test",
    "binding-user-chat:user_test:-1001",
    "active",
  ]);
});

test("keeps missing PostgreSQL records missing without fallback", async () => {
  const options = { dependencies: createDependencies() };

  assert.equal(await findPaymentRecordByIntentId("pi_missing", options), null);
  assert.equal(
    await findTelegramAccessTokenRecordByTokenValue("token_missing", options),
    null,
  );
  assert.deepEqual(
    await findTelegramUserBindingsByTelegramUserId("user_missing", options),
    [],
  );
});

test("fails closed when a PostgreSQL Telegram access read fails", async () => {
  const options = {
    dependencies: createDependencies({
      findTokenByHash: async () => {
        throw new Error("database unavailable");
      },
    }),
  };

  await assert.rejects(
    findTelegramAccessTokenRecordByTokenHash("token_hash_test", options),
    /database unavailable/u,
  );
});
