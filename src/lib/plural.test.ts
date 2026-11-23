import assert from "node:assert/strict";
import test from "node:test";

import { plural, pluralize } from "./plural";

// The hand-written rules this module replaces, kept here as the reference.
const manualRussian = (count: number, one: string, few: string, many: string) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};
const manualRussianAbs = (count: number, [one, few, many]: [string, string, string]) => {
  const lastTwoDigits = Math.abs(count) % 100;
  const lastDigit = lastTwoDigits % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return many;
  if (lastDigit === 1) return one;
  return lastDigit >= 2 && lastDigit <= 4 ? few : many;
};
const manualPolishWeeks = (weeks: number) => {
  if (weeks === 1) return "tydzień";
  const lastTwoDigits = weeks % 100;
  const lastDigit = weeks % 10;
  return lastDigit >= 2 && lastDigit <= 4 && !(lastTwoDigits >= 12 && lastTwoDigits <= 14)
    ? "tygodnie"
    : "tygodni";
};

test("Russian forms are the hand-written rule's for every count 0…10 000", () => {
  for (let count = 0; count <= 10_000; count += 1) {
    assert.equal(
      plural(count, "неделя", "недели", "недель"),
      manualRussian(count, "неделя", "недели", "недель"),
      `count ${count}`,
    );
  }
});

test("the Russian tuple form matches the old helper, negative counts included", () => {
  for (let count = -1_000; count <= 10_000; count += 1) {
    assert.equal(
      pluralize("ru", count, ["день", "дня", "дней"]),
      manualRussianAbs(count, ["день", "дня", "дней"]),
      `count ${count}`,
    );
  }
});

test("Polish weeks follow the Polish rule for every count 0…10 000", () => {
  for (let count = 0; count <= 10_000; count += 1) {
    assert.equal(
      pluralize("pl", count, ["tydzień", "tygodnie", "tygodni"]),
      manualPolishWeeks(count),
      `count ${count}`,
    );
  }
  // The Russian rule gave «21 tydzień»; Polish says «21 tygodni».
  assert.equal(pluralize("pl", 21, ["tydzień", "tygodnie", "tygodni"]), "tygodni");
});
