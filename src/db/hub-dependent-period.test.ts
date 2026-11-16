import assert from "node:assert/strict";
import test from "node:test";

import { planPendingHubPeriodChain } from "@/lib/inspiration-hub/period-chain";

import { createHubPeriodNodeSnapshot as makeNode } from "../../tests/helpers/hub-period-node-snapshot";
import {
  buildHubDependentPeriodValues,
  type HubDependentPeriodInput,
} from "./hub-dependent-period";
import { buildHubPeriodChainInput } from "./hub-period-chain";
import type { HubPeriodNodeSnapshot } from "./hub-period-nodes";
import type { HubPeriodPredecessorInput } from "./hub-period-predecessor";
import type { accessEntitlements } from "./schema";

const OWNER_ID = "123456789";
const OTHER_OWNER_ID = "987654321";
const PARENT_PAID_AT = "2026-11-10T12:00:00+01:00";
const NEW_PAID_AT = "2026-11-12T10:20:15.123+01:00";
const ONLINE_END = "2026-11-16T00:00:00+01:00";
const HUB_END = "2027-01-05T12:00:00+01:00";
const INVALID = { name: "Error", message: "hub_dependent_period_invalid" };
const INVALID_PREDECESSOR = { name: "Error", message: "hub_period_predecessor_invalid" };

function makeOnline(end: string | null = ONLINE_END): HubPeriodPredecessorInput {
  const node = makeNode("online-right", "unused", "purchase-online");
  node.entitlement = {
    ...node.entitlement,
    sourceKind: "online_group",
    accessKey: "primary",
    periodStartMode: null,
    paidDurationDays: null,
    startsAfterEntitlementId: null,
    startsAt: new Date("2026-09-01T12:00:00+02:00"),
    expiresAt: end === null ? null : new Date(end),
    telegramChatId: "online-chat",
  };
  node.purchase.onlineGroupCohortId = "cohort-online";
  return {
    telegramUserId: OWNER_ID,
    node,
    cohort: {
      id: "cohort-online",
      mainChatId: "online-chat",
      accessEndsAt: end === null ? null : new Date(end),
      nextCohortStartsAt: null,
      holdsLegacyPlusHub: false,
    },
  };
}

function makeHub(
  mode: "payment" | "after_entitlement" = "payment",
): HubPeriodPredecessorInput {
  const node = makeNode("hub-right", "earlier-right", "purchase-hub");
  node.entitlement.periodStartMode = mode;
  node.entitlement.startsAfterEntitlementId = mode === "payment" ? null : "earlier-right";
  node.entitlement.startsAt = new Date(mode === "payment" ? PARENT_PAID_AT : ONLINE_END);
  node.entitlement.expiresAt = new Date(
    mode === "payment" ? HUB_END : "2027-01-11T00:00:00+01:00",
  );
  return { telegramUserId: OWNER_ID, node, cohort: null };
}

function makeInput(
  predecessor = makeOnline(),
  purchaseId = "purchase-new",
): HubDependentPeriodInput {
  const { purchase } = makeNode("new-right", "unused", purchaseId);
  purchase.succeededAt = new Date(NEW_PAID_AT);
  return { purchase, predecessor };
}

function freezeInput(input: HubDependentPeriodInput): void {
  Object.freeze(input.purchase);
  Object.freeze(input.predecessor.node.purchase);
  Object.freeze(input.predecessor.node.entitlement);
  Object.freeze(input.predecessor.node);
  if (input.predecessor.cohort !== null) Object.freeze(input.predecessor.cohort);
  Object.freeze(input.predecessor);
  Object.freeze(input);
}

function assertValid(input: HubDependentPeriodInput): void {
  const before = JSON.stringify(input);
  freezeInput(input);
  const first = buildHubDependentPeriodValues(input);
  const second = buildHubDependentPeriodValues(input);
  // The inferred return type must also be compatible with the real insert schema.
  const insertValues: typeof accessEntitlements.$inferInsert = first;
  assert.deepEqual(insertValues, {
    purchaseId: input.purchase.id,
    accessKey: "inspiration-hub",
    sourceKind: "standalone_hub",
    periodStartMode: "after_entitlement",
    paidDurationDays: 56,
    startsAfterEntitlementId: input.predecessor.node.entitlement.id,
    startsAt: null,
    expiresAt: null,
  });
  assert.deepEqual(second, first);
  assert.notStrictEqual(second, first);
  // Captured serialization detects Date mutation, which Object.freeze cannot stop.
  assert.equal(JSON.stringify(input), before);
}

function assertInvalid(input: HubDependentPeriodInput, expected = INVALID): void {
  const before = JSON.stringify(input);
  freezeInput(input);
  assert.throws(() => buildHubDependentPeriodValues(input), expected);
  assert.equal(JSON.stringify(input), before);
}

for (const end of [ONLINE_END, null]) {
  test(`dependent fields link a new purchase to an Online right with ${end === null ? "unknown" : "known"} expiry`, () => {
    assertValid(makeInput(makeOnline(end)));
  });
}

test("dependent fields link a new purchase to a payment-based Hub right", () => {
  assertValid(makeInput(makeHub()));
});

test("an expired Hub right remains a valid calendar predecessor", () => {
  const predecessor = makeHub();
  predecessor.node.purchase.succeededAt = new Date("2020-11-10T12:00:00+01:00");
  predecessor.node.entitlement.startsAt = new Date("2020-11-10T12:00:00+01:00");
  predecessor.node.entitlement.expiresAt = new Date("2021-01-05T12:00:00+01:00");
  predecessor.node.entitlement.status = "expired";
  assertValid(makeInput(predecessor));
});

test("a resolved dependent Hub right can precede another paid continuation", () => {
  assertValid(makeInput(makeHub("after_entitlement")));
});

test("a paid Hub continuation with unknown dates can precede another continuation", () => {
  const predecessor = makeHub("after_entitlement");
  predecessor.node.entitlement.startsAt = null;
  predecessor.node.entitlement.expiresAt = null;
  assertValid(makeInput(predecessor));
});

test("leaving the Hub does not invalidate a nonrevoked paid calendar predecessor", () => {
  const predecessor = makeHub();
  predecessor.node.entitlement.status = "left_channel";
  assertValid(makeInput(predecessor));
});

for (const outcome of ["processing", "requires_action", "failed", "canceled"] as const) {
  test(`a new purchase with outcome ${outcome} cannot create a dependency`, () => {
    const input = makeInput();
    input.purchase.outcome = outcome;
    assertInvalid(input);
  });
}

test("a new purchase must have a canonical successful-payment timestamp", () => {
  const input = makeInput();
  input.purchase.succeededAt = null;
  assertInvalid(input);
});

test("a new purchase cannot use an Invalid Date", () => {
  const input = makeInput();
  input.purchase.succeededAt = new Date("invalid");
  assertInvalid(input);
});

test("a standalone continuation purchase cannot itself belong to an Online cohort", () => {
  const input = makeInput();
  input.purchase.onlineGroupCohortId = "cohort-online";
  assertInvalid(input);
});

for (const owner of [null, OTHER_OWNER_ID]) {
  test(`a new purchase with ${owner === null ? "unknown" : "different"} owner cannot use this predecessor`, () => {
    const input = makeInput();
    input.purchase.telegramUserId = owner;
    assertInvalid(input);
  });
}

test("the new purchase must differ from the predecessor purchase", () => {
  const input = makeInput();
  input.purchase.id = input.predecessor.node.purchase.id;
  assertInvalid(input);
});

const invalidPredecessors: {
  name: string;
  change: (input: HubPeriodPredecessorInput) => void;
}[] = [
  {
    name: "a revoked timestamp",
    change: (input) => {
      input.node.entitlement.revokedAt = new Date(NEW_PAID_AT);
    },
  },
  {
    name: "revoked status",
    change: (input) => {
      input.node.entitlement.status = "revoked";
    },
  },
  {
    name: "a failed prior payment",
    change: (input) => {
      input.node.purchase.outcome = "failed";
    },
  },
  {
    name: "a different prior buyer",
    change: (input) => {
      input.node.purchase.telegramUserId = OTHER_OWNER_ID;
    },
  },
  {
    name: "a different bound identity",
    change: (input) => {
      input.node.entitlement.telegramUserId = OTHER_OWNER_ID;
    },
  },
  {
    name: "legacy classification",
    change: (input) => {
      input.node.entitlement.sourceKind = null;
    },
  },
  {
    name: "a missing Online cohort",
    change: (input) => {
      input.cohort = null;
    },
  },
];

for (const invalid of invalidPredecessors) {
  test(`predecessor validation rejects ${invalid.name} with its own domain error`, () => {
    const input = makeInput();
    invalid.change(input.predecessor);
    assertInvalid(input, INVALID_PREDECESSOR);
  });
}

test("a stale end projection on the Online predecessor does not block the continuation", () => {
  const input = makeInput();
  input.predecessor.node.entitlement.expiresAt = new Date("2026-11-17T00:00:00+01:00");
  assertValid(input);
});

test("a bad new purchase is rejected before validating a bad predecessor", () => {
  const input = makeInput();
  input.purchase.succeededAt = null;
  input.predecessor.node.entitlement.status = "revoked";
  assertInvalid(input);
});

for (const unexpected of [
  new Error("predecessor_calendar_failed", { cause: new Error("original_cause") }),
  { reason: "unexpected_predecessor_value" },
]) {
  test(`an unexpected predecessor ${unexpected instanceof Error ? "Error/cause" : "thrown value"} is preserved`, (context) => {
    const cause = unexpected instanceof Error ? unexpected.cause : undefined;
    context.mock.method(Intl.DateTimeFormat.prototype, "formatToParts", () => {
      throw unexpected;
    });
    assert.throws(
      () => buildHubDependentPeriodValues(makeInput(makeHub())),
      (error: unknown) => error === unexpected,
    );
    if (unexpected instanceof Error) assert.strictEqual(unexpected.cause, cause);
  });
}

function dependentNode(
  input: HubDependentPeriodInput,
  id = "new-right",
): HubPeriodNodeSnapshot {
  const node = makeNode(id, input.predecessor.node.entitlement.id, input.purchase.id);
  node.purchase = { ...node.purchase, ...input.purchase };
  node.entitlement = { ...node.entitlement, ...buildHubDependentPeriodValues(input) };
  return node;
}

function plan(input: HubDependentPeriodInput) {
  const child = dependentNode(input);
  return planPendingHubPeriodChain(
    buildHubPeriodChainInput({
      telegramUserId: OWNER_ID,
      nodes: [child, input.predecessor.node],
      cohort: input.predecessor.cohort,
    }),
  );
}

for (const end of [ONLINE_END, null]) {
  test(`new dependent fields compose with full-history planning for ${end === null ? "an open" : "a closed"} Online cohort`, () => {
    const input = makeInput(makeOnline(end));
    assert.deepEqual(
      plan(input),
      end === null
        ? { updates: [], waitingEntitlementIds: ["new-right"] }
        : {
            updates: [
              {
                entitlementId: "new-right",
                startsAt: new Date(ONLINE_END),
                expiresAt: new Date("2027-01-11T00:00:00+01:00"),
              },
            ],
            waitingEntitlementIds: [],
          },
    );
  });
}

test("full-history planning preserves the remaining Hub time before the new 56 days", () => {
  assert.deepEqual(plan(makeInput(makeHub())), {
    updates: [
      {
        entitlementId: "new-right",
        startsAt: new Date(HUB_END),
        expiresAt: new Date("2027-03-02T12:00:00+01:00"),
      },
    ],
    waitingEntitlementIds: [],
  });
});

test("full-history planning starts a late continuation at its payment time", () => {
  const input = makeInput(makeHub());
  input.purchase.succeededAt = new Date("2027-01-07T12:00:00+01:00");
  assert.deepEqual(plan(input), {
    updates: [
      {
        entitlementId: "new-right",
        startsAt: new Date("2027-01-07T12:00:00+01:00"),
        expiresAt: new Date("2027-03-04T12:00:00+01:00"),
      },
    ],
    waitingEntitlementIds: [],
  });
});

test("two new paid dependencies wait together and resolve sequentially after Online closure", () => {
  const root = makeOnline(null);
  const first = dependentNode(makeInput(root, "purchase-first"), "first-right");
  const second = dependentNode(
    makeInput({ telegramUserId: OWNER_ID, node: first, cohort: null }, "purchase-second"),
    "second-right",
  );
  const history = {
    telegramUserId: OWNER_ID,
    nodes: [second, root.node, first],
    cohort: root.cohort,
  };
  assert.deepEqual(planPendingHubPeriodChain(buildHubPeriodChainInput(history)), {
    updates: [],
    waitingEntitlementIds: ["first-right", "second-right"],
  });
  assert.ok(root.cohort);
  root.cohort.accessEndsAt = new Date(ONLINE_END);
  root.node.entitlement.expiresAt = new Date(ONLINE_END);
  assert.deepEqual(planPendingHubPeriodChain(buildHubPeriodChainInput(history)), {
    updates: [
      {
        entitlementId: "first-right",
        startsAt: new Date(ONLINE_END),
        expiresAt: new Date("2027-01-11T00:00:00+01:00"),
      },
      {
        entitlementId: "second-right",
        startsAt: new Date("2027-01-11T00:00:00+01:00"),
        expiresAt: new Date("2027-03-08T00:00:00+01:00"),
      },
    ],
    waitingEntitlementIds: [],
  });
  assert.deepEqual(
    [
      first.entitlement.startsAt,
      first.entitlement.expiresAt,
      second.entitlement.startsAt,
      second.entitlement.expiresAt,
    ],
    [null, null, null, null],
  );
});

for (const period of [
  {
    name: "autumn",
    end: "2026-10-01T12:00:00+02:00",
    paidAt: "2026-09-29T12:00:00+02:00",
    expiresAt: "2026-11-26T12:00:00+01:00",
  },
  {
    name: "spring",
    end: "2027-02-15T12:00:00+01:00",
    paidAt: "2027-02-10T12:00:00+01:00",
    expiresAt: "2027-04-12T12:00:00+02:00",
  },
]) {
  test(`new dependencies use the existing Warsaw calendar across ${period.name} DST`, () => {
    const input = makeInput(makeOnline(period.end));
    input.predecessor.node.purchase.succeededAt = new Date("2026-09-15T12:00:00+02:00");
    input.purchase.succeededAt = new Date(period.paidAt);
    assert.deepEqual(plan(input), {
      updates: [
        {
          entitlementId: "new-right",
          startsAt: new Date(period.end),
          expiresAt: new Date(period.expiresAt),
        },
      ],
      waitingEntitlementIds: [],
    });
  });
}
