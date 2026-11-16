import assert from "node:assert/strict";
import test from "node:test";

import {
  type HubPeriodChainInput,
  planPendingHubPeriodChain,
} from "@/lib/inspiration-hub/period-chain";

import { createHubPeriodNodeSnapshot as makeNode } from "../../tests/helpers/hub-period-node-snapshot";
import {
  buildHubPeriodChainInput,
  type HubPeriodChainSnapshotInput,
} from "./hub-period-chain";
import type { HubPeriodNodeSnapshot } from "./hub-period-nodes";

const OWNER_ID = "123456789";
const OTHER_OWNER_ID = "987654321";
const PAID_AT = "2026-11-10T12:00:00+01:00";
const ONLINE_END = "2026-11-16T00:00:00+01:00";
const FIRST_END = "2027-01-11T00:00:00+01:00";
const SECOND_END = "2027-03-08T00:00:00+01:00";
const INVALID = "hub_period_chain_invalid";
const INVALID_PREDECESSOR = "hub_period_predecessor_invalid";

function makeInput(
  nodes: readonly HubPeriodNodeSnapshot[],
  cohort: HubPeriodChainSnapshotInput["cohort"] = null,
): HubPeriodChainSnapshotInput {
  return { telegramUserId: OWNER_ID, nodes, cohort };
}

function makeResolved(
  id = "A",
  predecessorId = "O",
  startsAt = ONLINE_END,
  expiresAt = FIRST_END,
  paidAt = PAID_AT,
): HubPeriodNodeSnapshot {
  const node = makeNode(id, predecessorId);
  node.purchase.succeededAt = new Date(paidAt);
  node.entitlement.startsAt = new Date(startsAt);
  node.entitlement.expiresAt = new Date(expiresAt);
  return node;
}

function makePaymentRoot(): HubPeriodNodeSnapshot {
  const node = makeResolved("payment", "unused", PAID_AT, "2027-01-05T12:00:00+01:00");
  node.entitlement.periodStartMode = "payment";
  node.entitlement.startsAfterEntitlementId = null;
  return node;
}

function makeFixture(resolvedFirst = true, end: string | null = ONLINE_END) {
  const root = makeNode("O");
  root.entitlement.sourceKind = "online_group";
  root.entitlement.accessKey = "primary";
  root.entitlement.periodStartMode = null;
  root.entitlement.paidDurationDays = null;
  root.entitlement.startsAfterEntitlementId = null;
  root.entitlement.startsAt = new Date("2026-10-01T12:00:00+02:00");
  root.entitlement.expiresAt = end === null ? null : new Date(end);
  root.entitlement.telegramChatId = "online-chat";
  root.purchase.onlineGroupCohortId = "cohort";
  root.purchase.succeededAt = new Date("2026-10-01T09:00:00+02:00");

  const first = resolvedFirst ? makeResolved() : makeNode();
  const second = makeNode("B", "A");
  const cohort = {
    id: "cohort",
    mainChatId: "online-chat",
    accessEndsAt: end === null ? null : new Date(end),
    nextCohortStartsAt: null,
    holdsLegacyPlusHub: false,
  };
  // Input order deliberately differs from dependency order.
  const input = makeInput([second, root, first], cohort);
  return { root, first, second, cohort, input };
}

function freezeInput(input: HubPeriodChainSnapshotInput): void {
  for (const node of input.nodes) {
    Object.freeze(node.entitlement);
    Object.freeze(node.purchase);
    Object.freeze(node);
  }
  Object.freeze(input.nodes);
  if (input.cohort !== null) Object.freeze(input.cohort);
  Object.freeze(input);
}

function expectedPeriod(
  entitlementId: string,
  startsAfterEntitlementId: string,
  paidAt = PAID_AT,
): HubPeriodChainInput["periods"][number] {
  return {
    entitlementId,
    startsAfterEntitlementId,
    paidAt: new Date(paidAt),
    startsAt: null,
    expiresAt: null,
  };
}

function assertValid(
  input: HubPeriodChainSnapshotInput,
  expected: HubPeriodChainInput,
): void {
  const before = JSON.stringify(input);
  freezeInput(input);
  const result = buildHubPeriodChainInput(input);
  const repeated = buildHubPeriodChainInput(input);

  assert.deepEqual(result, expected);
  assert.deepEqual(repeated, expected);
  assert.notStrictEqual(result, repeated);
  assert.notStrictEqual(result.predecessor, repeated.predecessor);
  assert.notStrictEqual(result.periods, repeated.periods);
  assert.notStrictEqual(result.periods, input.nodes);
  // Object.freeze does not freeze Date internals, so capture their values too.
  assert.equal(JSON.stringify(input), before);
}

function assertInvalid(input: HubPeriodChainSnapshotInput, message = INVALID): void {
  const before = JSON.stringify(input);
  freezeInput(input);
  assert.throws(() => buildHubPeriodChainInput(input), { name: "Error", message });
  assert.equal(JSON.stringify(input), before);
}

for (const end of [ONLINE_END, null]) {
  test(`a single Online root preserves its ${end === null ? "unknown" : "known"} end`, () => {
    const { root, cohort } = makeFixture(false, end);
    assertValid(makeInput([root], cohort), {
      predecessor: { entitlementId: "O", expiresAt: end === null ? null : new Date(end) },
      periods: [],
    });
  });
}

test("a standalone payment root needs no cohort or pending suffix", () => {
  const root = makePaymentRoot();
  assertValid(makeInput([root]), {
    predecessor: { entitlementId: "payment", expiresAt: root.entitlement.expiresAt },
    periods: [],
  });
});

test("standalone renewal after a payment root preserves that root's paid end", () => {
  const root = makePaymentRoot();
  assertValid(makeInput([makeNode("A", "payment"), root]), {
    predecessor: { entitlementId: "payment", expiresAt: root.entitlement.expiresAt },
    periods: [expectedPeriod("A", "payment")],
  });
});

for (const order of ["OAB", "OBA", "AOB", "ABO", "BOA", "BAO"]) {
  test(`input order ${order} produces the same validated prefix and pending suffix`, () => {
    const { root, first, second, cohort } = makeFixture();
    const nodesById = new Map([
      ["O", root],
      ["A", first],
      ["B", second],
    ]);
    const nodes = [...order].map((id) => {
      const node = nodesById.get(id);
      assert.ok(node);
      return node;
    });
    assertValid(makeInput(nodes, cohort), {
      predecessor: { entitlementId: "A", expiresAt: new Date(FIRST_END) },
      periods: [expectedPeriod("B", "A")],
    });
  });
}

for (const end of [ONLINE_END, null]) {
  test(`a fully pending chain validates with ${end === null ? "unknown" : "known"} root expiry`, () => {
    const { input } = makeFixture(false, end);
    assertValid(input, {
      predecessor: { entitlementId: "O", expiresAt: end === null ? null : new Date(end) },
      periods: [expectedPeriod("A", "O"), expectedPeriod("B", "A")],
    });
  });
}

test("a fully resolved chain returns its last anchor and no dates to rewrite", () => {
  const { root, first, cohort } = makeFixture();
  const second = makeResolved("B", "A", FIRST_END, SECOND_END);
  assertValid(makeInput([first, second, root], cohort), {
    predecessor: { entitlementId: "B", expiresAt: new Date(SECOND_END) },
    periods: [],
  });
});

test("a later pending period is checked against the most recent resolved anchor", () => {
  const { root, first, cohort } = makeFixture();
  const second = makeResolved("B", "A", FIRST_END, SECOND_END);
  const third = makeNode("C", "B");
  assertValid(makeInput([third, second, root, first], cohort), {
    predecessor: { entitlementId: "B", expiresAt: new Date(SECOND_END) },
    periods: [expectedPeriod("C", "B")],
  });
});

for (const payment of [
  { name: "early", paidAt: PAID_AT, start: ONLINE_END, end: FIRST_END },
  { name: "at the boundary", paidAt: ONLINE_END, start: ONLINE_END, end: FIRST_END },
  {
    name: "after a break",
    paidAt: "2026-11-20T12:00:00+01:00",
    start: "2026-11-20T12:00:00+01:00",
    end: "2027-01-15T12:00:00+01:00",
  },
]) {
  test(`a resolved continuation paid ${payment.name} keeps the exact expected start`, () => {
    const { root, cohort } = makeFixture();
    const first = makeResolved("A", "O", payment.start, payment.end, payment.paidAt);
    assertValid(makeInput([first, root], cohort), {
      predecessor: { entitlementId: "A", expiresAt: new Date(payment.end) },
      periods: [],
    });
  });
}

for (const offset of [-1, 1]) {
  test(`a resolved period shifted by ${offset}ms rejects even with its own correct duration`, () => {
    const { input, first } = makeFixture();
    assert.ok(first.entitlement.startsAt);
    assert.ok(first.entitlement.expiresAt);
    first.entitlement.startsAt = new Date(first.entitlement.startsAt.getTime() + offset);
    first.entitlement.expiresAt = new Date(
      first.entitlement.expiresAt.getTime() + offset,
    );
    assertInvalid(input);
  });
}

test("a late purchase cannot retain a start before its payment", () => {
  const { input, first } = makeFixture();
  first.purchase.succeededAt = new Date("2026-11-20T12:00:00+01:00");
  assertInvalid(input, INVALID_PREDECESSOR);
});

test("a continuation cannot start one day late merely because its own 56 days are correct", () => {
  const { root, cohort } = makeFixture();
  const first = makeResolved(
    "A",
    "O",
    "2026-11-17T00:00:00+01:00",
    "2027-01-12T00:00:00+01:00",
  );
  assertInvalid(makeInput([root, first], cohort));
});

test("a second resolved continuation is compared with the first, not the Online root", () => {
  const { root, first, cohort } = makeFixture();
  const second = makeResolved("B", "A");
  assertInvalid(makeInput([second, first, root], cohort));
});

test("a ready period after a pending one rejects even with a valid payment and duration", () => {
  const { root, first, cohort } = makeFixture(false);
  const second = makeResolved("B", "A", FIRST_END, SECOND_END);
  assertInvalid(makeInput([second, root, first], cohort));
});

test("a resolved continuation cannot follow an unknown Online end", () => {
  assertInvalid(makeFixture(true, null).input);
});

for (const position of ["first", "second"] as const) {
  for (const present of ["startsAt", "expiresAt"] as const) {
    test(`${position} with only ${present} set is invalid`, () => {
      const fixture = makeFixture(false);
      fixture[position].entitlement[present] = new Date(ONLINE_END);
      assertInvalid(fixture.input);
    });
  }
}

test("an empty snapshot is invalid", () => {
  assertInvalid(makeInput([]));
});

test("duplicate entitlement IDs reject before a Map can overwrite the first node", () => {
  const { input, root, first, second } = makeFixture();
  input.nodes = [root, first, second, makeNode("A", "O", "different-purchase")];
  assertInvalid(input);
});

test("repeating the same snapshot object also rejects", () => {
  const { input, root, first } = makeFixture();
  input.nodes = [root, first, first];
  assertInvalid(input);
});

for (const pair of ["root-first", "root-second", "first-second"] as const) {
  test(`duplicate purchase at ${pair} rejects across the complete history`, () => {
    const { input, root, first, second } = makeFixture();
    const [earlier, later] =
      pair === "root-first"
        ? [root, first]
        : pair === "root-second"
          ? [root, second]
          : [first, second];
    later.purchase.id = earlier.purchase.id;
    later.entitlement.purchaseId = earlier.purchase.id;
    assertInvalid(input);
  });
}

test("multiple roots reject instead of selecting one", () => {
  const { input, root } = makeFixture();
  input.nodes = [root, makePaymentRoot()];
  assertInvalid(input);
});

test("an absent ancestor is invalid even if the remaining node has dates", () => {
  const { input, first } = makeFixture();
  first.entitlement.startsAfterEntitlementId = "missing";
  assertInvalid(input);
});

test("a dated continuation cannot become a root by omitting its ancestor from input", () => {
  assertInvalid(makeInput([makeResolved()]));
});

test("a self-reference is invalid", () => {
  const { input, first } = makeFixture();
  first.entitlement.startsAfterEntitlementId = first.entitlement.id;
  assertInvalid(input);
});

test("two successors of the same ancestor are invalid", () => {
  const { input, second } = makeFixture();
  second.entitlement.startsAfterEntitlementId = "O";
  assertInvalid(input);
});

for (const size of [2, 3]) {
  for (const includeRoot of [false, true]) {
    test(`${size}-node cycle ${includeRoot ? "beside a root" : "without a root"} rejects completely`, () => {
      const { root, cohort } = makeFixture();
      const cycle =
        size === 2
          ? [makeNode("A", "B"), makeNode("B", "A")]
          : [makeNode("A", "C"), makeNode("B", "A"), makeNode("C", "B")];
      assertInvalid(makeInput(includeRoot ? [root, ...cycle] : cycle, cohort));
    });
  }
}

type NodeMutation = {
  name: string;
  apply: (node: HubPeriodNodeSnapshot) => void;
};

const invalidNodeMutations: NodeMutation[] = [
  {
    name: "another purchase owner",
    apply: (node) => {
      node.purchase.telegramUserId = OTHER_OWNER_ID;
    },
  },
  {
    name: "a mismatching bound owner",
    apply: (node) => {
      node.entitlement.telegramUserId = OTHER_OWNER_ID;
    },
  },
  {
    name: "a failed payment",
    apply: (node) => {
      node.purchase.outcome = "failed";
    },
  },
  {
    name: "a revoked right",
    apply: (node) => {
      node.entitlement.status = "revoked";
      node.entitlement.revokedAt = new Date(PAID_AT);
    },
  },
  {
    name: "a mismatching purchase reference",
    apply: (node) => {
      node.entitlement.purchaseId = "missing-purchase";
    },
  },
];

for (const position of ["root", "first", "second"] as const) {
  for (const mutation of invalidNodeMutations) {
    test(`${position} with ${mutation.name} rejects without skipping historical checks`, () => {
      const fixture = makeFixture();
      mutation.apply(fixture[position]);
      assertInvalid(fixture.input, position === "second" ? INVALID : INVALID_PREDECESSOR);
    });
  }
}

// Hub periods count from their payment; an Online root takes its end from the cohort.
for (const position of ["first", "second"] as const) {
  test(`${position} with a missing payment timestamp rejects without skipping historical checks`, () => {
    const fixture = makeFixture();
    fixture[position].purchase.succeededAt = null;
    assertInvalid(fixture.input, position === "second" ? INVALID : INVALID_PREDECESSOR);
  });
}

test("an Online root granted for free without a payment time still anchors the chain", () => {
  const { input, root } = makeFixture();
  root.purchase.succeededAt = null;
  assertValid(input, {
    predecessor: { entitlementId: "A", expiresAt: new Date(FIRST_END) },
    periods: [expectedPeriod("B", "A")],
  });
});

for (const mutation of invalidNodeMutations) {
  test(`an unknown root end still rejects a pending right with ${mutation.name}`, () => {
    const fixture = makeFixture(false, null);
    mutation.apply(fixture.second);
    assertInvalid(fixture.input);
  });
}

for (const status of ["expired", "left_channel"] as const) {
  test(`paid history with ${status} delivery status remains usable as a calendar anchor`, () => {
    const { input, root, first, second } = makeFixture();
    for (const node of [root, first, second]) node.entitlement.status = status;
    assertValid(input, {
      predecessor: { entitlementId: "A", expiresAt: new Date(FIRST_END) },
      periods: [expectedPeriod("B", "A")],
    });
  });
}

test("legacy expiry revocation cannot be silently cleared in historical data", () => {
  const { input, root } = makeFixture();
  root.entitlement.status = "revoked";
  root.entitlement.revokedAt = new Date(ONLINE_END);
  root.entitlement.revokedReason = "expired";
  assertInvalid(input, INVALID_PREDECESSOR);
});

test("a legacy root is rejected by the existing predecessor validator", () => {
  const { input, root } = makeFixture();
  root.entitlement.sourceKind = null;
  assertInvalid(input, INVALID_PREDECESSOR);
});

test("an Online root requires its cohort", () => {
  const { input } = makeFixture();
  input.cohort = null;
  assertInvalid(input, INVALID_PREDECESSOR);
});

test("a mismatching root cohort is rejected", () => {
  const { input, cohort } = makeFixture();
  cohort.id = "different-cohort";
  assertInvalid(input, INVALID_PREDECESSOR);
});

test("a payment root rejects an unrelated cohort", () => {
  const { cohort } = makeFixture();
  assertInvalid(makeInput([makePaymentRoot()], cohort), INVALID_PREDECESSOR);
});

test("a resolved standalone purchase cannot carry an Online cohort", () => {
  const { input, first } = makeFixture();
  first.purchase.onlineGroupCohortId = "cohort";
  assertInvalid(input, INVALID_PREDECESSOR);
});

test("a resolved continuation must keep the exact 56-calendar-day end", () => {
  const { input, first } = makeFixture();
  first.entitlement.expiresAt = new Date("2027-01-12T00:00:00+01:00");
  assertInvalid(input, INVALID_PREDECESSOR);
});

for (const field of ["startsAt", "expiresAt"] as const) {
  test(`a resolved continuation with invalid ${field} is rejected before date comparison`, () => {
    const { input, first } = makeFixture();
    first.entitlement[field] = new Date(Number.NaN);
    assertInvalid(input, INVALID_PREDECESSOR);
  });
}

for (const calendar of [
  {
    name: "spring",
    start: "2026-03-01T12:34:56.789+01:00",
    end: "2026-04-26T12:34:56.789+02:00",
    payment: "2026-02-20T12:00:00+01:00",
  },
  {
    name: "autumn",
    start: "2026-10-01T12:34:56.789+02:00",
    end: "2026-11-26T12:34:56.789+01:00",
    payment: "2026-09-20T12:00:00+02:00",
  },
]) {
  test(`resolved history across ${calendar.name} DST preserves Warsaw clock time and milliseconds`, () => {
    const { root, cohort } = makeFixture(false, calendar.start);
    root.entitlement.startsAt = new Date("2025-01-01T12:00:00+01:00");
    root.purchase.succeededAt = new Date("2025-01-01T09:00:00+01:00");
    const first = makeResolved("A", "O", calendar.start, calendar.end, calendar.payment);
    assertValid(makeInput([first, root], cohort), {
      predecessor: { entitlementId: "A", expiresAt: new Date(calendar.end) },
      periods: [],
    });
  });
}

test("canonical expired history remains usable without a current-time check", () => {
  const { root, cohort } = makeFixture(false, "2010-11-16T00:00:00+01:00");
  root.entitlement.startsAt = new Date("2010-10-01T12:00:00+02:00");
  root.purchase.succeededAt = new Date("2010-10-01T09:00:00+02:00");
  const first = makeResolved(
    "A",
    "O",
    "2010-11-16T00:00:00+01:00",
    "2011-01-11T00:00:00+01:00",
    "2010-11-10T12:00:00+01:00",
  );
  first.entitlement.status = "expired";
  assertValid(makeInput([first, root], cohort), {
    predecessor: { entitlementId: "A", expiresAt: new Date("2011-01-11T00:00:00+01:00") },
    periods: [],
  });
});

test("a long reversed pending chain is returned completely without an arbitrary limit", () => {
  const { root, cohort } = makeFixture(false, null);
  const nodes: HubPeriodNodeSnapshot[] = [root];
  const periods: HubPeriodChainInput["periods"][number][] = [];
  let previousId = "O";
  for (let index = 0; index < 128; index += 1) {
    const id = `period-${index}`;
    nodes.push(makeNode(id, previousId));
    periods.push(expectedPeriod(id, previousId));
    previousId = id;
  }
  assertValid(makeInput(nodes.reverse(), cohort), {
    predecessor: { entitlementId: "O", expiresAt: null },
    periods,
  });
});

test("the full-history adapter composes with the planner for only the pending suffix", () => {
  const { input } = makeFixture();
  const before = JSON.stringify(input);
  freezeInput(input);
  assert.deepEqual(planPendingHubPeriodChain(buildHubPeriodChainInput(input)), {
    updates: [
      {
        entitlementId: "B",
        startsAt: new Date(FIRST_END),
        expiresAt: new Date(SECOND_END),
      },
    ],
    waitingEntitlementIds: [],
  });
  assert.equal(JSON.stringify(input), before);
});

test("an unknown Online end composes into waiting for the entire paid suffix", () => {
  const { input } = makeFixture(false, null);
  freezeInput(input);
  assert.deepEqual(planPendingHubPeriodChain(buildHubPeriodChainInput(input)), {
    updates: [],
    waitingEntitlementIds: ["A", "B"],
  });
});

test("after closure and applying a plan, repeated validation has no periods left to write", () => {
  const { input, root, first, second, cohort } = makeFixture(false, null);
  assert.deepEqual(planPendingHubPeriodChain(buildHubPeriodChainInput(input)), {
    updates: [],
    waitingEntitlementIds: ["A", "B"],
  });

  root.entitlement.expiresAt = new Date(ONLINE_END);
  cohort.accessEndsAt = new Date(ONLINE_END);
  const plan = planPendingHubPeriodChain(buildHubPeriodChainInput(input));
  assert.deepEqual(plan, {
    updates: [
      {
        entitlementId: "A",
        startsAt: new Date(ONLINE_END),
        expiresAt: new Date(FIRST_END),
      },
      {
        entitlementId: "B",
        startsAt: new Date(FIRST_END),
        expiresAt: new Date(SECOND_END),
      },
    ],
    waitingEntitlementIds: [],
  });
  // Simulate persisted dates in memory; DB locking/writing is tested separately.
  for (const update of plan.updates) {
    const node = [first, second].find(
      (item) => item.entitlement.id === update.entitlementId,
    );
    assert.ok(node);
    node.entitlement.startsAt = update.startsAt;
    node.entitlement.expiresAt = update.expiresAt;
  }
  const before = JSON.stringify(input);
  freezeInput(input);
  assert.deepEqual(planPendingHubPeriodChain(buildHubPeriodChainInput(input)), {
    updates: [],
    waitingEntitlementIds: [],
  });
  assert.equal(JSON.stringify(input), before);
});
