import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCohortClosurePost,
  buildCohortGraceReminder,
  cohortPostButtons,
  getGraceReminderDay,
  getPlusHubLastDay,
  toWarsawDay,
} from "@/lib/online-group/cohort-messages";
import {
  parseTelegramPost,
  readPostButtons,
  renderTelegramPostHtml,
  toInlineKeyboard,
} from "@/lib/telegram/post-markup";

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

test("the closure post names the dates, every price and support, laid out for Telegram", () => {
  const post = buildCohortClosurePost({
    accessEndsAt: ACCESS_ENDS_AT,
    links: LINKS,
    nextCohortStartsAt: NEXT_START,
  });

  assert.match(post, /^\*The cycle is over — thank you for these weeks together!\* 🤍/u);
  assert.match(post, /the chat itself stays until the new cycle starts/u);
  assert.match(post, /The new cycle starts on \*1 February\*\./u);
  assert.match(
    post,
    /💎 \*Online Group Plus\*[^\n]*\n\*220\sPLN \/ 50\s€\* instead of ~280\sPLN \/ 65\s€~/u,
  );
  assert.match(
    post,
    /💃 \*Online Group Standard\*[^\n]*\n\*175\sPLN \/ 40\s€\* instead of ~220\sPLN \/ 50\s€~/u,
  );
  assert.match(post, /8 weeks for \*155\sPLN \/ 35\s€\* instead of ~200\sPLN \/ 45\s€~/u);
  assert.match(
    post,
    /> • The price \*155\sPLN \/ 35\s€\* is valid until \*24 January\* inclusive, then — 200\sPLN \/ 45\s€\./u,
  );
  assert.match(
    post,
    /> • If you had Plus, the library is open until \*24 January\* inclusive/u,
  );
  assert.match(post, /💬 Questions — @annastrok_dance$/u);
  // The links are buttons under the post now; the sign-up notes are gone.
  assert.doesNotMatch(post, /https?:\/\//u);
  assert.doesNotMatch(post, /How to sign up|limited/u);
  assert.doesNotMatch(post, /[А-яЁё]/u);
});

test("the closure post's buttons lead to the three payments, one per row", () => {
  assert.deepEqual(cohortPostButtons(LINKS, { standard: true }), [
    { text: "💎 Renew Plus", url: LINKS.plus },
    { text: "💃 Renew Standard", url: LINKS.standard },
    { text: "📚 Inspiration HUB only", url: LINKS.hub },
  ]);
  assert.deepEqual(
    cohortPostButtons({ ...LINKS, plus: null }, { standard: false }).map(
      (button) => button.url,
    ),
    [LINKS.hub],
  );
});

test("an old-model cohort names the next start as the Plus library's last day", () => {
  const post = buildCohortClosurePost({
    accessEndsAt: ACCESS_ENDS_AT,
    links: LINKS,
    nextCohortStartsAt: NEXT_START,
    plusHubEndsOn: NEXT_START,
  });

  assert.match(post, /the library is open until \*1 February\* inclusive/u);
  // The special price still follows the closure.
  assert.match(post, /is valid until \*24 January\* inclusive/u);
});

test("a missing renewal link leaves its block out", () => {
  const post = buildCohortClosurePost({
    accessEndsAt: ACCESS_ENDS_AT,
    links: { ...LINKS, standard: null },
    nextCohortStartsAt: NEXT_START,
  });
  assert.doesNotMatch(post, /Online Group Standard/u);
});

test("the reminder speaks to Plus members and offers Plus and the library only", () => {
  const reminder = buildCohortGraceReminder({
    accessEndsAt: ACCESS_ENDS_AT,
    nextCohortStartsAt: NEXT_START,
  });

  assert.match(reminder, /^⏳ Tomorrow, \*24 January\*, is the last day/u);
  assert.match(
    reminder,
    /starts on \*1 February\* \(\*220\sPLN \/ 50\s€\* instead of ~280\sPLN \/ 65\s€~\)/u,
  );
  assert.match(reminder, /this price is valid until \*24 January\* inclusive/u);
  assert.doesNotMatch(reminder, /Standard|https?:\/\//u);
  assert.doesNotMatch(reminder, /[А-яЁё]/u);
});

test("the post markup turns into Telegram HTML and escapes everything else", () => {
  assert.equal(
    renderTelegramPostHtml("*Bold* & ~old~ <x>\n> quoted *line*\n> second\n\nend"),
    "<b>Bold</b> &amp; <s>old</s> &lt;x&gt;\n<blockquote>quoted <b>line</b>\nsecond</blockquote>\n\nend",
  );
  // A lone star is text, not an unclosed tag.
  assert.equal(renderTelegramPostHtml("5* rating"), "5* rating");
  assert.deepEqual(
    parseTelegramPost("> a\nb").map((block) => block.quote),
    [true, false],
  );
});

test("queued buttons are read back only when well formed and on http(s)", () => {
  assert.deepEqual(
    readPostButtons([
      { text: "Ok", url: "https://annastrok.com/x" },
      { text: "Script", url: "javascript:alert(1)" },
      { text: 1, url: "https://annastrok.com/y" },
      null,
    ]),
    [{ text: "Ok", url: "https://annastrok.com/x" }],
  );
  assert.deepEqual(readPostButtons(undefined), []);
  assert.equal(toInlineKeyboard([]), undefined);
});
