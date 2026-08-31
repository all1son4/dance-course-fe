import assert from "node:assert/strict";
import test from "node:test";

import {
  getMonthlySalesReportPeriodForNow,
  getScheduledMonthlySalesReportPeriod,
} from "@/lib/monthly-sales-report";

test("does not schedule a monthly report before the UTC month is complete", () => {
  assert.equal(
    getScheduledMonthlySalesReportPeriod(new Date("2026-08-31T03:00:00.000Z")),
    null,
  );
  assert.equal(
    getScheduledMonthlySalesReportPeriod(new Date("2026-09-02T03:00:00.000Z")),
    null,
  );
});

test("schedules the complete previous UTC month on the first day", () => {
  assert.deepEqual(
    getScheduledMonthlySalesReportPeriod(new Date("2026-09-01T03:00:00.000Z")),
    {
      endUtcIso: "2026-09-01T00:00:00.000Z",
      key: "monthly_sales:2026-08-01:2026-09-01",
      month: "2026-08",
      startUtcIso: "2026-08-01T00:00:00.000Z",
    },
  );
});

test("schedules December correctly across the UTC year boundary", () => {
  assert.deepEqual(
    getScheduledMonthlySalesReportPeriod(new Date("2027-01-01T03:00:00.000Z")),
    {
      endUtcIso: "2027-01-01T00:00:00.000Z",
      key: "monthly_sales:2026-12-01:2027-01-01",
      month: "2026-12",
      startUtcIso: "2026-12-01T00:00:00.000Z",
    },
  );
});

test("a premature partial report cannot block the completed-month report", () => {
  const prematurePeriod = getMonthlySalesReportPeriodForNow(
    new Date("2026-08-31T03:00:00.000Z"),
  );
  const completedPeriod = getScheduledMonthlySalesReportPeriod(
    new Date("2026-09-01T03:00:00.000Z"),
  );

  assert.ok(completedPeriod);
  assert.equal(prematurePeriod.key, "monthly_sales:2026-08-01:2026-08-31");
  assert.notEqual(completedPeriod.key, prematurePeriod.key);
});
