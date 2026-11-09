import assert from "node:assert/strict";
import test from "node:test";

import { planPendingHubPeriodChain } from "@/lib/inspiration-hub/period-chain";

import { createHubPeriodNodeSnapshot as makeNode } from "../../tests/helpers/hub-period-node-snapshot";
import { buildPendingHubPeriodChainInput } from "./hub-period-chain-input";
import {
  buildHubPeriodPredecessor,
  type HubPeriodPredecessorInput,
} from "./hub-period-predecessor";

const OWNER_ID = "123456789";
const OTHER_OWNER_ID = "987654321";
const PAID_AT = "2026-11-10T12:00:00+01:00";
const ONLINE_END = "2026-11-16T00:00:00+01:00";
const PAYMENT_END = "2027-01-05T12:00:00+01:00";
const CONTINUATION_END = "2027-01-11T00:00:00+01:00";
const INVALID = { name: "Error", message: "hub_period_predecessor_invalid" };

const makeOnline = (end: string | null = ONLINE_END): HubPeriodPredecessorInput => {
  const node = makeNode("online", "unused", "purchase-online");
  node.entitlement.sourceKind = "online_group";
  node.entitlement.accessKey = "primary";
  node.entitlement.periodStartMode = null;
  node.entitlement.paidDurationDays = null;
  node.entitlement.startsAfterEntitlementId = null;
  node.entitlement.startsAt = new Date("2026-10-01T12:00:00+02:00");
  node.entitlement.expiresAt = end === null ? null : new Date(end);
  node.entitlement.telegramChatId = "online-chat";
  node.entitlement.status = "activated";
  node.purchase.onlineGroupCohortId = "cohort";

  return {
    telegramUserId: OWNER_ID,
    node,
    cohort: {
      id: "cohort",
      mainChatId: "online-chat",
      accessEndsAt: end === null ? null : new Date(end),
    },
  };
};

const makeStandalone = (
  mode: "payment" | "after_entitlement" = "payment",
): HubPeriodPredecessorInput => {
  const node = makeNode("hub", "earlier-period", "purchase-hub");
  node.entitlement.periodStartMode = mode;
  node.entitlement.startsAfterEntitlementId =
    mode === "payment" ? null : "earlier-period";
  node.entitlement.startsAt = new Date(mode === "payment" ? PAID_AT : ONLINE_END);
  node.entitlement.expiresAt = new Date(
    mode === "payment" ? PAYMENT_END : CONTINUATION_END,
  );
  return { telegramUserId: OWNER_ID, node, cohort: null };
};

const makeWaitingStandalone = (): HubPeriodPredecessorInput => {
  const input = makeStandalone("after_entitlement");
  input.node.entitlement.startsAt = null;
  input.node.entitlement.expiresAt = null;
  return input;
};

const freezeInput = (input: HubPeriodPredecessorInput) => {
  Object.freeze(input.node.entitlement);
  Object.freeze(input.node.purchase);
  Object.freeze(input.node);
  if (input.cohort !== null) Object.freeze(input.cohort);
  return Object.freeze(input);
};

const assertValid = (input: HubPeriodPredecessorInput, expiresAt: Date | null) => {
  const before = JSON.stringify(input);
  freezeInput(input);
  const first = buildHubPeriodPredecessor(input);
  const second = buildHubPeriodPredecessor(input);

  assert.deepEqual(first, {
    entitlementId: input.node.entitlement.id,
    purchaseId: input.node.purchase.id,
    expiresAt,
  });
  assert.deepEqual(second, first);
  assert.notStrictEqual(second, first);
  // Object.freeze does not stop Date.setTime, so compare captured date values too.
  assert.equal(JSON.stringify(input), before);
};

const assertInvalid = (input: HubPeriodPredecessorInput) => {
  const before = JSON.stringify(input);
  freezeInput(input);
  assert.throws(() => buildHubPeriodPredecessor(input), INVALID);
  assert.equal(JSON.stringify(input), before);
};

test("an open Online cohort preserves the unknown predecessor end", () => {
  assertValid(makeOnline(null), null);
});

test("a closed Online cohort accepts equal timestamps in separate Date objects", () => {
  const input = makeOnline();
  assert.notStrictEqual(input.node.entitlement.expiresAt, input.cohort?.accessEndsAt);
  assertValid(input, new Date(ONLINE_END));
});

test("Online access without a recorded entry still keeps its known cohort end", () => {
  const input = makeOnline();
  input.node.entitlement.startsAt = null;
  assertValid(input, new Date(ONLINE_END));
});

test("an Online right may await Telegram delivery with no chat binding", () => {
  const input = makeOnline();
  input.node.entitlement.telegramChatId = null;
  assertValid(input, new Date(ONLINE_END));
});

test("an open Online right can have neither entry nor expiry recorded", () => {
  const input = makeOnline(null);
  input.node.entitlement.startsAt = null;
  assertValid(input, null);
});

test("an expired Online right remains a calendar predecessor without becoming active", () => {
  const input = makeOnline("2010-11-16T00:00:00+01:00");
  input.node.purchase.succeededAt = new Date("2010-10-01T12:00:00+02:00");
  input.node.entitlement.startsAt = new Date("2010-10-01T12:00:00+02:00");
  input.node.entitlement.status = "expired";
  assertValid(input, new Date("2010-11-16T00:00:00+01:00"));
});

test("the Online end comes from the cohort even when the right records no end", () => {
  const input = makeOnline();
  input.node.entitlement.expiresAt = null;
  assertValid(input, new Date(ONLINE_END));
});

test("a stale end projection on the Online right does not change the cohort end", () => {
  const input = makeOnline();
  input.node.entitlement.startsAt = new Date("2026-11-17T00:00:00+01:00");
  input.node.entitlement.expiresAt = new Date(new Date(ONLINE_END).getTime() + 1);
  assertValid(input, new Date(ONLINE_END));
});

test("an open cohort keeps the Online end unknown despite a recorded deadline", () => {
  const input = makeOnline();
  assert.ok(input.cohort);
  input.cohort.accessEndsAt = null;
  assertValid(input, null);
});

test("a free admin grant without a payment time anchors an Online continuation", () => {
  const input = makeOnline();
  input.node.purchase.succeededAt = null;
  assertValid(input, new Date(ONLINE_END));
});

test("a standalone payment period returns its existing 56-day end", () => {
  assertValid(makeStandalone(), new Date(PAYMENT_END));
});

test("an already resolved continuation preserves its start later than payment", () => {
  assertValid(makeStandalone("after_entitlement"), new Date(CONTINUATION_END));
});

test("a paid continuation waiting on its own predecessor returns a null end", () => {
  assertValid(makeWaitingStandalone(), null);
});

for (const status of ["expired", "left_channel"] as const) {
  test(`standalone delivery status ${status} does not cancel the paid calendar period`, () => {
    const input = makeStandalone();
    input.node.entitlement.status = status;
    input.node.entitlement.telegramUserId = OWNER_ID;
    assertValid(input, new Date(PAYMENT_END));
  });
}

test("an expired standalone purchase can anchor a later period", () => {
  const input = makeStandalone();
  input.node.purchase.succeededAt = new Date("2010-01-01T12:00:00+01:00");
  input.node.entitlement.startsAt = new Date("2010-01-01T12:00:00+01:00");
  input.node.entitlement.expiresAt = new Date("2010-02-26T12:00:00+01:00");
  input.node.entitlement.status = "expired";
  assertValid(input, new Date("2010-02-26T12:00:00+01:00"));
});

test("a future prepaid standalone period can anchor the next purchase", () => {
  const input = makeStandalone("after_entitlement");
  input.node.entitlement.startsAt = new Date("2027-11-16T00:00:00+01:00");
  input.node.entitlement.expiresAt = new Date("2028-01-11T00:00:00+01:00");
  assertValid(input, new Date("2028-01-11T00:00:00+01:00"));
});

const calendarPeriods = [
  {
    name: "autumn DST",
    start: "2026-10-01T12:00:00+02:00",
    end: "2026-11-26T12:00:00+01:00",
  },
  {
    name: "spring DST",
    start: "2027-02-15T12:00:00+01:00",
    end: "2027-04-12T12:00:00+02:00",
  },
  {
    name: "seconds and milliseconds",
    start: "2026-10-01T12:34:56.789+02:00",
    end: "2026-11-26T12:34:56.789+01:00",
  },
];

for (const period of calendarPeriods) {
  test(`a known standalone duration preserves ${period.name}`, () => {
    const input = makeStandalone();
    input.node.purchase.succeededAt = new Date(period.start);
    input.node.entitlement.startsAt = new Date(period.start);
    input.node.entitlement.expiresAt = new Date(period.end);
    assertValid(input, new Date(period.end));
  });
}

type InvalidCase = { name: string; change: (input: HubPeriodPredecessorInput) => void };

const commonInvalid: InvalidCase[] = [
  {
    name: "an inconsistent purchase link",
    change: (input) => {
      input.node.entitlement.purchaseId = "different-purchase";
    },
  },
  {
    name: "no successful payment timestamp",
    change: (input) => {
      input.node.purchase.succeededAt = null;
    },
  },
  {
    name: "an invalid successful payment timestamp",
    change: (input) => {
      input.node.purchase.succeededAt = new Date(Number.NaN);
    },
  },
  {
    name: "another purchase owner",
    change: (input) => {
      input.node.purchase.telegramUserId = OTHER_OWNER_ID;
    },
  },
  {
    name: "no verified purchase owner",
    change: (input) => {
      input.node.purchase.telegramUserId = null;
    },
  },
  {
    name: "a conflicting entitlement owner",
    change: (input) => {
      input.node.entitlement.telegramUserId = OTHER_OWNER_ID;
    },
  },
  {
    name: "revocation by timestamp alone",
    change: (input) => {
      input.node.entitlement.revokedAt = new Date(PAID_AT);
    },
  },
  {
    name: "revocation by status alone",
    change: (input) => {
      input.node.entitlement.status = "revoked";
    },
  },
  {
    name: "an invalid recorded start",
    change: (input) => {
      input.node.entitlement.startsAt = new Date(Number.NaN);
    },
  },
  {
    name: "an invalid recorded expiry",
    change: (input) => {
      input.node.entitlement.expiresAt = new Date(Number.NaN);
    },
  },
];

for (const outcome of ["processing", "requires_action", "failed", "canceled"] as const) {
  commonInvalid.push({
    name: `purchase outcome ${outcome}`,
    change: (input) => {
      input.node.purchase.outcome = outcome;
    },
  });
}

for (const scenario of commonInvalid) {
  test(`rejects ${scenario.name} without modifying the candidate`, () => {
    const input = makeStandalone();
    scenario.change(input);
    assertInvalid(input);
  });
}

for (const source of [null, "hub_bridge"] as const) {
  test(`source ${String(source)} cannot be used as a predecessor`, () => {
    const input = makeStandalone();
    input.node.entitlement.sourceKind = source;
    assertInvalid(input);
  });
}

test("a waiting period still requires a verified owner", () => {
  const input = makeWaitingStandalone();
  input.node.purchase.telegramUserId = null;
  assertInvalid(input);
});

test("a waiting period still rejects an explicit revocation", () => {
  const input = makeWaitingStandalone();
  input.node.entitlement.revokedAt = new Date(PAID_AT);
  assertInvalid(input);
});

test("legacy expiry revocation is not silently cleared by the validator", () => {
  const input = makeStandalone();
  input.node.entitlement.status = "revoked";
  input.node.entitlement.revokedAt = new Date(PAYMENT_END);
  input.node.entitlement.revokedReason = "expired";
  assertInvalid(input);
});

const onlineInvalid: InvalidCase[] = [
  {
    name: "a missing cohort",
    change: (input) => {
      input.cohort = null;
    },
  },
  {
    name: "a purchase without a cohort link",
    change: (input) => {
      input.node.purchase.onlineGroupCohortId = null;
    },
  },
  {
    name: "another cohort",
    change: (input) => {
      input.node.purchase.onlineGroupCohortId = "different-cohort";
    },
  },
  {
    name: "included Plus Hub instead of primary access",
    change: (input) => {
      input.node.entitlement.accessKey = "inspiration-hub";
    },
  },
  {
    name: "standalone start metadata",
    change: (input) => {
      input.node.entitlement.periodStartMode = "payment";
    },
  },
  {
    name: "standalone paid-day metadata",
    change: (input) => {
      input.node.entitlement.paidDurationDays = 56;
    },
  },
  {
    name: "a standalone predecessor link",
    change: (input) => {
      input.node.entitlement.startsAfterEntitlementId = "another-entitlement";
    },
  },
  {
    name: "a conflicting main chat",
    change: (input) => {
      input.node.entitlement.telegramChatId = "different-chat";
    },
  },
  {
    name: "an invalid cohort end",
    change: (input) => {
      assert.ok(input.cohort);
      input.cohort.accessEndsAt = new Date(Number.NaN);
    },
  },
];

for (const scenario of onlineInvalid) {
  test(`Online rejects ${scenario.name}`, () => {
    const input = makeOnline();
    scenario.change(input);
    assertInvalid(input);
  });
}

test("Online ownership is checked even when its cohort end is unknown", () => {
  const input = makeOnline(null);
  input.node.purchase.telegramUserId = OTHER_OWNER_ID;
  assertInvalid(input);
});

const standaloneInvalid: InvalidCase[] = [
  {
    name: "an unexpected cohort snapshot",
    change: (input) => {
      input.cohort = { id: "cohort", mainChatId: "chat", accessEndsAt: null };
    },
  },
  {
    name: "a purchase linked to Online",
    change: (input) => {
      input.node.purchase.onlineGroupCohortId = "cohort";
    },
  },
  {
    name: "a primary access key",
    change: (input) => {
      input.node.entitlement.accessKey = "primary";
    },
  },
  {
    name: "a bridge access key",
    change: (input) => {
      input.node.entitlement.accessKey = "inspiration-hub-bridge";
    },
  },
  {
    name: "missing paid days",
    change: (input) => {
      input.node.entitlement.paidDurationDays = null;
    },
  },
  {
    name: "55 paid days",
    change: (input) => {
      input.node.entitlement.paidDurationDays = 55;
    },
  },
  {
    name: "57 paid days",
    change: (input) => {
      input.node.entitlement.paidDurationDays = 57;
    },
  },
  {
    name: "legacy start mode",
    change: (input) => {
      input.node.entitlement.periodStartMode = null;
    },
  },
  {
    name: "a payment-mode dependency",
    change: (input) => {
      input.node.entitlement.startsAfterEntitlementId = "earlier-period";
    },
  },
  {
    name: "unknown dates in payment mode",
    change: (input) => {
      input.node.entitlement.startsAt = null;
      input.node.entitlement.expiresAt = null;
    },
  },
  {
    name: "only a payment start",
    change: (input) => {
      input.node.entitlement.expiresAt = null;
    },
  },
  {
    name: "only a payment end",
    change: (input) => {
      input.node.entitlement.startsAt = null;
    },
  },
  {
    name: "equal period boundaries",
    change: (input) => {
      input.node.entitlement.expiresAt = new Date(PAID_AT);
    },
  },
  {
    name: "an end before the start",
    change: (input) => {
      input.node.entitlement.expiresAt = new Date("2026-11-09T12:00:00+01:00");
    },
  },
  {
    name: "payment-mode start later than payment",
    change: (input) => {
      input.node.entitlement.startsAt = new Date("2026-11-11T12:00:00+01:00");
      input.node.entitlement.expiresAt = new Date("2027-01-06T12:00:00+01:00");
    },
  },
  {
    name: "a 55-calendar-day period",
    change: (input) => {
      input.node.entitlement.expiresAt = new Date("2027-01-04T12:00:00+01:00");
    },
  },
  {
    name: "a 57-calendar-day period",
    change: (input) => {
      input.node.entitlement.expiresAt = new Date("2027-01-06T12:00:00+01:00");
    },
  },
];

for (const scenario of standaloneInvalid) {
  test(`standalone Hub rejects ${scenario.name}`, () => {
    const input = makeStandalone();
    scenario.change(input);
    assertInvalid(input);
  });
}

const afterInvalid: InvalidCase[] = [
  {
    name: "a missing predecessor",
    change: (input) => {
      input.node.entitlement.startsAfterEntitlementId = null;
    },
  },
  {
    name: "a self-reference",
    change: (input) => {
      input.node.entitlement.startsAfterEntitlementId = input.node.entitlement.id;
    },
  },
  {
    name: "only a known start",
    change: (input) => {
      input.node.entitlement.expiresAt = null;
    },
  },
  {
    name: "only a known end",
    change: (input) => {
      input.node.entitlement.startsAt = null;
    },
  },
  {
    name: "a period starting before its payment",
    change: (input) => {
      input.node.entitlement.startsAt = new Date("2026-11-09T12:00:00+01:00");
      input.node.entitlement.expiresAt = new Date("2027-01-04T12:00:00+01:00");
    },
  },
];

for (const scenario of afterInvalid) {
  test(`after_entitlement rejects ${scenario.name}`, () => {
    const input = makeStandalone("after_entitlement");
    scenario.change(input);
    assertInvalid(input);
  });
}

test("a waiting continuation with a self-reference is rejected before returning null", () => {
  const input = makeWaitingStandalone();
  input.node.entitlement.startsAfterEntitlementId = input.node.entitlement.id;
  assertInvalid(input);
});

for (const period of calendarPeriods.slice(0, 2)) {
  test(`56 elapsed days are not accepted as 56 Warsaw calendar days across ${period.name}`, () => {
    const input = makeStandalone();
    input.node.purchase.succeededAt = new Date(period.start);
    input.node.entitlement.startsAt = new Date(period.start);
    input.node.entitlement.expiresAt = new Date(
      new Date(period.start).getTime() + 56 * 24 * 60 * 60 * 1000,
    );
    assertInvalid(input);
  });
}

test("a finite start whose calendar end overflows is rejected with the domain error", () => {
  const input = makeStandalone();
  const maxDateTimestamp = 8_640_000_000_000_000;
  input.node.purchase.succeededAt = new Date(maxDateTimestamp - 24 * 60 * 60 * 1000);
  input.node.entitlement.startsAt = new Date(maxDateTimestamp - 24 * 60 * 60 * 1000);
  input.node.entitlement.expiresAt = new Date(maxDateTimestamp);
  assertInvalid(input);
});

for (const knownEnd of [false, true]) {
  test(`Online predecessor composes with the pending adapter and planner with ${knownEnd ? "known" : "unknown"} expiry`, () => {
    const input = freezeInput(makeOnline(knownEnd ? ONLINE_END : null));
    const pending = makeNode("next", input.node.entitlement.id, "purchase-next");
    const predecessor = buildHubPeriodPredecessor(input);
    const plan = planPendingHubPeriodChain(
      buildPendingHubPeriodChainInput({
        telegramUserId: OWNER_ID,
        predecessor,
        nodes: [pending],
      }),
    );

    assert.deepEqual(
      plan,
      knownEnd
        ? {
            updates: [
              {
                entitlementId: "next",
                startsAt: new Date(ONLINE_END),
                expiresAt: new Date(CONTINUATION_END),
              },
            ],
            waitingEntitlementIds: [],
          }
        : { updates: [], waitingEntitlementIds: ["next"] },
    );
  });
}

test("a standalone predecessor composes into a late return without backdating", () => {
  const input = freezeInput(makeStandalone());
  const pending = makeNode("next", input.node.entitlement.id, "purchase-next");
  pending.purchase.succeededAt = new Date("2027-01-07T12:00:00+01:00");
  const predecessor = buildHubPeriodPredecessor(input);
  const plan = planPendingHubPeriodChain(
    buildPendingHubPeriodChainInput({
      telegramUserId: OWNER_ID,
      predecessor,
      nodes: [pending],
    }),
  );

  assert.deepEqual(plan, {
    updates: [
      {
        entitlementId: "next",
        startsAt: new Date("2027-01-07T12:00:00+01:00"),
        expiresAt: new Date("2027-03-04T12:00:00+01:00"),
      },
    ],
    waitingEntitlementIds: [],
  });
});

test("a waiting standalone predecessor keeps its following paid period waiting", () => {
  const input = freezeInput(makeWaitingStandalone());
  const pending = makeNode("next", input.node.entitlement.id, "purchase-next");
  const predecessor = buildHubPeriodPredecessor(input);
  assert.deepEqual(
    planPendingHubPeriodChain(
      buildPendingHubPeriodChainInput({
        telegramUserId: OWNER_ID,
        predecessor,
        nodes: [pending],
      }),
    ),
    {
      updates: [],
      waitingEntitlementIds: ["next"],
    },
  );
});
