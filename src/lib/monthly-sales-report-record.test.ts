import assert from "node:assert/strict";
import test from "node:test";

import type { MonthlySalesReportRunRecord } from "./monthly-sales-report-record";

const MONTHLY_REPORT_FIELDS = [
  "report_key",
  "report_family",
  "period_start_utc",
  "period_end_utc",
  "generated_at_utc",
  "delivery_status",
  "delivered_at_utc",
  "delivered_to",
  "row_count",
  "csv_sha256",
] as const satisfies readonly (keyof MonthlySalesReportRunRecord)[];

test("report-run contract preserves all ten fields and missing delivery values", () => {
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
  const restored: MonthlySalesReportRunRecord = { ...record };

  assert.deepEqual(Object.keys(record), [...MONTHLY_REPORT_FIELDS]);
  assert.deepEqual(restored, record);
  assert.equal(restored.row_count, "0");
  assert.equal(restored.delivered_at_utc, "");
});
