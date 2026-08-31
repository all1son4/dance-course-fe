import assert from "node:assert/strict";
import test from "node:test";

import {
  getMonthlySalesReportPeriodForNow,
  getScheduledMonthlySalesReportPeriod,
} from "@/lib/monthly-sales-report";

test("does not schedule a monthly report before the Warsaw month is complete", () => {
  assert.equal(
    getScheduledMonthlySalesReportPeriod(new Date("2026-08-31T21:59:59.999Z")),
    null,
  );
  assert.equal(
    getScheduledMonthlySalesReportPeriod(new Date("2026-09-02T03:00:00.000Z")),
    null,
  );
});

test("schedules the complete previous Warsaw month on the first local day", () => {
  assert.deepEqual(
    getScheduledMonthlySalesReportPeriod(new Date("2026-08-31T22:30:00.000Z")),
    {
      endUtcIso: "2026-08-31T22:00:00.000Z",
      key: "monthly_sales:2026-08-01:2026-09-01",
      month: "2026-08",
      startUtcIso: "2026-07-31T22:00:00.000Z",
    },
  );
});

test("schedules December correctly across the Warsaw year boundary", () => {
  assert.deepEqual(
    getScheduledMonthlySalesReportPeriod(new Date("2027-01-01T03:00:00.000Z")),
    {
      endUtcIso: "2026-12-31T23:00:00.000Z",
      key: "monthly_sales:2026-12-01:2027-01-01",
      month: "2026-12",
      startUtcIso: "2026-11-30T23:00:00.000Z",
    },
  );
});

test("uses DST-aware Warsaw boundaries for spring and autumn months", () => {
  assert.deepEqual(
    getScheduledMonthlySalesReportPeriod(new Date("2026-04-01T03:00:00.000Z")),
    {
      endUtcIso: "2026-03-31T22:00:00.000Z",
      key: "monthly_sales:2026-03-01:2026-04-01",
      month: "2026-03",
      startUtcIso: "2026-02-28T23:00:00.000Z",
    },
  );
  assert.deepEqual(
    getScheduledMonthlySalesReportPeriod(new Date("2026-11-01T03:00:00.000Z")),
    {
      endUtcIso: "2026-10-31T23:00:00.000Z",
      key: "monthly_sales:2026-10-01:2026-11-01",
      month: "2026-10",
      startUtcIso: "2026-09-30T22:00:00.000Z",
    },
  );
});

test("excludes every sale from September by Warsaw calendar time", () => {
  const augustPeriod = getScheduledMonthlySalesReportPeriod(
    new Date("2026-09-01T03:00:00.000Z"),
  );

  assert.ok(augustPeriod);
  assert.equal(
    new Date("2026-08-31T21:59:59.999Z") < new Date(augustPeriod.endUtcIso),
    true,
  );
  assert.equal(
    new Date("2026-08-31T22:00:00.000Z") < new Date(augustPeriod.endUtcIso),
    false,
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
