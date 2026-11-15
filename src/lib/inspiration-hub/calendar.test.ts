import assert from "node:assert/strict";
import test from "node:test";

import {
  addWarsawCalendarDays,
  getStartOfNextWarsawDay,
} from "@/lib/inspiration-hub/calendar";

test("calendar arithmetic includes leap day without changing local clock time", () => {
  assert.deepEqual(
    addWarsawCalendarDays(new Date("2028-02-28T12:34:56.789+01:00"), 1),
    new Date("2028-02-29T12:34:56.789+01:00"),
  );
});

test("a Warsaw calendar day across spring DST can be 23 elapsed hours", () => {
  const startsAt = new Date("2027-03-27T12:00:00+01:00");
  const result = addWarsawCalendarDays(startsAt, 1);

  assert.deepEqual(result, new Date("2027-03-28T12:00:00+02:00"));
  assert.equal(result.getTime() - startsAt.getTime(), 23 * 60 * 60 * 1000);
});

test("a Warsaw calendar day across autumn DST can be 25 elapsed hours", () => {
  const startsAt = new Date("2026-10-24T12:00:00+02:00");
  const result = addWarsawCalendarDays(startsAt, 1);

  assert.deepEqual(result, new Date("2026-10-25T12:00:00+01:00"));
  assert.equal(result.getTime() - startsAt.getTime(), 25 * 60 * 60 * 1000);
});

test("a skipped Warsaw time moves forward by the DST gap", () => {
  assert.deepEqual(
    addWarsawCalendarDays(new Date("2027-03-27T02:30:15.123+01:00"), 1),
    new Date("2027-03-28T03:30:15.123+02:00"),
  );
});

test("a repeated Warsaw time resolves to its earlier occurrence", () => {
  assert.deepEqual(
    addWarsawCalendarDays(new Date("2026-10-24T02:30:15.123+02:00"), 1),
    new Date("2026-10-25T02:30:15.123+02:00"),
  );
});

test("adding zero days preserves even the second occurrence of a repeated hour", () => {
  const original = new Date("2026-10-25T02:30:00+01:00");
  const result = addWarsawCalendarDays(original, 0);

  assert.deepEqual(result, original);
  assert.notEqual(result, original);
});

test("calendar arithmetic does not mutate the source date", () => {
  const original = new Date("2026-12-25T12:00:00+01:00");

  addWarsawCalendarDays(original, 56);

  assert.deepEqual(original, new Date("2026-12-25T12:00:00+01:00"));
});

test("invalid dates and non-integer calendar day counts are rejected", () => {
  assert.throws(() => addWarsawCalendarDays(new Date("invalid"), 56), RangeError);
  assert.throws(
    () => addWarsawCalendarDays(new Date("2026-11-10T12:00:00+01:00"), 1.5),
    RangeError,
  );
});

test("the next Warsaw midnight follows a winter afternoon closure", () => {
  assert.deepEqual(
    getStartOfNextWarsawDay(new Date("2026-12-14T13:00:00.000Z")),
    new Date("2026-12-14T23:00:00.000Z"),
  );
});

test("the next Warsaw midnight uses summer time in summer", () => {
  assert.deepEqual(
    getStartOfNextWarsawDay(new Date("2026-07-01T10:00:00.000Z")),
    new Date("2026-07-01T22:00:00.000Z"),
  );
});

test("a closure late on Warsaw's evening already belongs to that Warsaw day", () => {
  // 23:30 UTC on 14 December is 00:30 on 15 December in Warsaw.
  assert.deepEqual(
    getStartOfNextWarsawDay(new Date("2026-12-14T23:30:00.000Z")),
    new Date("2026-12-15T23:00:00.000Z"),
  );
});

test("a closure exactly at Warsaw midnight ends at the following midnight", () => {
  assert.deepEqual(
    getStartOfNextWarsawDay(new Date("2026-12-14T23:00:00.000Z")),
    new Date("2026-12-15T23:00:00.000Z"),
  );
});

test("the next midnight is found across both clock changes", () => {
  // Spring: 28 March 2027 is 23 hours long; autumn: 25 October 2026 is 25 hours.
  assert.deepEqual(
    getStartOfNextWarsawDay(new Date("2027-03-28T12:00:00.000Z")),
    new Date("2027-03-28T22:00:00.000Z"),
  );
  assert.deepEqual(
    getStartOfNextWarsawDay(new Date("2026-10-25T12:00:00.000Z")),
    new Date("2026-10-25T23:00:00.000Z"),
  );
});

test("an invalid closure date is rejected", () => {
  assert.throws(() => getStartOfNextWarsawDay(new Date(Number.NaN)), RangeError);
});

test("an access starting at 18:00 Warsaw counts as started from 00:00 that day", async () => {
  const { isStartDayReached } = await import("@/lib/inspiration-hub/calendar");
  // Cohort #3 starts on 23 November 2026 at 18:00 Warsaw (17:00 UTC).
  const start = new Date("2026-11-23T17:00:00.000Z");

  assert.equal(isStartDayReached(start, new Date("2026-11-22T22:59:00.000Z")), false);
  // The 03:00 UTC cron of the start day sends the invite.
  assert.equal(isStartDayReached(start, new Date("2026-11-23T03:00:00.000Z")), true);
  assert.equal(isStartDayReached(start, new Date("2026-11-24T03:00:00.000Z")), true);
});
