import assert from "node:assert/strict";
import test from "node:test";

import { GoogleSheetsError } from "@/lib/google-sheets";
import type { AdminInviteLinkHistorySourceRecord } from "@/lib/google-sheets-schema";

import {
  type AdminInviteLinkHistoryReadDependencies,
  type AdminInviteLinkHistoryReadSource,
  type AdminInviteLinkHistoryShadowComparison,
  getAdminInviteLinkHistoryProviderErrorDetails,
  getAdminInviteLinkHistoryReadRuntime,
  isAdminInviteLinkHistoryRateLimitError,
  listAdminInviteLinkHistoryRecords,
} from "./admin-invite-link-history-read-runtime";

const createHistoryRecord = (
  overrides: Partial<AdminInviteLinkHistorySourceRecord> = {},
): AdminInviteLinkHistorySourceRecord => ({
  accessUrl: "https://t.me/+private_invite",
  adminLabel: "Admin label",
  createdAt: "2026-08-13T10:00:00.000Z",
  lessonLanguage: "en",
  offerLabel: "Standard",
  productTitle: "Course",
  purchaseItem: "Course — Standard",
  tokenExpiresAt: "2026-08-14T10:00:00.000Z",
  tokenUsedAt: "",
  ...overrides,
});

const createSource = (
  list: AdminInviteLinkHistoryReadSource["list"] = async () => [],
): AdminInviteLinkHistoryReadSource => ({ list });

const createDependencies = ({
  database = async () => [],
  legacy = async () => [],
  sheets = async () => [],
}: {
  database?: AdminInviteLinkHistoryReadSource["list"];
  legacy?: AdminInviteLinkHistoryReadSource["list"];
  sheets?: AdminInviteLinkHistoryReadSource["list"];
} = {}): AdminInviteLinkHistoryReadDependencies => ({
  database: createSource(database),
  legacy: createSource(legacy),
  sheets: createSource(sheets),
});

test("selects admin history reads from the business-operations flag", () => {
  assert.equal(getAdminInviteLinkHistoryReadRuntime({}), "legacy");
  assert.equal(
    getAdminInviteLinkHistoryReadRuntime({ DB_BUSINESS_OPERATIONS_MODE: "shadow" }),
    "shadow",
  );
  assert.equal(
    getAdminInviteLinkHistoryReadRuntime({ DB_BUSINESS_OPERATIONS_MODE: "database" }),
    "database",
  );
  assert.throws(
    () =>
      getAdminInviteLinkHistoryReadRuntime({
        DB_BUSINESS_OPERATIONS_MODE: "invalid",
      }),
    /DB_BUSINESS_OPERATIONS_MODE must be one of/u,
  );
});

test("database mode passes filters to PostgreSQL without legacy or Sheets calls", async () => {
  const databaseRecord = createHistoryRecord();
  let receivedInput: unknown;
  let nonDatabaseCalls = 0;
  const input = { accessWorkflow: "admin-offer-link", limit: 20 };
  const result = await listAdminInviteLinkHistoryRecords(input, {
    dependencies: createDependencies({
      database: async (databaseInput) => {
        receivedInput = databaseInput;
        return [databaseRecord];
      },
      legacy: async () => {
        nonDatabaseCalls += 1;
        return [];
      },
      sheets: async () => {
        nonDatabaseCalls += 1;
        return [];
      },
    }),
    environment: { DB_BUSINESS_OPERATIONS_MODE: "database" },
  });

  assert.deepEqual(result, [databaseRecord]);
  assert.deepEqual(receivedInput, input);
  assert.equal(nonDatabaseCalls, 0);
});

test("database mode keeps empty history empty and fails closed on query errors", async () => {
  let legacyCalls = 0;
  const dependencies = createDependencies({
    legacy: async () => {
      legacyCalls += 1;
      return [createHistoryRecord()];
    },
  });
  const options = {
    dependencies,
    environment: { DB_BUSINESS_OPERATIONS_MODE: "database" },
  };

  assert.deepEqual(
    await listAdminInviteLinkHistoryRecords(
      { accessWorkflow: "admin-offer-link" },
      options,
    ),
    [],
  );
  dependencies.database.list = async () => {
    throw new Error("database unavailable");
  };
  await assert.rejects(
    listAdminInviteLinkHistoryRecords({ accessWorkflow: "admin-offer-link" }, options),
    /database unavailable/u,
  );
  assert.equal(legacyCalls, 0);
});

test("legacy mode preserves the current history without comparison reads", async () => {
  const primary = [createHistoryRecord()];
  let databaseCalls = 0;
  let sheetsCalls = 0;
  const result = await listAdminInviteLinkHistoryRecords(
    { accessWorkflow: "admin-offer-link" },
    {
      dependencies: createDependencies({
        database: async () => {
          databaseCalls += 1;
          return [];
        },
        legacy: async () => primary,
        sheets: async () => {
          sheetsCalls += 1;
          return [];
        },
      }),
      environment: { DB_BUSINESS_OPERATIONS_MODE: "legacy" },
    },
  );

  assert.equal(result, primary);
  assert.equal(databaseCalls, 0);
  assert.equal(sheetsCalls, 0);
});

test("shadow history ignores order and sub-second timestamp precision", async () => {
  const first = createHistoryRecord();
  const second = createHistoryRecord({
    accessUrl: "https://t.me/+second_private_invite",
    createdAt: "2026-08-13T11:00:00.000Z",
  });
  const primary = [first];
  const comparisons: AdminInviteLinkHistoryShadowComparison[] = [];
  const result = await listAdminInviteLinkHistoryRecords(
    { accessWorkflow: "admin-offer-link" },
    {
      dependencies: createDependencies({
        database: async () => [
          { ...first, createdAt: "2026-08-13T10:00:00.900Z" },
          second,
        ],
        legacy: async () => primary,
        sheets: async () => [second, { ...first, createdAt: "2026-08-13T10:00:00.100Z" }],
      }),
      environment: { DB_BUSINESS_OPERATIONS_MODE: "shadow" },
      onShadowComparison: (comparison) => comparisons.push(comparison),
    },
  );

  assert.equal(result, primary);
  assert.equal(comparisons[0].status, "match");
});

test("shadow diagnostics contain no invite URLs, labels, or workflow lookup", async () => {
  const comparisons: AdminInviteLinkHistoryShadowComparison[] = [];
  const result = await listAdminInviteLinkHistoryRecords(
    { accessWorkflow: "private-workflow-lookup" },
    {
      dependencies: createDependencies({
        database: async () => [
          createHistoryRecord({ adminLabel: "Database Private Label" }),
        ],
        legacy: async () => [createHistoryRecord({ adminLabel: "Legacy Primary Label" })],
        sheets: async () => [createHistoryRecord({ adminLabel: "Sheets Private Label" })],
      }),
      environment: { DB_BUSINESS_OPERATIONS_MODE: "shadow" },
      onShadowComparison: (comparison) => comparisons.push(comparison),
    },
  );

  assert.equal(result[0].adminLabel, "Legacy Primary Label");
  assert.deepEqual(comparisons[0].differingFields, ["adminLabel"]);
  assert.match(comparisons[0].keyHash, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(
    JSON.stringify(comparisons[0]),
    /private_invite|Private Label|private-workflow-lookup/u,
  );
});

test("shadow failures do not alter cached-route source data", async (context) => {
  const primary = [createHistoryRecord()];
  context.mock.method(console, "warn", () => undefined);

  const result = await listAdminInviteLinkHistoryRecords(
    { accessWorkflow: "admin-offer-link" },
    {
      dependencies: createDependencies({
        database: async () => {
          throw new Error("shadow database unavailable");
        },
        legacy: async () => primary,
      }),
      environment: { DB_BUSINESS_OPERATIONS_MODE: "shadow" },
    },
  );

  assert.equal(result, primary);
});

test("Google-specific error handling is disabled in strict database mode", () => {
  const rateLimitError = new GoogleSheetsError("rate_limited", "details", 429);

  assert.equal(
    isAdminInviteLinkHistoryRateLimitError(rateLimitError, {
      DB_BUSINESS_OPERATIONS_MODE: "legacy",
    }),
    true,
  );
  assert.equal(
    isAdminInviteLinkHistoryRateLimitError(rateLimitError, {
      DB_BUSINESS_OPERATIONS_MODE: "database",
    }),
    false,
  );
  assert.deepEqual(
    getAdminInviteLinkHistoryProviderErrorDetails(rateLimitError, {
      DB_BUSINESS_OPERATIONS_MODE: "shadow",
    }),
    { details: "details", errorCode: "rate_limited", status: 429 },
  );
  assert.equal(
    getAdminInviteLinkHistoryProviderErrorDetails(rateLimitError, {
      DB_BUSINESS_OPERATIONS_MODE: "database",
    }),
    null,
  );
});
