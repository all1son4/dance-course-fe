import assert from "node:assert/strict";
import test from "node:test";

import {
  MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
  type MonthlySalesReportRunSheetRecord,
} from "./google-sheets-schema";
import type { MonthlySalesReportRunRecord } from "./monthly-sales-report-record";

// Only archive-boundary tests import both contracts. Runtime owns its own type.
test("report-run contract preserves all ten archive fields and missing delivery values", () => {
  const record: MonthlySalesReportRunRecord = {
    report_key: "monthly_sales:2026-08-01:2026-09-01",
    report_family: "monthly_sales",
    period_start_utc: "2026-07-31T22:00:00.000Z",
    period_end_utc: "2026-08-31T22:00:00.000Z",
    generated_at_utc: "2026-09-01T03:00:00.000Z",
    delivery_status: "skipped",
    delivered_at_utc: "",
    delivered_to: "",
    row_count: "0",
    csv_sha256: "",
  };
  // No casts: TypeScript checks assignability at both archive boundaries.
  const archive: MonthlySalesReportRunSheetRecord = record;
  const restored: MonthlySalesReportRunRecord = { ...archive };

  assert.deepEqual(Object.keys(record), [...MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS]);
  assert.deepEqual(restored, record);
  assert.equal(restored.row_count, "0");
  assert.equal(restored.delivered_at_utc, "");
});
