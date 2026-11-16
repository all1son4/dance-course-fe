import assert from "node:assert/strict";
import test from "node:test";

import { getStandaloneHubPeriodStart } from "@/lib/inspiration-hub/period-start";

test("new Hub access starts at successful payment", () => {
  const result = getStandaloneHubPeriodStart({
    currentAccessEndsAt: null,
    paidAt: new Date("2026-11-10T11:00:00.000Z"),
  });

  assert.deepEqual(result, new Date("2026-11-10T11:00:00.000Z"));
});

test("early Hub renewal preserves the remaining paid access", () => {
  const result = getStandaloneHubPeriodStart({
    currentAccessEndsAt: new Date("2027-01-05T11:00:00.000Z"),
    paidAt: new Date("2026-12-25T11:00:00.000Z"),
  });

  assert.deepEqual(result, new Date("2027-01-05T11:00:00.000Z"));
});

test("returning after Hub access expired starts a new period at payment", () => {
  const result = getStandaloneHubPeriodStart({
    currentAccessEndsAt: new Date("2027-01-05T11:00:00.000Z"),
    paidAt: new Date("2027-01-12T10:00:00.000Z"),
  });

  assert.deepEqual(result, new Date("2027-01-12T10:00:00.000Z"));
});

test("payment exactly at Hub expiry starts the next period without a gap", () => {
  const result = getStandaloneHubPeriodStart({
    currentAccessEndsAt: new Date("2027-01-05T11:00:00.000Z"),
    paidAt: new Date("2027-01-05T11:00:00.000Z"),
  });

  assert.deepEqual(result, new Date("2027-01-05T11:00:00.000Z"));
});
