import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNTING_TIME_ZONE,
  getAccountingCalendarDateValue,
  getAccountingDateTimeValue,
  getAccountingMonthRange,
  getAccountingMonthValue,
  getPreviousAccountingMonthValue,
} from "@/lib/accounting-month";

test("uses Europe/Warsaw as the single accounting calendar", () => {
  assert.equal(ACCOUNTING_TIME_ZONE, "Europe/Warsaw");
  assert.equal(getAccountingMonthValue(new Date("2026-08-31T21:59:59.999Z")), "2026-08");
  assert.equal(getAccountingMonthValue(new Date("2026-08-31T22:00:00.000Z")), "2026-09");
  assert.equal(
    getAccountingCalendarDateValue(new Date("2026-08-31T22:00:00.000Z")),
    "2026-09-01",
  );
  assert.equal(
    getAccountingDateTimeValue(new Date("2026-08-31T22:30:45.000Z")),
    "2026-09-01 00:30:45",
  );
});

test("returns a half-open DST-aware range for a Warsaw accounting month", () => {
  assert.deepEqual(getAccountingMonthRange("2026-08"), {
    end: new Date("2026-08-31T22:00:00.000Z"),
    endDateValue: "2026-09-01",
    monthValue: "2026-08",
    start: new Date("2026-07-31T22:00:00.000Z"),
    startDateValue: "2026-08-01",
  });
  assert.deepEqual(getAccountingMonthRange("2026-10"), {
    end: new Date("2026-10-31T23:00:00.000Z"),
    endDateValue: "2026-11-01",
    monthValue: "2026-10",
    start: new Date("2026-09-30T22:00:00.000Z"),
    startDateValue: "2026-10-01",
  });
});

test("calculates the previous accounting month across a year boundary", () => {
  assert.equal(getPreviousAccountingMonthValue("2027-01"), "2026-12");
  assert.equal(getPreviousAccountingMonthValue("invalid"), null);
});
