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
import {
  buildMyAccessNextStep,
  ONLINE_GROUP_PAGE_HREF,
  shouldOfferMyAccessHub,
} from "@/lib/my-access/next-step";

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

test("«Дальше» offers the Hub only to someone without one, while it is on sale", () => {
  assert.equal(shouldOfferMyAccessHub([], true), true);
  assert.equal(shouldOfferMyAccessHub([{ chip: "active", kind: "group" }], true), true);
  // An ended Hub is no Hub; a running, ending or upcoming one is.
  assert.equal(shouldOfferMyAccessHub([{ chip: "ended", kind: "hub" }], true), true);
  for (const chip of ["active", "endsSoon", "upcoming", "notJoined"] as const) {
    assert.equal(shouldOfferMyAccessHub([{ chip, kind: "hub" }], true), false, chip);
  }
  assert.equal(shouldOfferMyAccessHub([], false), false);
});
