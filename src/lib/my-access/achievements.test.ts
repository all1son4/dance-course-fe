import assert from "node:assert/strict";
import test from "node:test";

import { hasFreshmanAchievement } from "./achievements";

const now = new Date("2026-11-23T11:00:00.000Z");
const purchase = (date: string, amountMinor = 3500) => ({
  amountMinor,
  boughtAt: new Date(date),
});

test("Debut stays after more purchases if the first was within three months", () => {
  const first = purchase("2026-09-03");
  assert.equal(hasFreshmanAchievement([first], now), true);
  assert.equal(
    hasFreshmanAchievement([purchase("2026-11-22"), first, purchase("2026-10-12")], now),
    true,
  );
});

test("a recent return does not make a long-time customer a freshman", () => {
  assert.equal(
    hasFreshmanAchievement([purchase("2026-11-22"), purchase("2026-05-01")], now),
    false,
  );
});

test("free access is ignored both before the first payment and on its own", () => {
  const freeAccess = purchase("2026-01-01", 0);
  assert.equal(hasFreshmanAchievement([freeAccess, purchase("2026-11-22")], now), true);
  assert.equal(hasFreshmanAchievement([freeAccess], now), false);
  assert.equal(hasFreshmanAchievement([], now), false);
  assert.equal(hasFreshmanAchievement([purchase("2026-11-24")], now), false);
});

test("the three-month boundary uses Warsaw local time across a clock change", () => {
  assert.equal(hasFreshmanAchievement([purchase("2026-08-23T10:00:00.000Z")], now), true);
  assert.equal(
    hasFreshmanAchievement([purchase("2026-08-23T09:59:59.999Z")], now),
    false,
  );
});

test("the boundary clamps to the last day when the earlier month is shorter", () => {
  const may31 = new Date("2026-05-31T10:00:00.000Z");
  assert.equal(
    hasFreshmanAchievement([purchase("2026-02-28T11:00:00.000Z")], may31),
    true,
  );
  assert.equal(
    hasFreshmanAchievement([purchase("2026-02-28T10:59:59.999Z")], may31),
    false,
  );
});
