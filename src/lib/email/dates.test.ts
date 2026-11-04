import assert from "node:assert/strict";
import test from "node:test";

import { formatEmailDate } from "./dates";

test("email dates use local month names instead of machine timestamps", () => {
  for (const [locale, month] of [
    ["ru", "ноября"],
    ["en", "November"],
    ["pl", "listopada"],
  ]) {
    const value = formatEmailDate("2026-11-18T19:00:00Z", locale, { includeTime: true });
    assert.ok(value.includes(month));
    assert.match(value, /2026/u);
    assert.match(value, /20:00/u);
    assert.doesNotMatch(value, /2026-11-18|T19:00|Z$/u);
  }
  assert.match(
    formatEmailDate("2026-07-18T19:00:00Z", "en", { includeTime: true }),
    /21:00/u,
  );
  assert.doesNotMatch(formatEmailDate("2026-11-18T19:00:00Z", "ru"), /20:00/u);
  assert.throws(() => formatEmailDate("invalid-date", "ru"), /email_date_invalid/u);
});
