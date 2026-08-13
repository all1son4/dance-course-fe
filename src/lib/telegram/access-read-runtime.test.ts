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
  findPaymentRecordByIntentId,
  findTelegramAccessTokenRecordByTokenValue,
  findTelegramUserBindingsByTelegramUserId,
  getTelegramAccessReadRuntime,
  type TelegramAccessReadDependencies,
  type TelegramAccessReadShadowComparison,
  type TelegramAccessReadSource,
} from "./access-read-runtime";

const fromHeaders = <Header extends string>(headers: readonly Header[]) =>
  Object.fromEntries(headers.map((header) => [header, ""])) as Record<Header, string>;

const createPaymentRecord = (
  overrides: Partial<PaymentSheetRecord> = {},
): PaymentSheetRecord => ({
  ...fromHeaders(PAYMENT_SHEET_HEADERS),
  access_workflow: "telegram-chat",
  delivery_channel: "telegram",
  payment_intent_id: "pi_test",
  telegram_access_expires_at: "2026-10-01T10:00:00.000Z",
  telegram_access_status: "activated",
  ...overrides,
});

const createTokenRecord = (
  overrides: Partial<TelegramAccessTokenSheetRecord> = {},
): TelegramAccessTokenSheetRecord => ({
  ...fromHeaders(TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS),
  created_at: "2026-08-13T10:00:00.000Z",
  expires_at: "2026-09-13T10:00:00.000Z",
  payment_intent_id: "pi_test",
  status: "issued",
  token_hash: "token_hash_test",
  token_id: "tga_test",
  token_value: "bearer_test",
  ...overrides,
});

const createBindingRecord = (
  overrides: Partial<TelegramUserBindingSheetRecord> = {},
): TelegramUserBindingSheetRecord => ({
  ...fromHeaders(TELEGRAM_USER_BINDINGS_SHEET_HEADERS),
  bound_at: "2026-08-13T10:00:00.000Z",
  chat_id: "-1001",
  customer_email: "customer@example.com",
  payment_intent_id: "pi_test",
  status: "active",
  telegram_user_id: "user_test",
  ...overrides,
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

const createDependencies = ({
  database = {},
  legacy = {},
  sheets = {},
}: {
  database?: Partial<TelegramAccessReadSource>;
  legacy?: Partial<TelegramAccessReadSource>;
  sheets?: Partial<TelegramAccessReadSource>;
} = {}): TelegramAccessReadDependencies => ({
  database: createSource(database),
  legacy: createSource(legacy),
  sheets: createSource(sheets),
});

test("selects Telegram read modes independently from the legacy write runtime", () => {
  assert.equal(getTelegramAccessReadRuntime({}), "legacy");
  assert.equal(
    getTelegramAccessReadRuntime({ DB_TELEGRAM_ACCESS_MODE: "shadow" }),
    "shadow",
  );
  assert.equal(
    getTelegramAccessReadRuntime({ DB_TELEGRAM_ACCESS_MODE: "database" }),
    "database",
  );
  assert.throws(
    () => getTelegramAccessReadRuntime({ DB_TELEGRAM_ACCESS_MODE: "invalid" }),
    /DB_TELEGRAM_ACCESS_MODE must be one of/u,
  );
});

test("database mode never falls back for missing bearer-token reads", async () => {
  let legacyCalls = 0;
  let sheetsCalls = 0;
  const dependencies = createDependencies({
    legacy: {
      findTokenByValue: async () => {
        legacyCalls += 1;
        return createTokenRecord();
      },
    },
    sheets: {
      findTokenByValue: async () => {
        sheetsCalls += 1;
        return createTokenRecord();
      },
    },
  });

  const result = await findTelegramAccessTokenRecordByTokenValue("missing_token", {
    dependencies,
    environment: { DB_TELEGRAM_ACCESS_MODE: "database" },
  });

  assert.equal(result, null);
  assert.equal(legacyCalls, 0);
  assert.equal(sheetsCalls, 0);
});

test("legacy mode keeps the current read result without shadow queries", async () => {
  const primaryRecord = createPaymentRecord();
  let databaseCalls = 0;
  let sheetsCalls = 0;
  const result = await findPaymentRecordByIntentId("pi_test", {
    dependencies: createDependencies({
      database: {
        findPaymentByIntentId: async () => {
          databaseCalls += 1;
          return null;
        },
      },
      legacy: { findPaymentByIntentId: async () => primaryRecord },
      sheets: {
        findPaymentByIntentId: async () => {
          sheetsCalls += 1;
          return null;
        },
      },
    }),
    environment: { DB_TELEGRAM_ACCESS_MODE: "legacy" },
  });

  assert.equal(result, primaryRecord);
  assert.equal(databaseCalls, 0);
  assert.equal(sheetsCalls, 0);
});

test("database binding collections do not fall back when no rows exist", async () => {
  let legacyCalls = 0;
  let sheetsCalls = 0;
  const result = await findTelegramUserBindingsByTelegramUserId("missing_user", {
    dependencies: createDependencies({
      legacy: {
        findBindingsByTelegramUserId: async () => {
          legacyCalls += 1;
          return [createBindingRecord()];
        },
      },
      sheets: {
        findBindingsByTelegramUserId: async () => {
          sheetsCalls += 1;
          return [createBindingRecord()];
        },
      },
    }),
    environment: { DB_TELEGRAM_ACCESS_MODE: "database" },
  });

  assert.deepEqual(result, []);
  assert.equal(legacyCalls, 0);
  assert.equal(sheetsCalls, 0);
});

test("database mode fails closed instead of consulting legacy access data", async () => {
  let legacyCalls = 0;
  const dependencies = createDependencies({
    database: {
      findPaymentByIntentId: async () => {
        throw new Error("database unavailable");
      },
    },
    legacy: {
      findPaymentByIntentId: async () => {
        legacyCalls += 1;
        return createPaymentRecord();
      },
    },
  });

  await assert.rejects(
    findPaymentRecordByIntentId("pi_test", {
      dependencies,
      environment: { DB_TELEGRAM_ACCESS_MODE: "database" },
    }),
    /database unavailable/u,
  );
  assert.equal(legacyCalls, 0);
});

test("shadow mode preserves the legacy result and normalizes timestamp precision", async () => {
  const primaryRecord = createPaymentRecord({ telegram_access_status: "pending" });
  const comparisons: TelegramAccessReadShadowComparison[] = [];
  const result = await findPaymentRecordByIntentId("pi_test", {
    dependencies: createDependencies({
      database: {
        findPaymentByIntentId: async () =>
          createPaymentRecord({
            telegram_access_expires_at: "2026-10-01T10:00:00.900Z",
          }),
      },
      legacy: { findPaymentByIntentId: async () => primaryRecord },
      sheets: {
        findPaymentByIntentId: async () =>
          createPaymentRecord({
            telegram_access_expires_at: "2026-10-01T10:00:00.100Z",
          }),
      },
    }),
    environment: { DB_TELEGRAM_ACCESS_MODE: "shadow" },
    onShadowComparison: (comparison) => comparisons.push(comparison),
  });

  assert.equal(result, primaryRecord);
  assert.equal(comparisons[0].status, "match");
});

test("shadow diagnostics never expose bearer values or lookup keys", async () => {
  const comparisons: TelegramAccessReadShadowComparison[] = [];
  const result = await findTelegramAccessTokenRecordByTokenValue("lookup_bearer_secret", {
    dependencies: createDependencies({
      database: {
        findTokenByValue: async () =>
          createTokenRecord({ token_value: "database_bearer_secret" }),
      },
      legacy: {
        findTokenByValue: async () =>
          createTokenRecord({ token_value: "legacy_primary_secret" }),
      },
      sheets: {
        findTokenByValue: async () =>
          createTokenRecord({ token_value: "sheets_bearer_secret" }),
      },
    }),
    environment: { DB_TELEGRAM_ACCESS_MODE: "shadow" },
    onShadowComparison: (comparison) => comparisons.push(comparison),
  });

  assert.equal(result?.token_value, "legacy_primary_secret");
  assert.deepEqual(comparisons[0].differingFields, ["token_value"]);
  assert.match(comparisons[0].keyHash, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(
    JSON.stringify(comparisons[0]),
    /lookup_bearer_secret|database_bearer_secret|sheets_bearer_secret/u,
  );
});

test("shadow binding comparisons ignore row order and report only field names", async () => {
  const first = createBindingRecord();
  const second = createBindingRecord({
    chat_id: "-1002",
    payment_intent_id: "pi_second",
  });
  const comparisons: TelegramAccessReadShadowComparison[] = [];

  const result = await findTelegramUserBindingsByTelegramUserId("user_test", {
    dependencies: createDependencies({
      database: { findBindingsByTelegramUserId: async () => [first, second] },
      legacy: { findBindingsByTelegramUserId: async () => [second] },
      sheets: { findBindingsByTelegramUserId: async () => [second, first] },
    }),
    environment: { DB_TELEGRAM_ACCESS_MODE: "shadow" },
    onShadowComparison: (comparison) => comparisons.push(comparison),
  });

  assert.deepEqual(result, [second]);
  assert.equal(comparisons[0].status, "match");

  const drift: TelegramAccessReadShadowComparison[] = [];
  await findTelegramUserBindingsByTelegramUserId("user_test", {
    dependencies: createDependencies({
      database: { findBindingsByTelegramUserId: async () => [first] },
      legacy: { findBindingsByTelegramUserId: async () => [first] },
      sheets: {
        findBindingsByTelegramUserId: async () => [
          { ...first, invite_link: "private_invite_value" },
        ],
      },
    }),
    environment: { DB_TELEGRAM_ACCESS_MODE: "shadow" },
    onShadowComparison: (comparison) => drift.push(comparison),
  });

  assert.deepEqual(drift[0].differingFields, ["invite_link"]);
  assert.doesNotMatch(JSON.stringify(drift[0]), /private_invite_value/u);
});

test("shadow comparison failures do not change the legacy response", async (t) => {
  const primaryRecord = createTokenRecord();
  t.mock.method(console, "warn", () => undefined);

  const result = await findTelegramAccessTokenRecordByTokenValue("bearer_test", {
    dependencies: createDependencies({
      database: {
        findTokenByValue: async () => {
          throw new Error("shadow database unavailable");
        },
      },
      legacy: { findTokenByValue: async () => primaryRecord },
    }),
    environment: { DB_TELEGRAM_ACCESS_MODE: "shadow" },
  });

  assert.equal(result, primaryRecord);
});
