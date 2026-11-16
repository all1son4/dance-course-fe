import assert from "node:assert/strict";
import test from "node:test";

import { createHubPeriodNodeSnapshot } from "../../tests/helpers/hub-period-node-snapshot";
import {
  buildHubPaymentPeriodValues,
  type HubPaymentPeriodPurchase,
} from "./hub-payment-period";
import type { accessEntitlements } from "./schema";

const PAID_AT = "2026-11-10T13:20:15.123+01:00";
const EXPIRES_AT = "2027-01-05T13:20:15.123+01:00";
const INVALID = { name: "Error", message: "hub_payment_period_invalid" };

function makePurchase(paidAt = PAID_AT): HubPaymentPeriodPurchase {
  return {
    id: "purchase-hub",
    outcome: "succeeded",
    succeededAt: new Date(paidAt),
    onlineGroupCohortId: null,
  };
}

function assertInvalid(purchase: HubPaymentPeriodPurchase): void {
  const before = { ...purchase };
  const paidAt = purchase.succeededAt?.getTime();
  Object.freeze(purchase);

  assert.throws(() => buildHubPaymentPeriodValues(purchase), INVALID);
  assert.deepEqual(purchase, before);
  // Object.freeze cannot prevent Date.setTime; capture its value separately.
  assert.equal(purchase.succeededAt?.getTime(), paidAt);
}

const validPeriods = [
  {
    name: "a year boundary while preserving seconds and milliseconds",
    paidAt: PAID_AT,
    expiresAt: EXPIRES_AT,
  },
  {
    name: "autumn DST while preserving the Warsaw clock",
    paidAt: "2026-10-01T12:34:56.789+02:00",
    expiresAt: "2026-11-26T12:34:56.789+01:00",
  },
  {
    name: "spring DST while preserving the Warsaw clock",
    paidAt: "2027-02-15T12:34:56.789+01:00",
    expiresAt: "2027-04-12T12:34:56.789+02:00",
  },
  {
    name: "a skipped Warsaw expiry hour by moving forward through the gap",
    paidAt: "2027-01-31T02:30:15.123+01:00",
    expiresAt: "2027-03-28T03:30:15.123+02:00",
  },
  {
    name: "a repeated Warsaw expiry hour by choosing its earlier occurrence",
    paidAt: "2026-08-30T02:30:15.123+02:00",
    expiresAt: "2026-10-25T02:30:15.123+02:00",
  },
  {
    name: "a leap day",
    paidAt: "2028-01-15T12:00:00+01:00",
    expiresAt: "2028-03-11T12:00:00+01:00",
  },
  {
    name: "the Unix epoch without treating its zero timestamp as missing",
    paidAt: "1970-01-01T01:00:00+01:00",
    expiresAt: "1970-02-26T01:00:00+01:00",
  },
];

for (const period of validPeriods) {
  test(`payment period handles ${period.name}`, () => {
    const purchase = Object.freeze(makePurchase(period.paidAt));
    const before = purchase.succeededAt?.getTime();
    // Assignment also checks compatibility with the real insert schema in tsc.
    const result: typeof accessEntitlements.$inferInsert =
      buildHubPaymentPeriodValues(purchase);

    assert.deepEqual(result, {
      purchaseId: purchase.id,
      accessKey: "inspiration-hub",
      sourceKind: "standalone_hub",
      periodStartMode: "payment",
      paidDurationDays: 56,
      startsAfterEntitlementId: null,
      startsAt: new Date(period.paidAt),
      expiresAt: new Date(period.expiresAt),
    });
    assert.equal(purchase.succeededAt?.getTime(), before);
  });
}

for (const outcome of ["processing", "requires_action", "failed", "canceled"] as const) {
  test(`payment period rejects outcome ${outcome} even with a recorded success date`, () => {
    assertInvalid({ ...makePurchase(), outcome });
  });
}

test("payment period rejects a successful outcome without its canonical payment date", () => {
  assertInvalid({ ...makePurchase(), succeededAt: null });
});

test("payment period rejects an invalid payment date", () => {
  assertInvalid({ ...makePurchase(), succeededAt: new Date("invalid") });
});

test("payment period rejects a purchase belonging to an Online cohort", () => {
  assertInvalid({ ...makePurchase(), onlineGroupCohortId: "cohort-online" });
});

for (const daysBeforeMaximum of [0, 1]) {
  test(`payment period converts calendar overflow ${daysBeforeMaximum} days before the Date maximum to its domain error`, () => {
    const succeededAt = new Date(
      8_640_000_000_000_000 - daysBeforeMaximum * 24 * 60 * 60 * 1000,
    );
    assert.ok(Number.isFinite(succeededAt.getTime()));
    assertInvalid({ ...makePurchase(), succeededAt });
  });
}

test("payment period is repeatable and leaves the purchase and its date unchanged", () => {
  const purchase = Object.freeze(makePurchase());
  const before = JSON.stringify(purchase);
  const first = buildHubPaymentPeriodValues(purchase);
  const second = buildHubPaymentPeriodValues(purchase);

  assert.deepEqual(second, first);
  assert.notStrictEqual(second, first);
  assert.equal(JSON.stringify(purchase), before);
});

test("payment period starts at canonical payment before Telegram identity or delayed processing", () => {
  const { purchase } = createHubPeriodNodeSnapshot();
  purchase.succeededAt = new Date(PAID_AT);
  purchase.telegramUserId = null;
  purchase.firstSeenAt = new Date("2026-11-10T13:25:00+01:00");
  purchase.createdAt = new Date("2026-11-10T13:25:00+01:00");
  purchase.updatedAt = new Date("2026-11-12T10:00:00+01:00");
  const before = JSON.stringify(purchase);
  Object.freeze(purchase);

  const result = buildHubPaymentPeriodValues(purchase);

  assert.deepEqual(result.startsAt, new Date(PAID_AT));
  assert.deepEqual(result.expiresAt, new Date(EXPIRES_AT));
  assert.equal(result.purchaseId, purchase.id);
  assert.equal(JSON.stringify(purchase), before);
});

for (const unexpected of [
  new Error("unexpected_calendar_failure", { cause: new Error("original_cause") }),
  { reason: "unexpected_non_error_value" },
]) {
  test(`payment period preserves an unexpected ${unexpected instanceof Error ? "Error and its cause" : "thrown value"}`, (context) => {
    const cause = unexpected instanceof Error ? unexpected.cause : undefined;
    // The calendar formatter is reached only after validation, inside try/catch.
    // Inject a dependency failure without replacing the adapter or its date helper.
    context.mock.method(Intl.DateTimeFormat.prototype, "formatToParts", () => {
      throw unexpected;
    });

    assert.throws(
      () => buildHubPaymentPeriodValues(makePurchase()),
      (error: unknown) => error === unexpected,
    );
    if (unexpected instanceof Error) assert.strictEqual(unexpected.cause, cause);
  });
}
