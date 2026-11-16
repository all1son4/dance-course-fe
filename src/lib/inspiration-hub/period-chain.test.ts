import assert from "node:assert/strict";
import test from "node:test";

import { type HubPeriodChainInput, planPendingHubPeriodChain } from "./period-chain";

type ChainEntry = readonly [id: string, predecessorId: string, paidAt: string];

const PREDECESSOR_END = "2026-11-16T00:00:00+01:00";
const PREPAID_CHAIN: readonly ChainEntry[] = [
  ["A", "O", "2026-11-10T12:00:00+01:00"],
  ["B", "A", "2026-11-12T12:00:00+01:00"],
];

const makeInput = (
  predecessorEnd: string | null,
  entries: readonly ChainEntry[] = PREPAID_CHAIN,
): HubPeriodChainInput => ({
  predecessor: {
    entitlementId: "O",
    expiresAt: predecessorEnd === null ? null : new Date(predecessorEnd),
  },
  periods: entries.map(([entitlementId, startsAfterEntitlementId, paidAt]) => ({
    entitlementId,
    startsAfterEntitlementId,
    paidAt: new Date(paidAt),
    startsAt: null,
    expiresAt: null,
  })),
});

const freezeInput = (input: HubPeriodChainInput): HubPeriodChainInput => {
  Object.freeze(input.predecessor);
  for (const period of input.periods) Object.freeze(period);
  Object.freeze(input.periods);
  return Object.freeze(input);
};

const snapshotInput = (input: HubPeriodChainInput) => ({
  predecessor: {
    entitlementId: input.predecessor.entitlementId,
    expiresAt: input.predecessor.expiresAt?.getTime() ?? null,
  },
  periods: input.periods.map((period) => ({
    ...period,
    paidAt: period.paidAt.getTime(),
  })),
});

for (const predecessorEnd of [PREDECESSOR_END, null]) {
  test(`an empty chain has no updates or waiting IDs with ${predecessorEnd === null ? "unknown" : "known"} predecessor expiry`, () => {
    const input = freezeInput(makeInput(predecessorEnd, []));

    assert.deepEqual(planPendingHubPeriodChain(input), {
      updates: [],
      waitingEntitlementIds: [],
    });
  });
}

test("an unknown predecessor end keeps every period waiting in link order", () => {
  const input = freezeInput(
    makeInput(null, [
      ["z-first", "O", "2026-11-10T12:00:00+01:00"],
      ["a-second", "z-first", "2026-11-12T12:00:00+01:00"],
    ]),
  );

  assert.deepEqual(planPendingHubPeriodChain(input), {
    updates: [],
    waitingEntitlementIds: ["z-first", "a-second"],
  });
});

test("one prepaid period starts at its predecessor end and lasts 56 calendar days", () => {
  const input = freezeInput(makeInput(PREDECESSOR_END, [PREPAID_CHAIN[0]]));

  assert.deepEqual(planPendingHubPeriodChain(input), {
    updates: [
      {
        entitlementId: "A",
        startsAt: new Date(PREDECESSOR_END),
        expiresAt: new Date("2027-01-11T00:00:00+01:00"),
      },
    ],
    waitingEntitlementIds: [],
  });
});

test("two purchases add two consecutive periods without changing pending records", () => {
  const input = freezeInput(makeInput(PREDECESSOR_END));

  assert.deepEqual(planPendingHubPeriodChain(input), {
    updates: [
      {
        entitlementId: "A",
        startsAt: new Date(PREDECESSOR_END),
        expiresAt: new Date("2027-01-11T00:00:00+01:00"),
      },
      {
        entitlementId: "B",
        startsAt: new Date("2027-01-11T00:00:00+01:00"),
        expiresAt: new Date("2027-03-08T00:00:00+01:00"),
      },
    ],
    waitingEntitlementIds: [],
  });
  assert.ok(
    input.periods.every(
      (period) => period.startsAt === null && period.expiresAt === null,
    ),
  );
});

test("stored predecessor links determine order even when payment times are reversed", () => {
  const input = freezeInput(
    makeInput(PREDECESSOR_END, [
      ["z-first", "O", "2026-11-12T12:00:00+01:00"],
      ["a-second", "z-first", "2026-11-10T12:00:00+01:00"],
    ]),
  );
  const plan = planPendingHubPeriodChain(input);

  assert.deepEqual(plan.updates, [
    {
      entitlementId: "z-first",
      startsAt: new Date(PREDECESSOR_END),
      expiresAt: new Date("2027-01-11T00:00:00+01:00"),
    },
    {
      entitlementId: "a-second",
      startsAt: new Date("2027-01-11T00:00:00+01:00"),
      expiresAt: new Date("2027-03-08T00:00:00+01:00"),
    },
  ]);
});

test("a late first payment starts at payment and moves the following period too", () => {
  const input = freezeInput(
    makeInput(PREDECESSOR_END, [
      ["A", "O", "2026-11-17T12:00:00+01:00"],
      ["B", "A", "2026-11-18T12:00:00+01:00"],
    ]),
  );

  assert.deepEqual(planPendingHubPeriodChain(input).updates, [
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
  ]);
});

test("a late middle payment preserves its own start and carries its end forward", () => {
  const input = freezeInput(
    makeInput(PREDECESSOR_END, [
      ["A", "O", "2026-11-10T12:00:00+01:00"],
      ["B", "A", "2027-01-20T00:00:00+01:00"],
      ["C", "B", "2027-02-01T00:00:00+01:00"],
    ]),
  );

  assert.deepEqual(planPendingHubPeriodChain(input).updates, [
    {
      entitlementId: "A",
      startsAt: new Date(PREDECESSOR_END),
      expiresAt: new Date("2027-01-11T00:00:00+01:00"),
    },
    {
      entitlementId: "B",
      startsAt: new Date("2027-01-20T00:00:00+01:00"),
      expiresAt: new Date("2027-03-17T00:00:00+01:00"),
    },
    {
      entitlementId: "C",
      startsAt: new Date("2027-03-17T00:00:00+01:00"),
      expiresAt: new Date("2027-05-12T00:00:00+02:00"),
    },
  ]);
});

test("payment exactly at the predecessor end starts without a gap", () => {
  const input = freezeInput(makeInput(PREDECESSOR_END, [["A", "O", PREDECESSOR_END]]));

  assert.deepEqual(planPendingHubPeriodChain(input).updates, [
    {
      entitlementId: "A",
      startsAt: new Date(PREDECESSOR_END),
      expiresAt: new Date("2027-01-11T00:00:00+01:00"),
    },
  ]);
});

test("chained periods preserve Warsaw clock time across spring DST", () => {
  const input = freezeInput(
    makeInput("2027-02-15T12:00:00+01:00", [
      ["A", "O", "2027-02-14T12:00:00+01:00"],
      ["B", "A", "2027-02-14T12:00:00+01:00"],
    ]),
  );

  assert.deepEqual(planPendingHubPeriodChain(input).updates, [
    {
      entitlementId: "A",
      startsAt: new Date("2027-02-15T12:00:00+01:00"),
      expiresAt: new Date("2027-04-12T12:00:00+02:00"),
    },
    {
      entitlementId: "B",
      startsAt: new Date("2027-04-12T12:00:00+02:00"),
      expiresAt: new Date("2027-06-07T12:00:00+02:00"),
    },
  ]);
});

for (const predecessorEnd of [PREDECESSOR_END, null]) {
  test(`planning with ${predecessorEnd === null ? "unknown" : "known"} expiry is repeatable and does not mutate input dates or objects`, () => {
    const input = freezeInput(makeInput(predecessorEnd));
    const before = snapshotInput(input);

    const first = planPendingHubPeriodChain(input);
    const second = planPendingHubPeriodChain(input);

    assert.deepEqual(first, second);
    assert.notEqual(first.updates, second.updates);
    assert.notEqual(first.waitingEntitlementIds, second.waitingEntitlementIds);
    assert.deepEqual(snapshotInput(input), before);
  });
}

const invalidChains: { name: string; entries: readonly ChainEntry[] }[] = [
  {
    name: "a first period linked to another predecessor",
    entries: [["A", "X", "2026-11-10T12:00:00+01:00"]],
  },
  {
    name: "a later period linked to a missing predecessor",
    entries: [
      ["A", "O", "2026-11-10T12:00:00+01:00"],
      ["B", "X", "2026-11-12T12:00:00+01:00"],
    ],
  },
  {
    name: "two periods linked directly to the same predecessor",
    entries: [
      ["A", "O", "2026-11-10T12:00:00+01:00"],
      ["B", "O", "2026-11-12T12:00:00+01:00"],
    ],
  },
  {
    name: "an ID repeated later in the chain",
    entries: [
      ["A", "O", "2026-11-10T12:00:00+01:00"],
      ["B", "A", "2026-11-12T12:00:00+01:00"],
      ["A", "B", "2026-11-14T12:00:00+01:00"],
    ],
  },
  {
    name: "a period using the original predecessor ID",
    entries: [["O", "O", "2026-11-10T12:00:00+01:00"]],
  },
  {
    name: "a valid chain supplied in the wrong order",
    entries: [
      ["B", "A", "2026-11-12T12:00:00+01:00"],
      ["A", "O", "2026-11-10T12:00:00+01:00"],
    ],
  },
];

for (const { name, entries } of invalidChains) {
  for (const predecessorEnd of [PREDECESSOR_END, null]) {
    test(`rejects ${name} with ${predecessorEnd === null ? "unknown" : "known"} predecessor expiry`, () => {
      const input = freezeInput(makeInput(predecessorEnd, entries));
      const before = snapshotInput(input);

      assert.throws(() => planPendingHubPeriodChain(input), {
        name: "Error",
        message: "hub_period_chain_invalid",
      });
      assert.deepEqual(snapshotInput(input), before);
    });
  }
}
