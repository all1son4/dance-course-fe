import assert from "node:assert/strict";
import test from "node:test";

import { buildChoreoAccessReminderEmail } from "./choreo-access-reminder";

test("renders a concise localized reminder with the exact expiry and safe material link", () => {
  for (const locale of ["ru", "en", "pl"]) {
    const email = buildChoreoAccessReminderEmail({
      title: "Her Lies",
      expiresAt: new Date("2026-11-18T18:34:00Z"),
      locale,
      materialsUrl: "https://t.me/c/4323567965/6",
    });
    assert.match(email.subject, /Her Lies/u);
    assert.match(email.text, /2026/u);
    assert.match(email.text, /19:34/u);
    assert.match(email.html, /https:\/\/t.me\/c\/4323567965\/6/u);
    assert.ok(email.text.length < 500);
    assert.doesNotMatch(email.text, /14 days|14 дней|14 dni/u);
    assert.doesNotMatch(email.html, /invoice|receipt|payment/i);
  }
  const escaped = buildChoreoAccessReminderEmail({
    title: '<img src=x onerror="bad">',
    expiresAt: new Date("2026-11-18T18:34:00Z"),
    locale: "ru",
  });
  assert.doesNotMatch(escaped.html, /<img/u);
  assert.match(escaped.html, /&lt;img/u);
});
