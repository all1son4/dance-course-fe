import assert from "node:assert/strict";
import test from "node:test";

import {
  type HubAccessRight,
  isHubAccessRightActive,
} from "@/lib/inspiration-hub/access-state";

const START = new Date("2026-11-16T00:00:00+01:00");
const END = new Date("2027-01-11T00:00:00+01:00");
const INSIDE = new Date("2026-11-20T12:00:00+01:00");

const standalone = (overrides: Partial<HubAccessRight> = {}): HubAccessRight => ({
  sourceKind: "standalone_hub",
  periodStartMode: "payment",
  startsAt: START,
  expiresAt: END,
  ...overrides,
});

test("a standalone period is active from its start inclusive to its end exclusive", () => {
  assert.equal(
    isHubAccessRightActive(standalone(), new Date(START.getTime() - 1)),
    false,
  );
  assert.equal(isHubAccessRightActive(standalone(), START), true);
  assert.equal(isHubAccessRightActive(standalone(), INSIDE), true);
  assert.equal(isHubAccessRightActive(standalone(), new Date(END.getTime() - 1)), true);
  assert.equal(isHubAccessRightActive(standalone(), END), false);
});

test("a resolved continuation is active inside its dates", () => {
  const right = standalone({ periodStartMode: "after_entitlement" });

  assert.equal(isHubAccessRightActive(right, INSIDE), true);
});

test("a continuation awaiting its predecessor grants nothing", () => {
  const right = standalone({
    periodStartMode: "after_entitlement",
    startsAt: null,
    expiresAt: null,
  });

  assert.equal(isHubAccessRightActive(right, INSIDE), false);
});

test("a standalone right with missing, zero-length or legacy dates grants nothing", () => {
  const invalidRights = [
    standalone({ startsAt: null }),
    standalone({ expiresAt: null }),
    standalone({ startsAt: START, expiresAt: START }),
    standalone({ periodStartMode: null }),
  ];

  for (const right of invalidRights) {
    assert.equal(isHubAccessRightActive(right, START), false);
  }
});

test("a gap bridge needs both dates and uses the same inclusive start and exclusive end", () => {
  const bridge: HubAccessRight = {
    sourceKind: "hub_bridge",
    periodStartMode: null,
    startsAt: START,
    expiresAt: END,
  };

  assert.equal(isHubAccessRightActive(bridge, START), true);
  assert.equal(isHubAccessRightActive(bridge, END), false);
  assert.equal(isHubAccessRightActive({ ...bridge, startsAt: null }, INSIDE), false);
  assert.equal(isHubAccessRightActive({ ...bridge, expiresAt: null }, INSIDE), false);
});

test("the Hub included in Plus stays open until an end is recorded", () => {
  const plusHub: HubAccessRight = {
    sourceKind: "online_group",
    periodStartMode: null,
    startsAt: null,
    expiresAt: null,
  };

  assert.equal(isHubAccessRightActive(plusHub, INSIDE), true);
  assert.equal(isHubAccessRightActive({ ...plusHub, expiresAt: END }, INSIDE), true);
  assert.equal(isHubAccessRightActive({ ...plusHub, expiresAt: END }, END), false);
});

test("the Hub of a future Plus does not open before the cohort start", () => {
  const futurePlusHub: HubAccessRight = {
    sourceKind: "online_group",
    periodStartMode: null,
    startsAt: START,
    expiresAt: null,
  };

  assert.equal(
    isHubAccessRightActive(futurePlusHub, new Date(START.getTime() - 1)),
    false,
  );
  assert.equal(isHubAccessRightActive(futurePlusHub, START), true);
});
