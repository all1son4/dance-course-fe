import assert from "node:assert/strict";
import test from "node:test";

import { buildCalendarFile, lastAccessDay } from "@/lib/my-access/calendar";
import {
  buildMyAccessCards,
  type MyAccessPurchase,
  type MyAccessRight,
  type MyAccessSnapshot,
} from "@/lib/my-access/cards";
import { buildMyAccessJourney } from "@/lib/my-access/journey";
import { buildMyAccessNextStep, ONLINE_GROUP_PAGE_HREF } from "@/lib/my-access/next-step";

const NOW = new Date("2026-11-16T10:00:00.000Z");
const GROUP_PRODUCT = "prd_L9aK3mT7qP2x";
const STANDARD_OFFER = "off_R6vN2cH9sW4y";
const PLUS_OFFER = "off_online_group_anna_strok_library_access";
const RENEWAL_STANDARD = "off_online_group_anna_strok_renewal_discount";
const RENEWAL_PLUS = "off_online_group_anna_strok_renewal_library_access";
const FIRST_TOUCH_PRODUCT = "prd_7VnL4kX2mQ8s";
const FIRST_TOUCH_OFFER = "off_4BcM9pR6tH1x";

const purchase = (overrides: Partial<MyAccessPurchase> & { id: string }) => ({
  cohortId: null,
  offerExternalId: STANDARD_OFFER,
  productExternalId: GROUP_PRODUCT,
  succeededAt: new Date("2026-09-20T10:00:00.000Z"),
  telegramUserId: "777",
  ...overrides,
});

const right = (overrides: Partial<MyAccessRight> & { purchaseId: string }) => ({
  accessKey: "primary",
  expiresAt: null,
  revokedAt: null,
  sourceKind: null,
  startsAt: null,
  status: "activated",
  ...overrides,
});

const snapshotOf = (snapshot: Partial<MyAccessSnapshot>): MyAccessSnapshot => ({
  cohorts: [],
  purchases: [],
  rights: [],
  ...snapshot,
});

const closedCycle = {
  accessEndsAt: new Date("2026-11-16T23:00:00.000Z"),
  closedAt: new Date("2026-11-16T09:00:00.000Z"),
  id: "c2",
  startsAt: new Date("2026-10-05T16:00:00.000Z"),
  durationWeeks: 6,
};
const nextCycle = (
  renewalCampaigns: { offerExternalId: string; slug: string }[] = [],
) => ({
  durationWeeks: 8,
  id: "c3",
  renewalCampaigns: renewalCampaigns.map((campaign) => ({
    ...campaign,
    productExternalId: GROUP_PRODUCT,
  })),
  startsAt: new Date("2026-11-23T17:00:00.000Z"),
});

test("«Дальше» renews her own tariff, falls back to the other, else the group page", () => {
  const plusMember = snapshotOf({
    cohorts: [closedCycle],
    purchases: [purchase({ cohortId: "c2", id: "p", offerExternalId: PLUS_OFFER })],
  });
  const both = nextCycle([
    { offerExternalId: RENEWAL_STANDARD, slug: "rnw_s" },
    { offerExternalId: RENEWAL_PLUS, slug: "rnw_p" },
  ]);

  const plus = buildMyAccessNextStep(plusMember, both, NOW);
  assert.equal(plus?.kind, "renewal");
  assert.equal(
    plus?.href,
    `/payment?offer=${RENEWAL_PLUS}&product=${GROUP_PRODUCT}&renewal=rnw_p`,
  );
  assert.equal(plus?.started, false);
  assert.equal(plus?.startsAt, "2026-11-23T17:00:00.000Z");
  // The length shown is the cycle's own, from its row.
  assert.equal(plus?.durationWeeks, 8);

  const onlyStandard = nextCycle([{ offerExternalId: RENEWAL_STANDARD, slug: "rnw_s" }]);
  assert.match(
    buildMyAccessNextStep(plusMember, onlyStandard, NOW)?.href ?? "",
    /rnw_s$/,
  );

  const noCampaign = buildMyAccessNextStep(plusMember, nextCycle(), NOW);
  assert.deepEqual(
    [noCampaign?.kind, noCampaign?.href],
    ["join", ONLINE_GROUP_PAGE_HREF],
  );
});

test("«Дальше» invites a buyer of other courses to the group, never into a cycle she is in", () => {
  const firstTouchOnly = snapshotOf({
    purchases: [
      purchase({
        id: "ft",
        offerExternalId: FIRST_TOUCH_OFFER,
        productExternalId: FIRST_TOUCH_PRODUCT,
      }),
    ],
  });
  const campaigns = nextCycle([{ offerExternalId: RENEWAL_STANDARD, slug: "rnw_s" }]);
  // A renewal campaign is for members only: she sees the group page.
  assert.equal(buildMyAccessNextStep(firstTouchOnly, campaigns, NOW)?.kind, "join");

  const alreadyIn = snapshotOf({
    purchases: [purchase({ cohortId: "c3", id: "p3" })],
  });
  assert.equal(buildMyAccessNextStep(alreadyIn, campaigns, NOW), null);
  assert.equal(buildMyAccessNextStep(firstTouchOnly, null, NOW), null);

  const late = buildMyAccessNextStep(
    firstTouchOnly,
    campaigns,
    new Date("2026-11-24T10:00:00.000Z"),
  );
  assert.equal(late?.started, true);
});

test("«Твой путь» lists bought products in order, by what runs now", () => {
  const snapshot = snapshotOf({
    cohorts: [closedCycle],
    purchases: [
      purchase({
        id: "ft",
        offerExternalId: FIRST_TOUCH_OFFER,
        productExternalId: FIRST_TOUCH_PRODUCT,
        succeededAt: new Date("2026-03-10T10:00:00.000Z"),
      }),
      purchase({ cohortId: "c2", id: "g" }),
      purchase({
        id: "h",
        offerExternalId: "off_inspiration_hub_access",
        productExternalId: "prd_inspiration_hub",
        succeededAt: new Date("2026-11-10T10:00:00.000Z"),
      }),
      // A second purchase of the same product adds no step.
      purchase({ id: "g2", succeededAt: new Date("2026-11-12T10:00:00.000Z") }),
    ],
    rights: [
      right({ expiresAt: new Date("2026-07-10T10:00:00.000Z"), purchaseId: "ft" }),
      right({ purchaseId: "g" }),
      right({
        accessKey: "inspiration-hub",
        expiresAt: new Date("2027-01-19T23:00:00.000Z"),
        purchaseId: "h",
        sourceKind: "standalone_hub",
        startsAt: new Date("2026-11-23T23:00:00.000Z"),
      }),
    ],
  });
  const path = buildMyAccessJourney(snapshot, buildMyAccessCards(snapshot, NOW));

  assert.deepEqual(
    path.map((step) => step.productExternalId),
    [FIRST_TOUCH_PRODUCT, GROUP_PRODUCT, "prd_inspiration_hub"],
  );
  assert.equal(path[0]?.since, "2026-03-10T10:00:00.000Z");
  // The group is bought cycle after cycle: its step shows the latest purchase.
  assert.equal(path[1]?.purchasedAt, "2026-11-12T10:00:00.000Z");

  const single = snapshotOf({ purchases: [purchase({ id: "only" })] });
  assert.deepEqual(buildMyAccessJourney(single, []), []);
});

test("cards carry the date worth a calendar entry", () => {
  const snapshot = snapshotOf({
    cohorts: [
      closedCycle,
      { ...nextCycle(), accessEndsAt: null, closedAt: null, durationWeeks: 6 },
    ],
    purchases: [
      purchase({ cohortId: "c2", id: "old" }),
      purchase({ cohortId: "c3", id: "new" }),
    ],
    rights: [right({ purchaseId: "old" }), right({ purchaseId: "new" })],
  });
  const cards = buildMyAccessCards(snapshot, NOW);

  assert.deepEqual(cards.find((card) => card.id === "group:old")?.calendar, {
    at: "2026-11-16T23:00:00.000Z",
    kind: "end",
  });
  assert.deepEqual(cards.find((card) => card.id === "group:new")?.calendar, {
    at: "2026-11-23T17:00:00.000Z",
    kind: "start",
  });
});

test("the calendar file is valid iCalendar: Warsaw all-day dates, UTC times, escaping", () => {
  const allDay = buildCalendarFile(
    {
      summary: "Последний день доступа: Still Alive, Her Lies; Plus",
      uid: "end-group:old@annastrok.com",
      // Ends at midnight Warsaw on the 17th: the last day is the 16th.
      when: { allDay: true, day: lastAccessDay(new Date("2026-11-16T23:00:00.000Z")) },
    },
    NOW,
  );
  assert.match(allDay, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(
    allDay,
    /\r\nDTSTART;VALUE=DATE:20261116\r\nDTEND;VALUE=DATE:20261117\r\n/,
  );
  // Folding may split anywhere; a reader joins the lines back first.
  assert.match(
    allDay.replace(/\r\n /g, ""),
    /SUMMARY:Последний день доступа: Still Alive\\, Her Lies\\; Plus/,
  );
  assert.match(allDay, /DTSTAMP:20261116T100000Z/);
  assert.ok(allDay.endsWith("END:VCALENDAR\r\n"));

  // The last day of a month rolls over into the next month.
  const monthEnd = buildCalendarFile(
    {
      summary: "x",
      uid: "u",
      when: { allDay: true, day: new Date("2026-11-30T12:00:00Z") },
    },
    NOW,
  );
  assert.match(monthEnd, /DTSTART;VALUE=DATE:20261130\r\nDTEND;VALUE=DATE:20261201/);

  const timed = buildCalendarFile(
    {
      summary: "Старт",
      uid: "u",
      when: { allDay: false, start: new Date("2026-11-23T17:00:00Z") },
    },
    NOW,
  );
  assert.match(timed, /DTSTART:20261123T170000Z\r\nDTEND:20261123T180000Z/);

  // No line is longer than 75 octets, even in Cyrillic (2 octets a letter).
  const long = buildCalendarFile(
    {
      summary: "Очень длинное название ".repeat(8),
      uid: "u",
      when: { allDay: false, start: NOW },
    },
    NOW,
  );
  for (const line of long.split("\r\n")) {
    assert.ok(new TextEncoder().encode(line).length <= 75, line);
  }
  assert.match(long.replace(/\r\n /g, ""), /SUMMARY:(Очень длинное название ){8}/);
});

test("the path counts the group's cycles that are behind; the cards name each cycle", () => {
  const cohort = (id: string, startsAt: string, closedAt: string | null) => ({
    accessEndsAt: closedAt ? new Date(closedAt) : null,
    closedAt: closedAt ? new Date(closedAt) : null,
    durationWeeks: 8,
    id,
    startsAt: new Date(startsAt),
    title: `Online Group ${id}`,
  });
  const snapshot = snapshotOf({
    cohorts: [
      cohort("1.0", "2026-03-02T17:00:00.000Z", "2026-04-27T10:00:00.000Z"),
      cohort("2.0", "2026-08-10T16:00:00.000Z", "2026-11-16T10:00:00.000Z"),
      // Ahead: bought, not behind yet.
      cohort("3.0", "2026-11-23T17:00:00.000Z", null),
    ],
    purchases: [
      purchase({
        cohortId: "1.0",
        id: "g1",
        succeededAt: new Date("2026-02-20T10:00:00.000Z"),
      }),
      purchase({ cohortId: "2.0", id: "g2", offerExternalId: PLUS_OFFER }),
      purchase({
        cohortId: "3.0",
        id: "g3",
        offerExternalId: RENEWAL_PLUS,
        succeededAt: new Date("2026-11-15T10:00:00.000Z"),
      }),
      purchase({
        id: "ft",
        offerExternalId: FIRST_TOUCH_OFFER,
        productExternalId: FIRST_TOUCH_PRODUCT,
        succeededAt: new Date("2026-01-10T10:00:00.000Z"),
      }),
    ],
    rights: [
      right({ purchaseId: "g1" }),
      right({ purchaseId: "g2" }),
      right({ purchaseId: "g3", status: "issued" }),
      right({ expiresAt: new Date("2026-02-10T10:00:00.000Z"), purchaseId: "ft" }),
    ],
  });
  const cards = buildMyAccessCards(snapshot, NOW);
  const path = buildMyAccessJourney(snapshot, cards);

  assert.equal(
    path.find((step) => step.productExternalId === GROUP_PRODUCT)?.completedCohorts,
    2,
  );
  // The card of the cycle ahead goes by the cycle's name, the tariff kept.
  const upcoming = cards.find((card) => card.id === "group:g3");
  assert.deepEqual(upcoming?.title, {
    cohortName: "Online Group 3.0",
    offerExternalId: RENEWAL_PLUS,
    productExternalId: GROUP_PRODUCT,
  });

  // Without a cohort record the product names the card, as before.
  const noCohort = buildMyAccessCards({ ...snapshot, cohorts: [] }, NOW);
  assert.equal(
    noCohort.some((card) => card.title !== "hub" && Boolean(card.title.cohortName)),
    false,
  );
});

test("the path also counts closed cycles of the customer's Telegram account, once each", () => {
  const closed = {
    accessEndsAt: new Date("2026-11-16T23:00:00.000Z"),
    closedAt: new Date("2026-11-16T10:00:00.000Z"),
    durationWeeks: 8,
    id: "2.0",
    startsAt: new Date("2026-08-10T16:00:00.000Z"),
    title: "Online Group 2.0",
  };
  const snapshot = snapshotOf({
    // 2.0 came through an admin offer link: not among her purchases, only its id.
    closedCohortIdsOfTelegram: ["2.0"],
    cohorts: [closed],
    purchases: [
      purchase({
        cohortId: "3.0",
        id: "g3",
        succeededAt: new Date("2026-11-16T10:00:00Z"),
      }),
      purchase({
        id: "ft",
        offerExternalId: FIRST_TOUCH_OFFER,
        productExternalId: FIRST_TOUCH_PRODUCT,
        succeededAt: new Date("2026-05-04T10:00:00.000Z"),
      }),
    ],
  });
  const path = buildMyAccessJourney(snapshot, []);
  assert.equal(
    path.find((step) => step.productExternalId === GROUP_PRODUCT)?.completedCohorts,
    1,
  );

  // The same cycle among her own purchases and on the Telegram list counts once.
  const both = snapshotOf({
    ...snapshot,
    purchases: [...snapshot.purchases, purchase({ cohortId: "2.0", id: "g2" })],
  });
  assert.equal(
    buildMyAccessJourney(both, []).find(
      (step) => step.productExternalId === GROUP_PRODUCT,
    )?.completedCohorts,
    1,
  );
});

test("the first cycle, which has no cohort record, counts from its purchase date", () => {
  const firstCohortStartsAt = new Date("2026-08-10T16:00:00.000Z");
  const closed2 = {
    accessEndsAt: new Date("2026-11-16T23:00:00.000Z"),
    closedAt: new Date("2026-11-16T10:00:00.000Z"),
    durationWeeks: 8,
    id: "2.0",
    startsAt: firstCohortStartsAt,
    title: "Online Group 2.0",
  };
  const firstTouch = purchase({
    id: "ft",
    offerExternalId: FIRST_TOUCH_OFFER,
    productExternalId: FIRST_TOUCH_PRODUCT,
    succeededAt: new Date("2026-04-04T10:00:00.000Z"),
  });
  // Bought in May 2026 (the first cycle, no cohort) and again for 2.0.
  const both = snapshotOf({
    cohorts: [closed2],
    firstCohortStartsAt,
    purchases: [
      firstTouch,
      purchase({ id: "g1", succeededAt: new Date("2026-05-20T10:00:00.000Z") }),
      purchase({
        cohortId: "2.0",
        id: "g2",
        succeededAt: new Date("2026-08-04T10:00:00Z"),
      }),
    ],
  });
  const countOf = (snapshot: MyAccessSnapshot) =>
    buildMyAccessJourney(snapshot, []).find(
      (step) => step.productExternalId === GROUP_PRODUCT,
    )?.completedCohorts;
  assert.equal(countOf(both), 2);

  // Only the first cycle; and two purchases of it still count once.
  const onlyFirst = snapshotOf({
    firstCohortStartsAt,
    purchases: [
      firstTouch,
      purchase({ id: "g1", succeededAt: new Date("2026-05-20T10:00:00.000Z") }),
      purchase({ id: "g1b", succeededAt: new Date("2026-06-09T10:00:00.000Z") }),
    ],
  });
  assert.equal(countOf(onlyFirst), 1);

  // A purchase without a cohort after the first recorded cycle began is no first cycle.
  const late = snapshotOf({
    firstCohortStartsAt,
    purchases: [
      firstTouch,
      purchase({ id: "g9", succeededAt: new Date("2026-09-01T10:00Z") }),
    ],
  });
  assert.equal(countOf(late), undefined);
  // Without the date (no cohort recorded at all) nothing is guessed.
  assert.equal(countOf({ ...onlyFirst, firstCohortStartsAt: null }), undefined);
});
