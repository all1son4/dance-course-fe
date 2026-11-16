import assert from "node:assert/strict";
import test from "node:test";

import { isEligibleForRenewalPrice } from "@/lib/inspiration-hub/renewal-eligibility";

const CHECKED_AT = new Date("2026-11-20T12:00:00+01:00");
const ACTIVE_PERIOD = {
  periodStartMode: "payment" as const,
  startsAt: new Date("2026-11-16T00:00:00+01:00"),
  expiresAt: new Date("2027-01-11T00:00:00+01:00"),
};
const EXPIRED_PERIOD = {
  periodStartMode: "payment" as const,
  startsAt: new Date("2026-09-24T00:00:00+02:00"),
  expiresAt: new Date("2026-11-19T00:00:00+01:00"),
};
const FUTURE_PERIOD = {
  periodStartMode: "after_entitlement" as const,
  startsAt: new Date("2026-11-21T00:00:00+01:00"),
  expiresAt: new Date("2027-01-16T00:00:00+01:00"),
};
const AWAITING_PERIOD = {
  periodStartMode: "after_entitlement" as const,
  startsAt: null,
  expiresAt: null,
};

test("a member of the previous group receives renewal pricing without a Hub purchase", () => {
  assert.equal(
    isEligibleForRenewalPrice({
      checkedAt: CHECKED_AT,
      isPreviousGroupMember: true,
      standaloneHubPeriods: [],
    }),
    true,
  );
});

test("an active standalone Hub grants renewal pricing to a first-time group buyer", () => {
  assert.equal(
    isEligibleForRenewalPrice({
      checkedAt: CHECKED_AT,
      isPreviousGroupMember: false,
      standaloneHubPeriods: [ACTIVE_PERIOD],
    }),
    true,
  );
});

test("a buyer with neither previous membership nor a Hub purchase pays full price", () => {
  assert.equal(
    isEligibleForRenewalPrice({
      checkedAt: CHECKED_AT,
      isPreviousGroupMember: false,
      standaloneHubPeriods: [],
    }),
    false,
  );
});

test("expired standalone Hub access does not preserve the renewal discount", () => {
  assert.equal(
    isEligibleForRenewalPrice({
      checkedAt: CHECKED_AT,
      isPreviousGroupMember: false,
      standaloneHubPeriods: [EXPIRED_PERIOD],
    }),
    false,
  );
});

test("previous group membership remains sufficient after standalone Hub expiry", () => {
  assert.equal(
    isEligibleForRenewalPrice({
      checkedAt: CHECKED_AT,
      isPreviousGroupMember: true,
      standaloneHubPeriods: [EXPIRED_PERIOD],
    }),
    true,
  );
});

test("future and awaiting paid Hub periods alone do not grant renewal pricing yet", () => {
  assert.equal(
    isEligibleForRenewalPrice({
      checkedAt: CHECKED_AT,
      isPreviousGroupMember: false,
      standaloneHubPeriods: [FUTURE_PERIOD, AWAITING_PERIOD],
    }),
    false,
  );
});

test("any active period of a renewal chain grants the discount", () => {
  assert.equal(
    isEligibleForRenewalPrice({
      checkedAt: CHECKED_AT,
      isPreviousGroupMember: false,
      standaloneHubPeriods: [EXPIRED_PERIOD, ACTIVE_PERIOD, AWAITING_PERIOD],
    }),
    true,
  );
});
