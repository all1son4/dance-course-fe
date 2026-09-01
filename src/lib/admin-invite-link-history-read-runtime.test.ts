import assert from "node:assert/strict";
import test from "node:test";

import type { AdminInviteLinkHistorySourceRecord } from "@/lib/google-sheets-schema";

import {
  type AdminInviteLinkHistoryReadDependencies,
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

const createDependencies = (
  list: AdminInviteLinkHistoryReadDependencies["database"]["list"],
): AdminInviteLinkHistoryReadDependencies => ({ database: { list } });

test("always reads admin invite-link history from PostgreSQL", async () => {
  const databaseRecord = createHistoryRecord();
  const input = { accessWorkflow: "admin-offer-link", limit: 20 };
  let receivedInput: unknown;

  const result = await listAdminInviteLinkHistoryRecords(input, {
    dependencies: createDependencies(async (databaseInput) => {
      receivedInput = databaseInput;
      return [databaseRecord];
    }),
  });

  assert.deepEqual(result, [databaseRecord]);
  assert.deepEqual(receivedInput, input);
});

test("keeps empty PostgreSQL history empty", async () => {
  const result = await listAdminInviteLinkHistoryRecords(
    { accessWorkflow: "admin-offer-link" },
    { dependencies: createDependencies(async () => []) },
  );

  assert.deepEqual(result, []);
});

test("fails closed when the PostgreSQL history query fails", async () => {
  await assert.rejects(
    listAdminInviteLinkHistoryRecords(
      { accessWorkflow: "admin-offer-link" },
      {
        dependencies: createDependencies(async () => {
          throw new Error("database unavailable");
        }),
      },
    ),
    /database unavailable/u,
  );
});
