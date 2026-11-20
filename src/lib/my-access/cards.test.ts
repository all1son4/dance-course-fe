import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMyAccessCards,
  HUB_PURCHASE_HREF,
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
    // The checkout grants the renewal price to members of a cohort ended ≤ 7 days ago.
    hubDiscountCohortIds: ["c3"],
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
  // Open now, and the note says until when: the planned end (8 weeks after the start).
  assert.deepEqual(giftCard?.note, {
    key: "plusHub.duringCohortUntil",
    values: { date: "2027-03-07T17:00:00.000Z" },
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

test("an unopened access whose emailed link expired offers a new one by email", () => {
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
  assert.equal(dead?.action?.key, "reissue");
  assert.equal(dead?.action?.purchaseId, "dead");
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
    hubDiscountCohortIds: ["c2"],
    purchases: [plus],
    rights: plusRights,
  });
  const renewed = cardsOf({
    cohorts: [closedCohort2],
    hubDiscountCohortIds: ["c2"],
    purchases: [plus, purchase({ id: "h" })],
    rights: [...plusRights, hubPeriod("h", null, null)],
  });

  assert.equal(alone[0]?.action?.key, "renewHub");
  const plusHub = renewed.find((card) => card.id === "plus-hub:p");
  assert.equal(plusHub?.action, undefined);
  assert.deepEqual(plusHub?.note, { key: "hub.renewed" });
});

test("a running cycle shows its calendar week, capped at the cycle length", () => {
  const cycleCards = (startsAt: string, closed = false) =>
    cardsOf({
      cohorts: [
        {
          accessEndsAt: closed ? new Date("2027-02-01T00:00:00.000Z") : null,
          closedAt: closed ? new Date("2026-12-29T00:00:00.000Z") : null,
          id: "c4",
          startsAt: new Date(startsAt),
          durationWeeks: 6,
        },
      ],
      purchases: [
        purchase({
          cohortId: "c4",
          id: "g",
          offerExternalId: STANDARD_OFFER,
          productExternalId: "prd_L9aK3mT7qP2x",
        }),
      ],
      rights: [right({ purchaseId: "g" })],
    }).find((card) => card.kind === "group");

  // NOW is 2026-12-30: the cycle started that day, 9 days and 9 weeks earlier.
  assert.deepEqual(cycleCards("2026-12-30T08:00:00.000Z")?.cycleWeek, {
    current: 1,
    total: 6,
  });
  assert.deepEqual(cycleCards("2026-12-21T08:00:00.000Z")?.cycleWeek, {
    current: 2,
    total: 6,
  });
  assert.deepEqual(cycleCards("2026-10-28T08:00:00.000Z")?.cycleWeek, {
    current: 6,
    total: 6,
  });
  // Not started yet, or closed: no week bar.
  assert.equal(cycleCards("2027-01-11T08:00:00.000Z")?.cycleWeek, undefined);
  assert.equal(cycleCards("2026-11-23T08:00:00.000Z", true)?.cycleWeek, undefined);
});

test("every button leads somewhere the checkout accepts right now", () => {
  const closedCohort = {
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
  const plusRights = (status = "activated") => [
    right({ purchaseId: "p", status }),
    right({ accessKey: "inspiration-hub", purchaseId: "p", sourceKind: "online_group" }),
  ];
  const plusCard = (
    snapshot: Partial<MyAccessSnapshot>,
    sales?: Parameters<typeof buildMyAccessCards>[2],
  ) =>
    buildMyAccessCards(
      { cohorts: [closedCohort], purchases: [plus], rights: plusRights(), ...snapshot },
      NOW,
      sales,
    ).find((card) => card.id === "plus-hub:p");

  // A closed Plus: the renewal only with the price open to her and the Hub on sale.
  assert.equal(plusCard({ hubDiscountCohortIds: ["c2"] })?.action?.key, "renewHub");
  const notMember = plusCard({
    hubDiscountCohortIds: ["c2"],
    rights: plusRights("token_issued"),
  });
  assert.equal(notMember?.action, undefined);
  assert.equal(notMember?.note, undefined);
  assert.equal(plusCard({})?.action, undefined);
  assert.equal(
    plusCard({ hubDiscountCohortIds: ["c2"] }, { hubPurchase: true, hubRenewal: false })
      ?.action,
    undefined,
  );

  // A running Hub is renewed only while the renewal is on sale.
  const running = (sales?: Parameters<typeof buildMyAccessCards>[2]) =>
    buildMyAccessCards(
      {
        cohorts: [],
        purchases: [purchase({ id: "h" })],
        rights: [hubPeriod("h", "2026-12-01T00:00:00.000Z", "2027-01-26T00:00:00.000Z")],
      },
      NOW,
      sales,
    )[0];
  assert.equal(running()?.action?.key, "renewHub");
  assert.equal(running({ hubPurchase: true, hubRenewal: false })?.action, undefined);

  // An ended Hub: the renewal price only for a member of record, else the full price.
  const ended = (
    snapshot: Partial<MyAccessSnapshot>,
    sales?: Parameters<typeof buildMyAccessCards>[2],
  ) =>
    buildMyAccessCards(
      {
        cohorts: [closedCohort],
        purchases: [purchase({ id: "h" })],
        rights: [hubPeriod("h", "2026-10-01T00:00:00.000Z", "2026-11-26T00:00:00.000Z")],
        ...snapshot,
      },
      NOW,
      sales,
    ).find((card) => card.status.key === "hub.ended");
  assert.equal(ended({})?.action?.href, HUB_PURCHASE_HREF);
  assert.equal(
    ended({
      hubDiscountCohortIds: ["c2"],
      purchases: [
        purchase({ id: "h" }),
        purchase({
          cohortId: "c2",
          id: "g",
          offerExternalId: STANDARD_OFFER,
          productExternalId: "x",
        }),
      ],
      rights: [
        hubPeriod("h", "2026-10-01T00:00:00.000Z", "2026-11-26T00:00:00.000Z"),
        right({ purchaseId: "g" }),
      ],
    })?.action?.href,
    HUB_RENEWAL_HREF,
  );
  assert.equal(ended({}, { hubPurchase: false, hubRenewal: false })?.action, undefined);
});

test("a new link by email only where the invite is issued by the bot", () => {
  const cards = cardsOf({
    purchases: [
      purchase({ id: "bot", offerExternalId: FIRST_TOUCH_OFFER, productExternalId: "y" }),
      purchase({ id: "hand", offerExternalId: CHOREO_OFFER, productExternalId: "z" }),
    ],
    rights: [
      right({ hasLiveInvite: false, purchaseId: "bot", status: "token_issued" }),
      right({
        accessWorkflow: "manual-admin",
        hasLiveInvite: false,
        purchaseId: "hand",
        status: "token_issued",
      }),
    ],
  });

  assert.equal(cards.find((card) => card.id === "channel:bot")?.action?.key, "reissue");
  assert.equal(cards.find((card) => card.id === "channel:hand")?.action?.key, "support");
});

test("one Hub at a time: a Hub that is renewed and still open hides the one ending sooner", () => {
  // The owner's case (2026-11-18): Plus of cycle 2.0 closed, its Hub ends on 23
  // November; Plus of cycle 3.0 is paid, so its library is open already.
  const now = new Date("2026-11-18T20:00:00.000Z");
  const cohort2 = {
    accessEndsAt: new Date("2026-11-16T23:00:00.000Z"),
    closedAt: new Date("2026-11-16T10:00:00.000Z"),
    durationWeeks: 8,
    id: "c2",
    startsAt: new Date("2026-09-14T16:00:00.000Z"),
  };
  const cohort3 = {
    accessEndsAt: null,
    closedAt: null,
    durationWeeks: 8,
    id: "c3",
    startsAt: new Date("2026-11-23T17:00:00.000Z"),
  };
  const plusRights = (purchaseId: string) => [
    right({ purchaseId }),
    right({ accessKey: "inspiration-hub", purchaseId, sourceKind: "online_group" }),
  ];
  const plus = (id: string, cohortId: string) =>
    purchase({ cohortId, id, offerExternalId: PLUS_OFFER, productExternalId: "x" });

  const cards = buildMyAccessCards(
    {
      cohorts: [cohort2, cohort3],
      purchases: [plus("p2", "c2"), plus("p3", "c3")],
      rights: [...plusRights("p2"), ...plusRights("p3")],
    },
    now,
  );
  const hubs = cards.filter((card) => card.title === "hub");
  assert.deepEqual(
    hubs.map((card) => card.id),
    ["plus-hub:p3"],
  );
  // The calendar no longer gets an «ends 23 November» for a Hub that does not end.
  assert.equal(
    cards.some((card) => card.calendar?.kind === "end"),
    false,
  );

  // A standalone Hub starting after the Plus Hub is not open yet: both stay, in order.
  const scheduled = buildMyAccessCards(
    {
      cohorts: [cohort2],
      purchases: [plus("p2", "c2"), purchase({ id: "h" })],
      rights: [
        ...plusRights("p2"),
        hubPeriod("h", "2026-11-24T00:00:00.000Z", "2027-01-19T00:00:00.000Z"),
      ],
    },
    now,
  );
  assert.deepEqual(
    scheduled.filter((card) => card.title === "hub").map((card) => card.status.key),
    ["plusHub.closed", "hub.scheduled"],
  );
});

const RENEWAL_OFFER = "off_online_group_anna_strok_renewal_discount";
const COHORT_AHEAD = {
  accessEndsAt: null,
  closedAt: null,
  durationWeeks: 8,
  id: "c-ahead",
  startsAt: new Date("2027-01-04T18:00:00.000Z"),
  title: "Online Group 3.0",
};

test("a renewal invitation before its Telegram check leads to its page, never «expired»", () => {
  const cards = cardsOf({
    cohorts: [COHORT_AHEAD],
    purchases: [
      purchase({
        cohortId: COHORT_AHEAD.id,
        id: "renewal",
        invitationKind: "renewal",
        offerExternalId: RENEWAL_OFFER,
        productExternalId: "prd_L9aK3mT7qP2x",
        telegramUserId: null,
      }),
    ],
    rights: [right({ hasLiveInvite: false, purchaseId: "renewal", status: "pending" })],
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.chip, "confirmTelegram");
  assert.deepEqual(cards[0]?.note, { key: "confirmTelegram" });
  assert.deepEqual(cards[0]?.action, {
    href: "",
    key: "confirmTelegram",
    purchaseId: "renewal",
  });
  assert.equal(cards[0]?.status.key, "group.startsOn");
});

test("a Hub renewal invitation waiting for its check still has its card", () => {
  const cards = cardsOf({
    purchases: [
      purchase({
        id: "hub-renewal",
        invitationKind: "renewal",
        succeededAt: null,
        telegramUserId: null,
      }),
    ],
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.title, "hub");
  assert.equal(cards[0]?.status.key, "hub.renewalWaiting");
  assert.equal(cards[0]?.action?.key, "confirmTelegram");
});

test("an invitation's link note names the invitation, not a payment", () => {
  const snapshot = (hasLiveInvite: boolean) => ({
    cohorts: [COHORT_AHEAD],
    purchases: [
      purchase({
        cohortId: COHORT_AHEAD.id,
        id: "join",
        invitationKind: "join" as const,
        offerExternalId: STANDARD_OFFER,
        productExternalId: "prd_L9aK3mT7qP2x",
        telegramUserId: null,
      }),
    ],
    rights: [right({ hasLiveInvite, purchaseId: "join", status: "token_issued" })],
  });

  assert.deepEqual(cardsOf(snapshot(true))[0]?.note, { key: "linkInInvitation" });
  const expired = cardsOf(snapshot(false))[0];
  assert.deepEqual(expired?.note, { key: "linkExpiredInvited" });
  assert.equal(expired?.action?.key, "reissue");

  // A confirmed renewal is an ordinary access waiting for its join.
  const confirmed = cardsOf({
    ...snapshot(false),
    purchases: [
      purchase({
        cohortId: COHORT_AHEAD.id,
        id: "join",
        invitationKind: "renewal",
        offerExternalId: RENEWAL_OFFER,
        productExternalId: "prd_L9aK3mT7qP2x",
        telegramUserId: "777",
      }),
    ],
  })[0];
  assert.equal(confirmed?.action?.key, "reissue");
  assert.equal(confirmed?.chip, "linkExpired");
});

test("an invited standalone Hub not joined says so without a payment email", () => {
  const cards = cardsOf({
    purchases: [purchase({ id: "hub-join", invitationKind: "join" })],
    rights: [
      {
        ...hubPeriod("hub-join", "2026-12-20T11:00:00.000Z", "2027-02-14T11:00:00.000Z"),
        hasLiveInvite: true,
        status: "token_issued",
      },
    ],
  });

  assert.deepEqual(cards[0]?.note, { key: "hub.notJoinedInvited" });
});
