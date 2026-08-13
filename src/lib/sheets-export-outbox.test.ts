import assert from "node:assert/strict";
import test from "node:test";

import type { ClaimedOutboxJob } from "@/db/transactional-outbox";

import {
  deliverSheetsExportOutboxJob,
  isSheetsExportEnabled,
} from "./sheets-export-outbox";

const queuedExportJob: ClaimedOutboxJob = {
  attemptCount: 1,
  deduplicationKey: "purchase:test:successful_customer_export",
  id: "outbox_test",
  kind: "successful_customer_export",
  leaseToken: "lease_test",
  payload: {
    _outboxVersion: 1,
    paymentIntentId: "pi_test",
  },
  provider: "google_sheets",
  purchaseId: "purchase_test",
  recipient: null,
};

test("enables the optional Sheets sink until it is explicitly retired", () => {
  assert.equal(isSheetsExportEnabled({}), true);
  assert.equal(isSheetsExportEnabled({ DB_SHEETS_EXPORT_MODE: "legacy" }), true);
  assert.equal(isSheetsExportEnabled({ DB_SHEETS_EXPORT_MODE: "shadow" }), true);
  assert.equal(isSheetsExportEnabled({ DB_SHEETS_EXPORT_MODE: "database" }), false);
  assert.throws(
    () => isSheetsExportEnabled({ DB_SHEETS_EXPORT_MODE: "unexpected" }),
    /DB_SHEETS_EXPORT_MODE must be one of/u,
  );
});

test("retires an already queued export without loading data or calling Google", async () => {
  let appendCalls = 0;
  const result = await deliverSheetsExportOutboxJob(queuedExportJob, {
    appendSuccessfulCustomer: async () => {
      appendCalls += 1;
    },
    environment: { DB_SHEETS_EXPORT_MODE: "database" },
  });

  assert.deepEqual(result, { skipped: true });
  assert.equal(appendCalls, 0);
});
