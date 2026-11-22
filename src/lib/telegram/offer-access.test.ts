import assert from "node:assert/strict";
import test from "node:test";

import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import { DAY_MS } from "@/lib/time";

import { getTelegramChannelAccessDurationMs } from "./offer-access";

const choreoOfferId = SELLABLE_PRODUCTS["choreo-still-alive"].offers[0]!.id;
const firstTouchOfferId = SELLABLE_PRODUCTS["first-touch"].offers[0]!.id;
const onlineGroupOfferId = SELLABLE_PRODUCTS["online-group-anna-strok"].offers[0]!.id;

const withChoreoDays = (value: string | undefined, read: () => number) => {
  const saved = process.env.TELEGRAM_CHOREO_ACCESS_DAYS;
  if (value === undefined) delete process.env.TELEGRAM_CHOREO_ACCESS_DAYS;
  else process.env.TELEGRAM_CHOREO_ACCESS_DAYS = value;
  try {
    return read();
  } finally {
    if (saved === undefined) delete process.env.TELEGRAM_CHOREO_ACCESS_DAYS;
    else process.env.TELEGRAM_CHOREO_ACCESS_DAYS = saved;
  }
};

test("a choreography channel runs for the env override, else its catalogue days", () => {
  const read = () => getTelegramChannelAccessDurationMs(choreoOfferId);

  assert.equal(withChoreoDays(undefined, read), 60 * DAY_MS);
  assert.equal(withChoreoDays("45", read), 45 * DAY_MS);
  assert.equal(withChoreoDays("45 days", read), 45 * DAY_MS);
  assert.equal(withChoreoDays("0", read), 60 * DAY_MS);
  assert.equal(withChoreoDays("soon", read), 60 * DAY_MS);
});

test("First Touch runs for its catalogue days; other offers have no timed access", () => {
  assert.equal(
    withChoreoDays("45", () => getTelegramChannelAccessDurationMs(firstTouchOfferId)),
    120 * DAY_MS,
  );
  assert.equal(getTelegramChannelAccessDurationMs(onlineGroupOfferId), 0);
  assert.equal(getTelegramChannelAccessDurationMs("unknown"), 0);
});
