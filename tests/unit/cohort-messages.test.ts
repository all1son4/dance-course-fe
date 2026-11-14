import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCohortClosurePost,
  buildCohortGraceReminder,
  getGraceReminderDay,
  getPlusHubLastDay,
  toWarsawDay,
} from "@/lib/online-group/cohort-messages";

// Cohort #3 closed on 17 January: access ends at 18 January 00:00 Warsaw.
const ACCESS_ENDS_AT = new Date("2027-01-17T23:00:00.000Z");
const NEXT_START = new Date("2027-02-01T17:00:00.000Z");
const LINKS = {
  hub: "https://annastrok.com/payment?renewal=inspiration-hub",
  plus: "https://annastrok.com/payment?renewal=rnw_plus",
  standard: "https://annastrok.com/payment?renewal=rnw_standard",
};

test("the Plus Hub stays open 7 Warsaw days and the reminder comes the day before", () => {
  assert.equal(toWarsawDay(getPlusHubLastDay(ACCESS_ENDS_AT)), "2027-01-24");
  assert.equal(getGraceReminderDay(ACCESS_ENDS_AT), "2027-01-23");
});

test("the closure post names the dates, both prices, all three links and support", () => {
  const post = buildCohortClosurePost({
    accessEndsAt: ACCESS_ENDS_AT,
    links: LINKS,
    nextCohortStartsAt: NEXT_START,
  });

  assert.match(post, /^Поток завершён — спасибо, что была с нами!/u);
  assert.match(post, /Новый поток стартует 1 февраля\./u);
  assert.match(post, /Hub открыт до 24 января включительно/u);
  assert.match(post, /8 недель за 35 EUR \/ 155 PLN\./u);
  assert.match(post, /до 24 января включительно, потом — 40 EUR \/ 175 PLN\./u);
  assert.match(post, /Онлайн-группа Plus[^\n]*\nПродлить: .*rnw_plus/u);
  assert.match(post, /Онлайн-группа Standard[^\n]*\nПродлить: .*rnw_standard/u);
  assert.match(post, /Оформить: .*renewal=inspiration-hub/u);
  assert.match(post, /@username/u);
  assert.match(post, /Вопросы — https:\/\/t\.me\/annastroksupport$/u);
});

test("an old-model cohort names the next start as the Plus Hub's last day", () => {
  const post = buildCohortClosurePost({
    accessEndsAt: ACCESS_ENDS_AT,
    links: LINKS,
    nextCohortStartsAt: NEXT_START,
    plusHubEndsOn: NEXT_START,
  });

  assert.match(post, /Hub открыт до 1 февраля включительно/u);
  // The special price still follows the closure.
  assert.match(post, /действует до 24 января включительно/u);
});

test("a missing renewal link leaves its block out", () => {
  const post = buildCohortClosurePost({
    accessEndsAt: ACCESS_ENDS_AT,
    links: { ...LINKS, standard: null },
    nextCohortStartsAt: NEXT_START,
  });
  assert.doesNotMatch(post, /Онлайн-группа Standard/u);
  assert.doesNotMatch(post, /rnw_standard/u);
});

test("the reminder speaks to Plus members and offers Plus and the Hub only", () => {
  const reminder = buildCohortGraceReminder({
    accessEndsAt: ACCESS_ENDS_AT,
    links: LINKS,
    nextCohortStartsAt: NEXT_START,
  });

  assert.match(reminder, /^Завтра, 24 января, — последний день/u);
  assert.match(reminder, /стартует 1 февраля/u);
  assert.doesNotMatch(reminder, /Standard/u);
  assert.match(reminder, /Только Hub: /u);
});
