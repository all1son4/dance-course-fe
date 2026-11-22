import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDateTime,
  formatDateTimeInput,
  formatDayMonth,
  formatDayMonthTime,
  parseWarsawDateTimeInput,
  plural,
} from "@/app/admin/lib/admin.utils";

// The admin form says «По Варшаве»: the value must not depend on the device's zone.
test("a cohort start typed as Warsaw time is the same moment on every device", () => {
  assert.equal(parseWarsawDateTimeInput("2026-11-23T18:00"), "2026-11-23T17:00:00.000Z");
  assert.equal(parseWarsawDateTimeInput("2026-07-01T18:00"), "2026-07-01T16:00:00.000Z");
  assert.equal(parseWarsawDateTimeInput("not a date"), "");
});

test("a stored start is shown back in Warsaw time", () => {
  assert.equal(formatDateTimeInput("2026-11-23T17:00:00.000Z"), "2026-11-23T18:00");
  assert.equal(formatDateTimeInput("2026-08-10T06:00:00.000Z"), "2026-08-10T08:00");
  assert.equal(formatDateTimeInput("garbage"), "");
});

test("admin times read in Warsaw, across both DST switches", () => {
  assert.equal(formatDateTime("2026-01-05T23:30:00.000Z"), "06.01.2026, 00:30");
  assert.equal(formatDateTime("2026-03-29T00:30:00.000Z"), "29.03.2026, 01:30");
  assert.equal(formatDateTime("2026-07-01T16:05:00.000Z"), "01.07.2026, 18:05");
  assert.equal(formatDateTime("2026-10-25T01:30:00.000Z"), "25.10.2026, 02:30");
  assert.equal(formatDateTime("not a date"), "-");
});

test("Russian plural forms follow the last one and two digits", () => {
  const forms = [0, 1, 2, 5, 11, 12, 14, 21, 22, 25, 101, 111, 112].map((count) =>
    plural(count, "one", "few", "many"),
  );
  assert.deepEqual(forms, [
    "many",
    "one",
    "few",
    "many",
    "many",
    "many",
    "many",
    "one",
    "few",
    "many",
    "one",
    "many",
    "many",
  ]);
});

test("a day and time read in Warsaw", () => {
  assert.equal(formatDayMonthTime("2026-01-05T23:30:00.000Z"), "6 января в 00:30");
  assert.equal(formatDayMonthTime("2026-07-01T16:05:00.000Z"), "1 июля в 18:05");
  assert.throws(() => formatDayMonthTime("not a date"), RangeError);
});

test("a day reads in Warsaw, without the time", () => {
  assert.equal(formatDayMonth("2026-01-05T23:30:00.000Z"), "6 января");
  assert.equal(formatDayMonth("2026-07-01T16:05:00.000Z"), "1 июля");
});
