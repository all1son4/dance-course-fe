import assert from "node:assert/strict";
import test from "node:test";

import { buildHubExpiryReminderEmail } from "@/lib/email/hub-expiry-reminder";
import { warsawDaysBetween } from "@/lib/inspiration-hub/calendar";
import {
  type HubReminderPeriod,
  planHubExpiryReminders,
} from "@/lib/inspiration-hub/expiry-reminders";

// Plan, example 17: Olya's Hub ends on 5 January 2027 at 12:00 Warsaw time.
const END = new Date("2027-01-05T11:00:00.000Z");
const START = new Date("2026-11-10T11:00:00.000Z");
const at = (iso: string) => new Date(iso);

const period = (overrides: Partial<HubReminderPeriod> = {}): HubReminderPeriod => ({
  email: "Olya@Example.com",
  entitlementId: "e1",
  expiresAt: END,
  locale: "ru",
  paymentIntentId: "pi_1",
  purchaseId: "p1",
  startsAt: START,
  telegramUserId: "777",
  ...overrides,
});

const plan = (now: Date, periods = [period()], plusRights = []) =>
  planHubExpiryReminders({ now, periods, plusRights });

// Whole Warsaw calendar days to the end: 5 January seen on 29 December is 7.
test("Warsaw calendar days count dates, not hours", () => {
  assert.equal(warsawDaysBetween(at("2026-12-29T04:00:00.000Z"), END), 7);
  assert.equal(warsawDaysBetween(at("2027-01-02T04:00:00.000Z"), END), 3);
  assert.equal(warsawDaysBetween(at("2026-12-28T23:30:00.000Z"), END), 7);
});

test("example 17: letters on 29 December and 2 January", () => {
  assert.deepEqual(plan(at("2026-12-28T04:00:00.000Z")), []);

  const week = plan(at("2026-12-29T04:00:00.000Z"));
  assert.equal(week.length, 1);
  assert.equal(week[0]?.kind, 7);
  assert.equal(week[0]?.email, "olya@example.com");
  assert.equal(week[0]?.deduplicationKey, "hub_expiry_reminder:e1:7");

  assert.equal(plan(at("2026-12-31T04:00:00.000Z"))[0]?.kind, 7);
  assert.equal(plan(at("2027-01-02T04:00:00.000Z"))[0]?.kind, 3);
  assert.equal(plan(at("2027-01-05T04:00:00.000Z"))[0]?.kind, 3);
  assert.deepEqual(plan(at("2027-01-05T12:00:00.000Z")), []);
});

test("after a missed week only the current reminder is planned", () => {
  const late = plan(at("2027-01-03T04:00:00.000Z"));

  assert.deepEqual(
    late.map((reminder) => reminder.kind),
    [3],
  );
});

test("a renewal moves the end, so the old reminders are gone", () => {
  const renewed = [
    period(),
    period({
      entitlementId: "e2",
      expiresAt: at("2027-03-02T11:00:00.000Z"),
      paymentIntentId: "pi_2",
      purchaseId: "p2",
      startsAt: END,
    }),
  ];

  assert.deepEqual(plan(at("2027-01-02T04:00:00.000Z"), renewed), []);
  assert.equal(
    plan(at("2027-02-23T04:00:00.000Z"), renewed)[0]?.deduplicationKey,
    "hub_expiry_reminder:e2:7",
  );
});

test("a renewal waiting for its predecessor keeps the chain going", () => {
  const waiting = [
    period(),
    period({ entitlementId: "e2", expiresAt: null, startsAt: null }),
  ];

  assert.deepEqual(plan(at("2027-01-02T04:00:00.000Z"), waiting), []);
});

test("Plus that keeps the person in the Hub past the end stops the pitch", () => {
  const now = at("2027-01-02T04:00:00.000Z");

  assert.deepEqual(
    planHubExpiryReminders({
      now,
      periods: [period()],
      plusRights: [{ expiresAt: null, startsAt: null, telegramUserId: "777" }],
    }),
    [],
  );
  assert.equal(
    planHubExpiryReminders({
      now,
      periods: [period()],
      plusRights: [
        {
          expiresAt: at("2027-01-01T23:00:00.000Z"),
          startsAt: null,
          telegramUserId: "777",
        },
      ],
    }).length,
    1,
  );
});

test("no email, no reminder", () => {
  assert.deepEqual(plan(at("2027-01-02T04:00:00.000Z"), [period({ email: null })]), []);
});

test("the reminder email names the end date, the renewal link and its price", () => {
  const email = buildHubExpiryReminderEmail({
    endsAt: END,
    kind: 3,
    locale: "ru",
    myAccessUrl: "https://example.test/ru/access?k=x",
    onlineCohortStartsAt: null,
  });

  assert.equal(email.subject, "Inspiration Hub: осталось 3 дня");
  assert.match(email.text, /5 января 2027/u);
  assert.match(email.text, /payment\?renewal=inspiration-hub/u);
  assert.match(email.text, /155\sPLN \/ 35\s€ вместо 200\sPLN \/ 45\s€/u);
  assert.match(email.text, /^До конца Inspiration Hub — 3 дня/u);
  assert.match(email.text, /действует только до конца твоего Hub — 5 января 2027\./u);
  // One date in the whole email: the end of the Hub, which is also the price deadline.
  assert.equal(email.text.match(/2027/gu)?.length, 1);
  assert.match(email.text, /access\?k=x/u);
  assert.doesNotMatch(email.text, /онлайн-группы/u);

  const withOnline = buildHubExpiryReminderEmail({
    endsAt: END,
    kind: 7,
    locale: "en",
    onlineCohortStartsAt: at("2027-01-04T17:00:00.000Z"),
  });
  assert.equal(withOnline.subject, "Inspiration Hub: one week left");
  assert.match(withOnline.text, /Online Group cycle starts/u);
});

test("a Plus that starts after the Hub ends does not stop the reminder", () => {
  const now = at("2027-01-02T04:00:00.000Z");
  const laterPlus = {
    expiresAt: null,
    startsAt: at("2027-01-20T17:00:00.000Z"),
    telegramUserId: "777",
  };
  const runningPlus = {
    expiresAt: null,
    startsAt: at("2026-12-01T17:00:00.000Z"),
    telegramUserId: "777",
  };

  assert.equal(
    planHubExpiryReminders({ now, periods: [period()], plusRights: [laterPlus] }).length,
    1,
  );
  assert.equal(
    planHubExpiryReminders({ now, periods: [period()], plusRights: [runningPlus] })
      .length,
    0,
  );
});
