import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMyAccessCards,
  HUB_RENEWAL_HREF,
  type MyAccessPurchase,
  type MyAccessRight,
  type MyAccessSnapshot,
} from "@/lib/my-access/cards";

const NOW = new Date("2026-12-30T10:00:00.000Z");
const HUB_OFFER = "off_inspiration_hub_access";
const PLUS_OFFER = "off_online_group_anna_strok_library_access";
const STANDARD_OFFER = "off_R6vN2cH9sW4y";
const CHOREO_OFFER = "off_choreo_bundle_duo_without_mentor";
const FIRST_TOUCH_OFFER = "off_4BcM9pR6tH1x";
const BIRTHDAY_OFFER = "off_choreo_birthday_drop_standard";

const purchase = (
  overrides: Partial<MyAccessPurchase> & { id: string },
): MyAccessPurchase => ({
  cohortId: null,
  offerExternalId: HUB_OFFER,
  productExternalId: "prd_inspiration_hub",
  succeededAt: new Date("2026-11-20T10:00:00.000Z"),
  telegramUserId: "777",
  ...overrides,
});

const right = (
  overrides: Partial<MyAccessRight> & { purchaseId: string },
): MyAccessRight => ({
  accessKey: "primary",
  expiresAt: null,
  revokedAt: null,
  sourceKind: null,
  startsAt: null,
  status: "activated",
  ...overrides,
});

const hubPeriod = (
  purchaseId: string,
  startsAt: string | null,
  expiresAt: string | null,
) =>
  right({
    accessKey: "inspiration-hub",
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    purchaseId,
    sourceKind: "standalone_hub",
    startsAt: startsAt ? new Date(startsAt) : null,
  });

const cardsOf = (snapshot: Partial<MyAccessSnapshot>) =>
  buildMyAccessCards({ cohorts: [], purchases: [], rights: [], ...snapshot }, NOW);

test("a Hub ending within 7 days offers the renewal and comes first", () => {
  const cards = cardsOf({
    purchases: [
      purchase({ id: "hub" }),
      purchase({ id: "bday", offerExternalId: BIRTHDAY_OFFER, productExternalId: "x" }),
    ],
    rights: [
      hubPeriod("hub", "2026-11-10T11:00:00.000Z", "2027-01-05T11:00:00.000Z"),
      right({ purchaseId: "bday" }),
    ],
  });

  assert.equal(cards[0]?.title, "hub");
  assert.deepEqual(cards[0]?.action, { href: HUB_RENEWAL_HREF, key: "renewHub" });
  assert.equal(cards[0]?.urgency, 0);
  assert.deepEqual(cards[0]?.note, { key: "daysLeft", values: { count: 7 } });
  assert.equal(cards[1]?.status.key, "lifetime");
});

test("a running Hub can be renewed any time; only the last week is urgent", () => {
  const cards = cardsOf({
    purchases: [purchase({ id: "hub" })],
    rights: [hubPeriod("hub", "2026-12-20T11:00:00.000Z", "2027-02-14T11:00:00.000Z")],
  });

  assert.deepEqual(cards[0]?.action, { href: HUB_RENEWAL_HREF, key: "renewHub" });
  assert.equal(cards[0]?.urgency, 1);
  assert.equal(cards[0]?.chip, "active");
});

test("a renewed Hub shows the paid end and no urgent renewal", () => {
  const cards = cardsOf({
    purchases: [purchase({ id: "a" }), purchase({ id: "b" })],
    rights: [
      hubPeriod("a", "2026-11-10T11:00:00.000Z", "2027-01-05T11:00:00.000Z"),
      hubPeriod("b", "2027-01-05T11:00:00.000Z", "2027-03-02T11:00:00.000Z"),
    ],
  });

  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0]?.status, {
    key: "hub.activeUntil",
    values: { date: "2027-03-02T11:00:00.000Z" },
  });
  assert.deepEqual(cards[0]?.note, { key: "hub.renewed" });
  assert.equal(cards[0]?.action, undefined);
});

test("a Hub paid ahead of the cycle end waits without a date", () => {
  const cards = cardsOf({
    purchases: [purchase({ id: "a" })],
    rights: [hubPeriod("a", null, null)],
  });

  assert.equal(cards[0]?.status.key, "hub.afterCohort");
  assert.equal(cards[0]?.urgency, 2);
});

test("an ended Hub offers a new purchase; a revoked one is not shown", () => {
  const ended = cardsOf({
    purchases: [purchase({ id: "a" })],
    rights: [hubPeriod("a", "2026-10-01T10:00:00.000Z", "2026-11-26T11:00:00.000Z")],
  });
  const revoked = cardsOf({
    purchases: [purchase({ id: "a" })],
    rights: [
      {
        ...hubPeriod("a", "2026-12-01T10:00:00.000Z", "2027-01-26T11:00:00.000Z"),
        status: "revoked",
      },
    ],
  });

  assert.equal(ended[0]?.status.key, "hub.ended");
  assert.equal(ended[0]?.action?.key, "buyHub");
  assert.equal(revoked.length, 0);
});

test("Plus: the library is open from payment (a gift before the start), then a week after the end", () => {
  const cohort = {
    accessEndsAt: null,
    closedAt: null,
    durationWeeks: 8,
    id: "c3",
    startsAt: new Date("2027-01-10T17:00:00.000Z"),
  };
  const before = cardsOf({
    cohorts: [cohort],
    purchases: [
      purchase({
        cohortId: "c3",
        id: "p",
        offerExternalId: PLUS_OFFER,
        productExternalId: "x",
      }),
    ],
    rights: [
      right({ purchaseId: "p" }),
      right({
        accessKey: "inspiration-hub",
        purchaseId: "p",
        sourceKind: "online_group",
      }),
    ],
  });
  const closed = cardsOf({
    cohorts: [
      {
        ...cohort,
        accessEndsAt: new Date("2026-12-28T23:00:00.000Z"),
        closedAt: new Date("2026-12-28T10:00:00.000Z"),
        startsAt: new Date("2026-10-05T16:00:00.000Z"),
      },
    ],
    purchases: [
      purchase({
        cohortId: "c3",
        id: "p",
        offerExternalId: PLUS_OFFER,
        productExternalId: "x",
      }),
    ],
    rights: [
      right({ purchaseId: "p" }),
      right({
        accessKey: "inspiration-hub",
        purchaseId: "p",
        sourceKind: "online_group",
      }),
    ],
  });

  // The library is usable now, so it comes before the group that starts later.
  assert.deepEqual(
    before.map((card) => card.status.key),
    ["plusHub.included", "group.startsOn"],
  );
  const giftCard = before.find((card) => card.title === "hub");
  assert.deepEqual(giftCard?.note, {
    key: "plusHub.openBeforeStart",
    values: { date: "2027-01-10T17:00:00.000Z" },
  });
  assert.equal(giftCard?.chip, "active");

  // Running: the planned end is the start plus the cohort length (8 weeks).
  const running = cardsOf({
    cohorts: [{ ...cohort, startsAt: new Date("2026-12-01T17:00:00.000Z") }],
    purchases: [
      purchase({
        cohortId: "c3",
        id: "p",
        offerExternalId: PLUS_OFFER,
        productExternalId: "x",
      }),
    ],
    rights: [
      right({ purchaseId: "p" }),
      right({
        accessKey: "inspiration-hub",
        purchaseId: "p",
        sourceKind: "online_group",
      }),
    ],
  });
  assert.deepEqual(running.find((card) => card.title === "hub")?.note, {
    key: "plusHub.duringCohortUntil",
    values: { date: "2027-01-26T17:00:00.000Z" },
  });
  // The cycle closed on 28 December: Standard/Plus ended at midnight, the Plus Hub stays a week.
  assert.deepEqual(
    closed.map((card) => card.status.key),
    ["plusHub.closed"],
  );
  assert.equal(closed[0]?.action?.key, "renewHub");
});

test("Standard has no Hub card; a cycle without a record shows only with a recorded end", () => {
  const cards = cardsOf({
    purchases: [
      purchase({
        cohortId: null,
        id: "old",
        offerExternalId: STANDARD_OFFER,
        productExternalId: "x",
      }),
    ],
    rights: [right({ purchaseId: "old" })],
  });

  assert.equal(cards.length, 0);
});

test("reviews and First Touch: dated after joining, waiting before", () => {
  const cards = cardsOf({
    purchases: [
      purchase({ id: "c", offerExternalId: CHOREO_OFFER, productExternalId: "x" }),
      purchase({ id: "f", offerExternalId: FIRST_TOUCH_OFFER, productExternalId: "y" }),
      purchase({ id: "old", offerExternalId: CHOREO_OFFER, productExternalId: "x" }),
    ],
    rights: [
      right({ expiresAt: new Date("2027-02-14T10:00:00.000Z"), purchaseId: "c" }),
      right({ purchaseId: "f", status: "token_issued" }),
      right({ expiresAt: new Date("2026-12-01T10:00:00.000Z"), purchaseId: "old" }),
    ],
  });

  assert.deepEqual(
    cards.map((card) => card.status),
    [
      { key: "channel.startsOnJoin", values: { count: 120 } },
      { key: "channel.until", values: { date: "2027-02-14T10:00:00.000Z" } },
    ],
  );
});

test("Hub periods of two Telegram identities stay apart", () => {
  const cards = cardsOf({
    purchases: [
      purchase({ id: "a", telegramUserId: "1" }),
      purchase({ id: "b", telegramUserId: "2" }),
    ],
    rights: [
      hubPeriod("a", "2026-12-01T10:00:00.000Z", "2027-01-26T11:00:00.000Z"),
      hubPeriod("b", "2026-12-20T10:00:00.000Z", "2027-02-14T11:00:00.000Z"),
    ],
  });

  assert.equal(cards.filter((card) => card.title === "hub").length, 2);
});

test("Plus of cycle #2 keeps its recorded Hub end, even after the cycle closes", () => {
  const cohort2 = {
    accessEndsAt: new Date("2026-12-28T23:00:00.000Z"),
    closedAt: new Date("2026-12-28T10:00:00.000Z"),
    durationWeeks: 6,
    id: "c2",
    startsAt: new Date("2026-08-10T06:00:00.000Z"),
  };
  const legacyRight = right({
    accessKey: "inspiration-hub",
    expiresAt: new Date("2027-01-02T17:00:00.000Z"),
    purchaseId: "p",
    sourceKind: null,
  });
  const plus = purchase({
    cohortId: "c2",
    id: "p",
    offerExternalId: PLUS_OFFER,
    productExternalId: "x",
  });

  const open = cardsOf({
    cohorts: [{ ...cohort2, accessEndsAt: null, closedAt: null }],
    purchases: [plus],
    rights: [right({ purchaseId: "p" }), legacyRight],
  });
  const closed = cardsOf({
    cohorts: [cohort2],
    purchases: [plus],
    rights: [right({ purchaseId: "p" }), legacyRight],
  });

  assert.deepEqual(open.find((card) => card.title === "hub")?.status, {
    key: "plusHub.until",
    values: { date: "2027-01-02T17:00:00.000Z" },
  });
  assert.deepEqual(closed[0]?.status, {
    key: "plusHub.closed",
    values: { date: "2027-01-02T17:00:00.000Z" },
  });
});

test("each card says its state in a badge and its icon family", () => {
  const cards = cardsOf({
    purchases: [
      purchase({ id: "hub" }),
      purchase({ id: "f", offerExternalId: FIRST_TOUCH_OFFER, productExternalId: "y" }),
      purchase({ id: "c", offerExternalId: CHOREO_OFFER, productExternalId: "x" }),
      purchase({ id: "bday", offerExternalId: BIRTHDAY_OFFER, productExternalId: "z" }),
    ],
    rights: [
      hubPeriod("hub", "2026-11-10T11:00:00.000Z", "2027-01-05T11:00:00.000Z"),
      right({ purchaseId: "f", status: "token_issued" }),
      right({ expiresAt: new Date("2027-02-14T10:00:00.000Z"), purchaseId: "c" }),
      right({ purchaseId: "bday" }),
    ],
  });
  const byKind = Object.fromEntries(cards.map((card) => [card.id.split(":")[0], card]));

  assert.equal(byKind.hub?.chip, "endsSoon");
  assert.equal(byKind.hub?.kind, "hub");
  assert.deepEqual(byKind.hub?.period, {
    end: "2027-01-05T11:00:00.000Z",
    start: "2026-11-10T11:00:00.000Z",
  });
  assert.deepEqual(
    cards.filter((card) => card.kind === "channel").map((card) => card.chip),
    ["notJoined", "active"],
  );
  assert.equal(byKind.lifetime?.chip, "active");
});

test("the same purchase left unopened several times reads as one card", () => {
  const cards = cardsOf({
    purchases: [1, 2, 3].map((n) =>
      purchase({
        id: `f${n}`,
        offerExternalId: FIRST_TOUCH_OFFER,
        productExternalId: "y",
      }),
    ),
    rights: [1, 2, 3].map((n) => right({ purchaseId: `f${n}`, status: "token_issued" })),
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.count, 3);
});

test("an unopened access whose emailed link expired sends the buyer to support", () => {
  const cards = cardsOf({
    purchases: [
      purchase({ id: "live", offerExternalId: CHOREO_OFFER, productExternalId: "x" }),
      purchase({
        id: "dead",
        offerExternalId: FIRST_TOUCH_OFFER,
        productExternalId: "y",
      }),
    ],
    rights: [
      right({ hasLiveInvite: true, purchaseId: "live", status: "token_issued" }),
      right({ hasLiveInvite: false, purchaseId: "dead", status: "token_issued" }),
    ],
  });
  const live = cards.find((card) => card.id === "channel:live");
  const dead = cards.find((card) => card.id === "channel:dead");

  assert.deepEqual(live?.note, { key: "linkInEmail" });
  assert.equal(live?.chip, "notJoined");
  assert.deepEqual(dead?.note, { key: "linkExpired" });
  assert.equal(dead?.chip, "linkExpired");
  assert.equal(dead?.action?.key, "support");
});

test("§11: a closed Plus does not push a renewal on someone who already renewed", () => {
  const closedCohort2 = {
    accessEndsAt: new Date("2026-12-28T23:00:00.000Z"),
    closedAt: new Date("2026-12-28T10:00:00.000Z"),
    durationWeeks: 6,
    id: "c2",
    startsAt: new Date("2026-10-05T16:00:00.000Z"),
  };
  const plus = purchase({
    cohortId: "c2",
    id: "p",
    offerExternalId: PLUS_OFFER,
    productExternalId: "x",
  });
  const plusRights = [
    right({ purchaseId: "p" }),
    right({ accessKey: "inspiration-hub", purchaseId: "p", sourceKind: "online_group" }),
  ];

  const alone = cardsOf({
    cohorts: [closedCohort2],
    purchases: [plus],
    rights: plusRights,
  });
  const renewed = cardsOf({
    cohorts: [closedCohort2],
    purchases: [plus, purchase({ id: "h" })],
    rights: [...plusRights, hubPeriod("h", null, null)],
  });

  assert.equal(alone[0]?.action?.key, "renewHub");
  const plusHub = renewed.find((card) => card.id === "plus-hub:p");
  assert.equal(plusHub?.action, undefined);
  assert.deepEqual(plusHub?.note, { key: "hub.renewed" });
});
