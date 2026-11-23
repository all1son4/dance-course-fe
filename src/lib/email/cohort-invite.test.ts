import assert from "node:assert/strict";
import test from "node:test";

import { buildCohortInviteEmail, getCohortShortTitle } from "./cohort-invite";

const cohort = {
  durationWeeks: 8,
  startsAt: new Date("2026-11-23T17:00:00.000Z"),
  title: "Online Group 3.0",
};
const links = {
  hub: "https://example.com/en/online/inspiration-hub?x=1&y=2",
  plus: "https://example.com/en/online/group?c=plus",
  standard: "https://example.com/en/online/group?c=standard",
};

test("the English email is Anna's text with the cohort's title, date and weeks", () => {
  const email = buildCohortInviteEmail({
    cohort,
    links,
    locale: "en",
    myAccessUrl: "https://example.com/en/access?t=abc",
    unsubscribeUrl: "https://example.com/api/email/unsubscribe?t=lead.sig&lang=en",
  });

  assert.equal(email.subject, "Online Group 3.0 - join the new round 🤍");
  for (const line of [
    "Hi!",
    "You've already danced with me online, and I'd love to see you in class again 🤍",
    "Registration for Online Group 3.0 is open — we start on 23 November!",
    "This time, we'll spend 8 weeks together, including a two-week winter break.",
    "Choose your option:",
    "✨ Online 3.0 — New lessons from the third round, homework, my feedback, and a group chat.",
    "✨ Online 3.0 + Inspiration Hub — Everything included in the new round, plus access to the Inspiration Hub: 10 lessons from the first and second rounds and extra materials for inspiration.",
    "✨ Inspiration Hub only — Access to lessons from previous rounds and extra materials, without joining Online Group 3.0 or accessing the current round's lessons. If you'd like to practise independently or revisit previous lessons, this option is for you.",
    "See you in class!\nAnna 🤍",
  ]) {
    assert.ok(email.text.includes(line), line);
  }
  assert.ok(email.text.includes("https://example.com/en/access?t=abc"));
  assert.ok(
    email.text.includes(
      "Unsubscribe from these emails: https://example.com/api/email/unsubscribe",
    ),
  );
  // Links are escaped in HTML; three option buttons.
  assert.ok(email.html.includes("inspiration-hub?x=1&amp;y=2"));
  assert.equal(email.html.match(/✨/gu)?.length, 3);
});

test("without Hub sales the email has two options and no unsubscribe row without a link", () => {
  const email = buildCohortInviteEmail({
    cohort,
    links: { ...links, hub: null },
    locale: "ru",
    myAccessUrl: null,
    unsubscribeUrl: null,
  });

  assert.equal(email.html.match(/✨/gu)?.length, 2);
  assert.ok(!email.text.includes("Только Inspiration Hub"));
  assert.ok(!email.text.includes("Отписаться"));
  assert.ok(!email.text.includes("Мой доступ"));
  assert.ok(email.text.includes("стартуем 23 ноября!"));
  assert.ok(email.text.includes("проведём вместе 8 недель"));
});

test("Polish and Russian week counts follow their plural forms", () => {
  const weeks = (locale: "pl" | "ru", durationWeeks: number) =>
    buildCohortInviteEmail({
      cohort: { ...cohort, durationWeeks },
      links,
      locale,
      myAccessUrl: null,
      unsubscribeUrl: null,
    }).text;

  assert.ok(weeks("ru", 1).includes("1 неделю"));
  assert.ok(weeks("ru", 3).includes("3 недели"));
  assert.ok(weeks("ru", 12).includes("12 недель"));
  assert.ok(weeks("pl", 1).includes("1 tydzień"));
  assert.ok(weeks("pl", 4).includes("4 tygodnie"));
  assert.ok(weeks("pl", 8).includes("8 tygodni"));
  assert.ok(weeks("pl", 12).includes("12 tygodni"));
  // Polish 21 is many, not one as in Russian (21 неделю).
  assert.ok(weeks("pl", 21).includes("21 tygodni"));
  assert.ok(weeks("ru", 21).includes("21 неделю"));
});

test("the option names shorten the cohort title the way Anna writes it", () => {
  assert.equal(getCohortShortTitle("Online Group 3.0"), "Online 3.0");
  assert.equal(getCohortShortTitle("Winter Intensive"), "Winter Intensive");
});
