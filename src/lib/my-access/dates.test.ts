import assert from "node:assert/strict";
import test from "node:test";

import { createAccessDates } from "./dates";

const NBSP = " ";
const together = (text: string) => text.replace(/ /gu, NBSP);

test("a purchase day has a three-letter month, no dot, no «г.», in Warsaw time", () => {
  // 23:30 UTC on 17 November is already the 18th in Warsaw.
  const lateEvening = "2026-11-17T23:30:00.000Z";

  assert.equal(createAccessDates("ru").purchaseDay(lateEvening), together("18 ноя 2026"));
  assert.equal(createAccessDates("pl").purchaseDay(lateEvening), together("18 lis 2026"));
  assert.equal(
    createAccessDates("en").purchaseDay(lateEvening),
    together("Nov 18, 2026"),
  );
});

test("a day with its month keeps together; the month alone reads as after a day", () => {
  const firstOfMarch = "2026-03-01T10:00:00.000Z";

  for (const [locale, dayMonth, month] of [
    ["ru", "1 марта", "марта"],
    ["pl", "1 marca", "marca"],
    ["en", "March 1", "March"],
  ] as const) {
    const dates = createAccessDates(locale);
    assert.equal(dates.dayMonth(firstOfMarch), together(dayMonth));
    assert.equal(dates.monthAfterDay(new Date(firstOfMarch)), month);
  }
});
