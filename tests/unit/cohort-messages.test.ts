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

test("the closure post names the dates, every price, all three links and support", () => {
  const post = buildCohortClosurePost({
    accessEndsAt: ACCESS_ENDS_AT,
    links: LINKS,
    nextCohortStartsAt: NEXT_START,
  });

  assert.match(post, /^The cycle is over — thank you for these weeks together!/u);
  assert.match(post, /the chat itself stays until the new cycle starts/u);
  assert.match(post, /The new cycle starts on 1 February\./u);
  assert.match(
    post,
    /Online Group Plus[^\n]*220\sPLN \/ 50\s€ instead of 280\sPLN \/ 65\s€\.\nRenew: .*rnw_plus/u,
  );
  assert.match(
    post,
    /Online Group Standard[^\n]*175\sPLN \/ 40\s€ instead of 220\sPLN \/ 50\s€\.\nRenew: .*rnw_standard/u,
  );
  assert.match(post, /8 weeks for 155\sPLN \/ 35\s€ instead of 200\sPLN \/ 45\s€\./u);
  assert.match(
    post,
    /The price 155\sPLN \/ 35\s€ is valid until 24 January inclusive, then — 200\sPLN \/ 45\s€\./u,
  );
  assert.match(post, /the library is open until 24 January inclusive/u);
  assert.match(post, /Get it: .*renewal=inspiration-hub/u);
  assert.match(post, /@username/u);
  assert.match(post, /Questions — https:\/\/t\.me\/annastrok_dance$/u);
  assert.doesNotMatch(post, /[А-яЁё]/u);
});

test("an old-model cohort names the next start as the Plus library's last day", () => {
  const post = buildCohortClosurePost({
    accessEndsAt: ACCESS_ENDS_AT,
    links: LINKS,
    nextCohortStartsAt: NEXT_START,
    plusHubEndsOn: NEXT_START,
  });

  assert.match(post, /the library is open until 1 February inclusive/u);
  // The special price still follows the closure.
  assert.match(post, /is valid until 24 January inclusive/u);
});

test("a missing renewal link leaves its block out", () => {
  const post = buildCohortClosurePost({
    accessEndsAt: ACCESS_ENDS_AT,
    links: { ...LINKS, standard: null },
    nextCohortStartsAt: NEXT_START,
  });
  assert.doesNotMatch(post, /Online Group Standard/u);
  assert.doesNotMatch(post, /rnw_standard/u);
});

test("the reminder speaks to Plus members and offers Plus and the library only", () => {
  const reminder = buildCohortGraceReminder({
    accessEndsAt: ACCESS_ENDS_AT,
    links: LINKS,
    nextCohortStartsAt: NEXT_START,
  });

  assert.match(reminder, /^Tomorrow, 24 January, is the last day/u);
  assert.match(reminder, /starts on 1 February \(220\sPLN \/ 50\s€ instead of 280\sPLN/u);
  assert.match(reminder, /this price is valid until 24 January inclusive/u);
  assert.doesNotMatch(reminder, /Standard/u);
  assert.match(reminder, /Inspiration\sHUB only: /u);
  assert.doesNotMatch(reminder, /[А-яЁё]/u);
});
