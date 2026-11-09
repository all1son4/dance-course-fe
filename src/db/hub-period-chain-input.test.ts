import assert from "node:assert/strict";
import test from "node:test";

import {
  type HubPeriodChainInput,
  type PendingHubChainPeriod,
  planPendingHubPeriodChain,
} from "@/lib/inspiration-hub/period-chain";

import { createHubPeriodNodeSnapshot as makeNode } from "../../tests/helpers/hub-period-node-snapshot";
import {
  buildPendingHubPeriodChainInput,
  type PendingHubChainSnapshotInput,
} from "./hub-period-chain-input";
import type { HubPeriodNodeSnapshot } from "./hub-period-nodes";

const OWNER_ID = "123456789";
const OTHER_OWNER_ID = "987654321";
const PREDECESSOR_ID = "O";
const PREDECESSOR_PURCHASE_ID = "purchase-O";
const PREDECESSOR_END = "2026-11-16T00:00:00+01:00";
const PAID_AT = "2026-11-10T12:00:00+01:00";
const INVALID = { name: "Error", message: "hub_period_chain_invalid" };

const makeInput = (
  nodes: readonly HubPeriodNodeSnapshot[] = [makeNode("B", "A"), makeNode()],
  expiresAt: Date | null = new Date(PREDECESSOR_END),
): PendingHubChainSnapshotInput => ({
  telegramUserId: OWNER_ID,
  predecessor: {
    entitlementId: PREDECESSOR_ID,
    purchaseId: PREDECESSOR_PURCHASE_ID,
    expiresAt,
  },
  nodes,
});

const freezeInput = (input: PendingHubChainSnapshotInput) => {
  for (const node of input.nodes) {
    Object.freeze(node.entitlement);
    Object.freeze(node.purchase);
    Object.freeze(node);
  }
  Object.freeze(input.nodes);
  Object.freeze(input.predecessor);
  return Object.freeze(input);
};

const expectedPeriod = (
  entitlementId: string,
  startsAfterEntitlementId: string,
  paidAt = PAID_AT,
): PendingHubChainPeriod => ({
  entitlementId,
  startsAfterEntitlementId,
  paidAt: new Date(paidAt),
  startsAt: null,
  expiresAt: null,
});

const assertInvalidWithoutMutation = (input: PendingHubChainSnapshotInput) => {
  // Freezing objects does not freeze Date internals; capture their values too.
  const before = JSON.stringify(input);
  freezeInput(input);
  assert.throws(() => buildPendingHubPeriodChainInput(input), INVALID);
  assert.equal(JSON.stringify(input), before);
};

for (const knownEnd of [true, false]) {
  test(`an empty snapshot preserves its ${knownEnd ? "known" : "unknown"} predecessor without leaking purchase metadata`, () => {
    const input = freezeInput(makeInput([], knownEnd ? new Date(PREDECESSOR_END) : null));
    const result: HubPeriodChainInput = buildPendingHubPeriodChainInput(input);

    assert.deepEqual(result, {
      predecessor: {
        entitlementId: PREDECESSOR_ID,
        expiresAt: input.predecessor.expiresAt,
      },
      periods: [],
    });
    assert.notStrictEqual(result.predecessor, input.predecessor);
    assert.notStrictEqual(result.periods, input.nodes);
  });
}

test("one paid unbound entitlement is converted to the exact five-field period", () => {
  const input = freezeInput(makeInput([makeNode()]));
  assert.deepEqual(buildPendingHubPeriodChainInput(input), {
    predecessor: { entitlementId: PREDECESSOR_ID, expiresAt: new Date(PREDECESSOR_END) },
    periods: [expectedPeriod("A", PREDECESSOR_ID)],
  });
});

test("stored links determine order independently of input IDs and payment timestamps", () => {
  const first = makeNode("z-first", PREDECESSOR_ID);
  const second = makeNode("a-second", "z-first");
  const third = makeNode("m-third", "a-second");
  first.purchase.succeededAt = new Date("2026-11-12T12:00:00+01:00");
  second.purchase.succeededAt = new Date("2026-11-10T12:00:00+01:00");
  third.purchase.succeededAt = new Date("2026-11-11T12:00:00+01:00");

  for (const nodes of [
    [third, second, first],
    [second, first, third],
    [first, third, second],
  ]) {
    const input = freezeInput(makeInput(nodes));
    const before = JSON.stringify(input);
    const result: HubPeriodChainInput = buildPendingHubPeriodChainInput(input);
    assert.deepEqual(result.periods, [
      expectedPeriod("z-first", PREDECESSOR_ID, "2026-11-12T12:00:00+01:00"),
      expectedPeriod("a-second", "z-first", "2026-11-10T12:00:00+01:00"),
      expectedPeriod("m-third", "a-second", "2026-11-11T12:00:00+01:00"),
    ]);
    assert.equal(JSON.stringify(input), before);
  }
});

test("an unknown end still returns the full validated chain with null dates", () => {
  const input = freezeInput(makeInput(undefined, null));
  assert.deepEqual(buildPendingHubPeriodChainInput(input), {
    predecessor: { entitlementId: PREDECESSOR_ID, expiresAt: null },
    periods: [expectedPeriod("A", PREDECESSOR_ID), expectedPeriod("B", "A")],
  });
});

for (const status of ["activated", "expired", "left_channel"] as const) {
  test(`matching Telegram identity and delivery status ${status} remain valid for a pending period`, () => {
    const node = makeNode();
    node.entitlement.telegramUserId = OWNER_ID;
    node.entitlement.status = status;
    const result: HubPeriodChainInput = buildPendingHubPeriodChainInput(
      freezeInput(makeInput([node])),
    );
    assert.deepEqual(result.periods, [expectedPeriod("A", PREDECESSOR_ID)]);
  });
}

for (const knownEnd of [true, false]) {
  test(`building with ${knownEnd ? "known" : "unknown"} expiry is repeatable and returns fresh objects without changing input`, () => {
    const input = freezeInput(
      makeInput(undefined, knownEnd ? new Date(PREDECESSOR_END) : null),
    );
    const before = JSON.stringify(input);
    const first: HubPeriodChainInput = buildPendingHubPeriodChainInput(input);
    const second: HubPeriodChainInput = buildPendingHubPeriodChainInput(input);

    assert.deepEqual(first, second);
    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first.predecessor, second.predecessor);
    assert.notStrictEqual(first.periods, second.periods);
    assert.notStrictEqual(first.periods[0], second.periods[0]);
    assert.equal(JSON.stringify(input), before);
  });
}

type InvalidNodeCase = {
  name: string;
  change: (node: HubPeriodNodeSnapshot) => void;
};

const invalidNodes: InvalidNodeCase[] = [
  {
    name: "a purchase ID inconsistent with its entitlement",
    change: (node) => {
      node.purchase.id = "different-purchase";
    },
  },
  {
    name: "no confirmed payment timestamp",
    change: (node) => {
      node.purchase.succeededAt = null;
    },
  },
  {
    name: "an invalid payment timestamp",
    change: (node) => {
      node.purchase.succeededAt = new Date(Number.NaN);
    },
  },
  {
    name: "a purchase owned by another Telegram user",
    change: (node) => {
      node.purchase.telegramUserId = OTHER_OWNER_ID;
    },
  },
  {
    name: "a purchase without a verified Telegram owner",
    change: (node) => {
      node.purchase.telegramUserId = null;
    },
  },
  {
    name: "a purchase linked to an Online cohort",
    change: (node) => {
      node.purchase.onlineGroupCohortId = "cohort-id";
    },
  },
  {
    name: "a missing source classification",
    change: (node) => {
      node.entitlement.sourceKind = null;
    },
  },
  {
    name: "an Online entitlement source",
    change: (node) => {
      node.entitlement.sourceKind = "online_group";
    },
  },
  {
    name: "a bridge entitlement source",
    change: (node) => {
      node.entitlement.sourceKind = "hub_bridge";
    },
  },
  {
    name: "a primary access key",
    change: (node) => {
      node.entitlement.accessKey = "primary";
    },
  },
  {
    name: "a bridge access key",
    change: (node) => {
      node.entitlement.accessKey = "inspiration-hub-bridge";
    },
  },
  {
    name: "legacy period metadata",
    change: (node) => {
      node.entitlement.periodStartMode = null;
    },
  },
  {
    name: "a payment-started period",
    change: (node) => {
      node.entitlement.periodStartMode = "payment";
    },
  },
  {
    name: "no paid duration",
    change: (node) => {
      node.entitlement.paidDurationDays = null;
    },
  },
  {
    name: "55 paid days",
    change: (node) => {
      node.entitlement.paidDurationDays = 55;
    },
  },
  {
    name: "57 paid days",
    change: (node) => {
      node.entitlement.paidDurationDays = 57;
    },
  },
  {
    name: "no predecessor link",
    change: (node) => {
      node.entitlement.startsAfterEntitlementId = null;
    },
  },
  {
    name: "an already assigned start",
    change: (node) => {
      node.entitlement.startsAt = new Date(PREDECESSOR_END);
    },
  },
  {
    name: "an already assigned end",
    change: (node) => {
      node.entitlement.expiresAt = new Date(PREDECESSOR_END);
    },
  },
  {
    name: "an already resolved period",
    change: (node) => {
      node.entitlement.startsAt = new Date(PAID_AT);
      node.entitlement.expiresAt = new Date(PREDECESSOR_END);
    },
  },
  {
    name: "revocation by timestamp alone",
    change: (node) => {
      node.entitlement.revokedAt = new Date(PAID_AT);
    },
  },
  {
    name: "revocation by delivery status alone",
    change: (node) => {
      node.entitlement.status = "revoked";
    },
  },
  {
    name: "a conflicting entitlement Telegram identity",
    change: (node) => {
      node.entitlement.telegramUserId = OTHER_OWNER_ID;
    },
  },
];

for (const outcome of ["processing", "requires_action", "failed", "canceled"] as const) {
  invalidNodes.push({
    name: `purchase outcome ${outcome}`,
    change: (node) => {
      node.purchase.outcome = outcome;
    },
  });
}

for (const scenario of invalidNodes) {
  test(`rejects ${scenario.name} without changing the snapshot`, () => {
    const node = makeNode();
    scenario.change(node);
    assertInvalidWithoutMutation(makeInput([node]));
  });
}

test("an unknown predecessor end does not bypass validation of a later unpaid purchase", () => {
  const second = makeNode("B", "A");
  second.purchase.outcome = "processing";
  assertInvalidWithoutMutation(makeInput([makeNode(), second], null));
});

test("an unknown predecessor end does not bypass validation of a later conflicting owner", () => {
  const second = makeNode("B", "A");
  second.entitlement.telegramUserId = OTHER_OWNER_ID;
  assertInvalidWithoutMutation(makeInput([makeNode(), second], null));
});

const invalidChains: { name: string; nodes: () => HubPeriodNodeSnapshot[] }[] = [
  {
    name: "a repeated entitlement with distinct purchases",
    nodes: () => [makeNode(), makeNode("A", "A", "another-purchase")],
  },
  {
    name: "the predecessor entitlement reused as a pending node",
    nodes: () => [makeNode(PREDECESSOR_ID, PREDECESSOR_ID, "another-purchase")],
  },
  {
    name: "a payment reused by distinct pending entitlements",
    nodes: () => [makeNode(), makeNode("B", "A", "purchase-A")],
  },
  {
    name: "the predecessor purchase reused by a pending node",
    nodes: () => [makeNode("A", PREDECESSOR_ID, PREDECESSOR_PURCHASE_ID)],
  },
  {
    name: "branching directly after the predecessor",
    nodes: () => [makeNode(), makeNode("B", PREDECESSOR_ID)],
  },
  {
    name: "branching after a pending period",
    nodes: () => [makeNode(), makeNode("B", "A"), makeNode("C", "A")],
  },
  { name: "a first link to an unrelated predecessor", nodes: () => [makeNode("A", "X")] },
  {
    name: "a disconnected period after a valid prefix",
    nodes: () => [makeNode(), makeNode("B", "X")],
  },
  {
    name: "a separate chain after a valid prefix",
    nodes: () => [makeNode(), makeNode("B", "X"), makeNode("C", "B")],
  },
  { name: "a self-linked pending period", nodes: () => [makeNode("A", "A")] },
  {
    name: "a disconnected two-node cycle",
    nodes: () => [makeNode("A", "B"), makeNode("B", "A")],
  },
  {
    name: "a disconnected longer cycle beside a valid prefix",
    nodes: () => [
      makeNode("valid", PREDECESSOR_ID),
      makeNode("A", "C"),
      makeNode("B", "A"),
      makeNode("C", "B"),
    ],
  },
];

for (const scenario of invalidChains) {
  test(`rejects ${scenario.name} instead of returning a partial chain`, () => {
    assertInvalidWithoutMutation(makeInput(scenario.nodes()));
  });
}

test("a disconnected cycle is rejected even when the predecessor end is unknown", () => {
  assertInvalidWithoutMutation(makeInput([makeNode("A", "B"), makeNode("B", "A")], null));
});

test("the adapter and planner use actual late payment times in consecutive periods", () => {
  const first = makeNode();
  const second = makeNode("B", "A");
  first.purchase.succeededAt = new Date("2026-11-17T12:00:00+01:00");
  second.purchase.succeededAt = new Date("2026-11-18T12:00:00+01:00");
  const input = freezeInput(makeInput([second, first]));

  assert.deepEqual(planPendingHubPeriodChain(buildPendingHubPeriodChainInput(input)), {
    updates: [
      {
        entitlementId: "A",
        startsAt: new Date("2026-11-17T12:00:00+01:00"),
        expiresAt: new Date("2027-01-12T12:00:00+01:00"),
      },
      {
        entitlementId: "B",
        startsAt: new Date("2027-01-12T12:00:00+01:00"),
        expiresAt: new Date("2027-03-09T12:00:00+01:00"),
      },
    ],
    waitingEntitlementIds: [],
  });
});

test("the adapter and planner preserve waiting for the entire paid chain with an unknown end", () => {
  const input = freezeInput(makeInput(undefined, null));
  assert.deepEqual(planPendingHubPeriodChain(buildPendingHubPeriodChainInput(input)), {
    updates: [],
    waitingEntitlementIds: ["A", "B"],
  });
});
