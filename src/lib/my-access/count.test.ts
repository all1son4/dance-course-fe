import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCalendarFeed,
  buildMyAccessCalendarSubscription,
} from "@/lib/my-access/calendar";
import {
  buildMyAccessCards,
  type MyAccessPurchase,
  type MyAccessRight,
  type MyAccessSnapshot,
} from "@/lib/my-access/cards";
import {
  buildMyAccessCount,
  getMyAccessCardDetail,
  getMyAccessCardNote,
  warsawDaysBetween,
} from "@/lib/my-access/count";
import { getDaypart, getFirstName, resolveTimeZone } from "@/lib/my-access/greeting";
import { buildMyAccessJourney } from "@/lib/my-access/journey";
import { getMyAccessMemberCohortIds } from "@/lib/my-access/next-step";

const NOW = new Date("2026-11-18T14:00:00.000Z");
const STANDARD_OFFER = "off_R6vN2cH9sW4y";
const GROUP_PRODUCT = "prd_L9aK3mT7qP2x";
const FIRST_TOUCH_OFFER = "off_4BcM9pR6tH1x";
const FIRST_TOUCH_PRODUCT = "prd_7VnL4kX2mQ8s";

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

const upcoming = {
  accessEndsAt: null,
  closedAt: null,
  durationWeeks: 8,
  id: "c4",
  startsAt: new Date("2026-11-23T17:00:00.000Z"),
};

test("the greeting follows the reader's clock, Warsaw when it is unknown", () => {
  const at = (iso: string, zone: string) => getDaypart(new Date(iso), zone);

  assert.equal(at("2026-11-18T07:30:00.000Z", "Europe/Warsaw"), "morning");
  assert.equal(at("2026-11-18T12:00:00.000Z", "Europe/Warsaw"), "day");
  assert.equal(at("2026-11-18T18:00:00.000Z", "Europe/Warsaw"), "evening");
  assert.equal(at("2026-11-18T23:30:00.000Z", "Europe/Warsaw"), "night");
  // 18:00 UTC is still the afternoon in New York.
  assert.equal(at("2026-11-18T18:00:00.000Z", "America/New_York"), "day");
  assert.equal(resolveTimeZone("Not/AZone"), "Europe/Warsaw");
  assert.equal(resolveTimeZone(null), "Europe/Warsaw");
});

test("only a plain first name reaches the greeting", () => {
  assert.equal(getFirstName("Анна Строк"), "Анна");
  assert.equal(getFirstName("  OLGA ivanova "), "Olga");
  assert.equal(getFirstName("anna-maria"), "Anna-Maria");
  assert.equal(getFirstName("McKenzie"), "McKenzie");
  assert.equal(getFirstName("a.strok@gmail.com"), null);
  assert.equal(getFirstName("A"), null);
  assert.equal(getFirstName("12345"), null);
  assert.equal(getFirstName(null), null);
});

test("a start counts calendar days in Warsaw and shows a day, never an hour", () => {
  assert.equal(warsawDaysBetween(NOW, new Date("2026-11-23T17:00:00.000Z")), 5);
  // 23:30 in Warsaw on the 18th is still the same day as 15:00.
  assert.equal(warsawDaysBetween(NOW, new Date("2026-11-18T22:30:00.000Z")), 0);

  const [card] = buildMyAccessCards(
    snapshotOf({
      cohorts: [upcoming],
      purchases: [purchase({ cohortId: "c4", id: "p" })],
      rights: [right({ purchaseId: "p" })],
    }),
    NOW,
  );
  assert.deepEqual(buildMyAccessCount(card!, NOW), {
    at: "2026-11-23T17:00:00.000Z",
    days: 5,
    kind: "startsIn",
  });
  assert.equal(getMyAccessCardDetail(card!), null);
});

test("a running cycle counts its weeks; a running access counts the days left", () => {
  const running = { ...upcoming, startsAt: new Date("2026-11-08T17:00:00.000Z") };
  const [week] = buildMyAccessCards(
    snapshotOf({
      cohorts: [running],
      purchases: [purchase({ cohortId: "c4", id: "p" })],
      rights: [right({ purchaseId: "p" })],
    }),
    NOW,
  );
  assert.deepEqual(buildMyAccessCount(week!, NOW), {
    current: 2,
    kind: "week",
    total: 8,
  });

  const [left] = buildMyAccessCards(
    snapshotOf({
      purchases: [
        purchase({
          id: "f",
          offerExternalId: FIRST_TOUCH_OFFER,
          productExternalId: FIRST_TOUCH_PRODUCT,
        }),
      ],
      rights: [
        right({ expiresAt: new Date("2026-12-18T14:00:00.000Z"), purchaseId: "f" }),
      ],
    }),
    NOW,
  );
  const count = buildMyAccessCount(left!, NOW);
  assert.equal(count?.kind, "left");
  assert.equal(count?.kind === "left" && count.days, 30);
  // The days left are in the count, so the note does not repeat them.
  assert.equal(getMyAccessCardNote(left!), null);
});

test("a channel not entered counts its paid days; a lifetime access has no end", () => {
  const cards = buildMyAccessCards(
    snapshotOf({
      purchases: [
        purchase({
          id: "f",
          offerExternalId: FIRST_TOUCH_OFFER,
          productExternalId: FIRST_TOUCH_PRODUCT,
        }),
        purchase({
          id: "b",
          offerExternalId: "off_choreo_birthday_drop_standard",
          productExternalId: "prd_choreo_birthday_drop",
        }),
      ],
      rights: [
        right({ purchaseId: "f", status: "token_issued" }),
        right({ purchaseId: "b" }),
      ],
    }),
    NOW,
  );
  const counts = cards.map((card) => buildMyAccessCount(card, NOW)?.kind);
  assert.deepEqual(counts.sort(), ["lifetime", "paidDays"]);
});

test("the path shows the day of purchase, the latest one for a repeated product", () => {
  const snapshot = snapshotOf({
    purchases: [
      purchase({
        id: "f",
        offerExternalId: FIRST_TOUCH_OFFER,
        productExternalId: FIRST_TOUCH_PRODUCT,
        succeededAt: new Date("2026-03-01T10:00:00.000Z"),
      }),
      purchase({
        id: "f2",
        offerExternalId: FIRST_TOUCH_OFFER,
        productExternalId: FIRST_TOUCH_PRODUCT,
        succeededAt: new Date("2026-06-01T10:00:00.000Z"),
      }),
      purchase({ id: "g", succeededAt: new Date("2026-04-01T10:00:00.000Z") }),
      purchase({ id: "g2", succeededAt: new Date("2026-10-01T10:00:00.000Z") }),
    ],
  });

  assert.deepEqual(
    buildMyAccessJourney(snapshot, buildMyAccessCards(snapshot, NOW)).map(
      (step) => step.purchasedAt,
    ),
    ["2026-03-01T10:00:00.000Z", "2026-10-01T10:00:00.000Z"],
  );
});

test("«Продлить» is only for a member of record of a cycle still running", () => {
  const closed = {
    ...upcoming,
    accessEndsAt: new Date("2026-11-25T23:00:00.000Z"),
    closedAt: new Date("2026-11-15T10:00:00.000Z"),
    id: "c3",
    startsAt: new Date("2026-10-01T16:00:00.000Z"),
  };
  const over = {
    ...closed,
    accessEndsAt: new Date("2026-11-10T23:00:00.000Z"),
    id: "c2",
  };
  const snapshot = snapshotOf({
    cohorts: [closed, over],
    purchases: [
      purchase({ cohortId: "c3", id: "joined" }),
      purchase({ cohortId: "c3", id: "never" }),
      purchase({ cohortId: "c2", id: "past" }),
    ],
    rights: [
      right({ purchaseId: "joined" }),
      right({ purchaseId: "never", status: "token_issued" }),
      right({ purchaseId: "past" }),
    ],
  });

  assert.deepEqual(getMyAccessMemberCohortIds(snapshot, NOW), ["c3"]);
  assert.deepEqual(
    getMyAccessMemberCohortIds(
      { ...snapshot, purchases: snapshot.purchases.filter((p) => p.id !== "joined") },
      NOW,
    ),
    [],
  );
});

test("the calendar subscription lists every date and refreshes itself", () => {
  const feed = buildCalendarFeed(
    [
      {
        summary: "Старт",
        uid: "a",
        when: { allDay: true, day: new Date("2026-11-23T17:00:00Z") },
      },
      {
        summary: "Конец",
        uid: "b",
        when: { allDay: true, day: new Date("2026-12-17T12:00:00Z") },
      },
    ],
    NOW,
    "Anna Strok",
  );
  assert.equal(feed.match(/BEGIN:VEVENT/g)?.length, 2);
  assert.match(feed, /X-WR-CALNAME:Anna Strok\r\n/);
  assert.match(feed, /REFRESH-INTERVAL;VALUE=DURATION:PT6H\r\n/);
  assert.match(feed, /DTSTART;VALUE=DATE:20261123\r\n/);

  const links = buildMyAccessCalendarSubscription(
    "https://annastrok.com/",
    "/api/access/calendar/feed?c=x&locale=ru",
  );
  assert.equal(
    links.https,
    "https://annastrok.com/api/access/calendar/feed?c=x&locale=ru",
  );
  assert.equal(
    links.webcal,
    "webcal://annastrok.com/api/access/calendar/feed?c=x&locale=ru",
  );
  assert.ok(
    links.google.startsWith("https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2F"),
  );
});
