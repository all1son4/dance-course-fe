import assert from "node:assert/strict";
import test from "node:test";

import { getPaidHubPeriodState, type PaidHubPeriodState } from "./period-state";

const MODES = ["payment", "after_entitlement"] as const;
const STARTS_AT = new Date("2026-11-16T00:00:00+01:00");
const EXPIRES_AT = new Date("2027-01-11T00:00:00+01:00");
const INSIDE_PERIOD = new Date("2026-12-01T12:00:00+01:00");

type StateCase = {
  name: string;
  periodStartMode: (typeof MODES)[number] | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  checkedAt: Date;
  expected: PaidHubPeriodState;
};

const cases: StateCase[] = [
  {
    name: "a legacy period without dates remains unclassified",
    periodStartMode: null,
    startsAt: null,
    expiresAt: null,
    checkedAt: INSIDE_PERIOD,
    expected: "legacy",
  },
  {
    name: "a legacy period is not classified as active from its dates alone",
    periodStartMode: null,
    startsAt: STARTS_AT,
    expiresAt: EXPIRES_AT,
    checkedAt: INSIDE_PERIOD,
    expected: "legacy",
  },
  {
    name: "after_entitlement waits only while both dates are unknown",
    periodStartMode: "after_entitlement",
    startsAt: null,
    expiresAt: null,
    checkedAt: INSIDE_PERIOD,
    expected: "awaiting_predecessor",
  },
  {
    name: "payment mode cannot wait with two unknown dates",
    periodStartMode: "payment",
    startsAt: null,
    expiresAt: null,
    checkedAt: INSIDE_PERIOD,
    expected: "invalid",
  },
];

for (const periodStartMode of MODES) {
  cases.push(
    {
      name: `${periodStartMode} is scheduled one millisecond before its start`,
      periodStartMode,
      startsAt: STARTS_AT,
      expiresAt: EXPIRES_AT,
      checkedAt: new Date(STARTS_AT.getTime() - 1),
      expected: "scheduled",
    },
    {
      name: `${periodStartMode} is active exactly at its start`,
      periodStartMode,
      startsAt: STARTS_AT,
      expiresAt: EXPIRES_AT,
      checkedAt: STARTS_AT,
      expected: "active",
    },
    {
      name: `${periodStartMode} is active inside its interval using checkedAt`,
      periodStartMode,
      startsAt: STARTS_AT,
      expiresAt: EXPIRES_AT,
      checkedAt: INSIDE_PERIOD,
      expected: "active",
    },
    {
      name: `${periodStartMode} expires exactly at its end`,
      periodStartMode,
      startsAt: STARTS_AT,
      expiresAt: EXPIRES_AT,
      checkedAt: EXPIRES_AT,
      expected: "expired",
    },
    {
      name: `${periodStartMode} remains expired one millisecond after its end`,
      periodStartMode,
      startsAt: STARTS_AT,
      expiresAt: EXPIRES_AT,
      checkedAt: new Date(EXPIRES_AT.getTime() + 1),
      expected: "expired",
    },
    {
      name: `${periodStartMode} rejects a missing start`,
      periodStartMode,
      startsAt: null,
      expiresAt: EXPIRES_AT,
      checkedAt: INSIDE_PERIOD,
      expected: "invalid",
    },
    {
      name: `${periodStartMode} rejects a missing end`,
      periodStartMode,
      startsAt: STARTS_AT,
      expiresAt: null,
      checkedAt: INSIDE_PERIOD,
      expected: "invalid",
    },
    {
      name: `${periodStartMode} rejects equal boundaries before classifying time`,
      periodStartMode,
      startsAt: STARTS_AT,
      expiresAt: STARTS_AT,
      checkedAt: new Date(STARTS_AT.getTime() - 1),
      expected: "invalid",
    },
    {
      name: `${periodStartMode} rejects a reversed interval even before both dates`,
      periodStartMode,
      startsAt: EXPIRES_AT,
      expiresAt: STARTS_AT,
      checkedAt: new Date(STARTS_AT.getTime() - 1),
      expected: "invalid",
    },
  );
}

for (const { name, expected, ...values } of cases) {
  test(name, () => {
    const input = Object.freeze({
      ...values,
      startsAt: values.startsAt ? new Date(values.startsAt.getTime()) : null,
      expiresAt: values.expiresAt ? new Date(values.expiresAt.getTime()) : null,
      checkedAt: new Date(values.checkedAt.getTime()),
    });
    const datesBefore = [
      input.startsAt?.getTime(),
      input.expiresAt?.getTime(),
      input.checkedAt.getTime(),
    ];

    assert.equal(getPaidHubPeriodState(input), expected);
    assert.deepEqual(
      [input.startsAt?.getTime(), input.expiresAt?.getTime(), input.checkedAt.getTime()],
      datesBefore,
      "classification must not change the input dates",
    );
  });
}
