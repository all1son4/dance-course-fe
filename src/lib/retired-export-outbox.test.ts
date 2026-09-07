import assert from "node:assert/strict";
import test from "node:test";

import type { ClaimedOutboxJob } from "@/db/transactional-outbox";

import { skipRetiredExportOutboxJob } from "./retired-export-outbox";

const queuedExportJob: ClaimedOutboxJob = {
  attemptCount: 1,
  deduplicationKey: "purchase:test:successful_customer_export",
  id: "outbox_test",
  kind: "successful_customer_export",
  leaseToken: "lease_test",
  payload: {},
  provider: "google_sheets",
  purchaseId: null,
  recipient: null,
};

test("retires old exports without configuration, customer data, or network access", async (t) => {
  const previousMode = process.env.DB_SHEETS_EXPORT_MODE;
  t.after(() => {
    if (previousMode === undefined) delete process.env.DB_SHEETS_EXPORT_MODE;
    else process.env.DB_SHEETS_EXPORT_MODE = previousMode;
  });
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("No provider network access is allowed");
  });
  const job = {
    ...queuedExportJob,
    get payload(): Record<string, unknown> {
      throw new Error("Retirement must not inspect customer payloads");
    },
  };

  for (const mode of [undefined, "", "legacy", "shadow", "database", "invalid"]) {
    if (mode === undefined) delete process.env.DB_SHEETS_EXPORT_MODE;
    else process.env.DB_SHEETS_EXPORT_MODE = mode;
    assert.deepEqual(await skipRetiredExportOutboxJob(job), { skipped: true });
  }

  assert.equal(fetch.mock.callCount(), 0);
});

test("never silently retires another kind of business job", async () => {
  await assert.rejects(
    skipRetiredExportOutboxJob({ ...queuedExportJob, kind: "purchase_success_email" }),
    { message: "retired_export_kind_unsupported", retryable: false },
  );
});
