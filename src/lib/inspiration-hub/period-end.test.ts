import assert from "node:assert/strict";
import test from "node:test";

import { getStandaloneHubPeriodEnd } from "@/lib/inspiration-hub/period-end";

test("standalone Hub expiry stays unknown until its start is known", () => {
  const result: null = getStandaloneHubPeriodEnd({ startsAt: null });

  assert.equal(result, null);
});

test("a standalone Hub period lasts 56 calendar days across a year boundary", () => {
  const result: Date = getStandaloneHubPeriodEnd({
    startsAt: new Date("2026-11-10T12:00:00+01:00"),
  });

  assert.deepEqual(result, new Date("2027-01-05T12:00:00+01:00"));
});

test("a standalone Hub period preserves local clock time across autumn DST", () => {
  assert.deepEqual(
    getStandaloneHubPeriodEnd({ startsAt: new Date("2026-10-01T12:00:00+02:00") }),
    new Date("2026-11-26T12:00:00+01:00"),
  );
});

test("a standalone Hub period preserves local clock time across spring DST", () => {
  assert.deepEqual(
    getStandaloneHubPeriodEnd({ startsAt: new Date("2027-02-15T12:00:00+01:00") }),
    new Date("2027-04-12T12:00:00+02:00"),
  );
});

test("standalone Hub expiry preserves seconds and milliseconds", () => {
  assert.deepEqual(
    getStandaloneHubPeriodEnd({
      startsAt: new Date("2026-11-10T12:34:56.789+01:00"),
    }),
    new Date("2027-01-05T12:34:56.789+01:00"),
  );
});

test("calculating standalone Hub expiry does not change its start", () => {
  const startsAt = new Date("2026-11-10T12:00:00+01:00");

  const result = getStandaloneHubPeriodEnd({ startsAt });

  assert.deepEqual(result, new Date("2027-01-05T12:00:00+01:00"));
  assert.deepEqual(startsAt, new Date("2026-11-10T12:00:00+01:00"));
});
