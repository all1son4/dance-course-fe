import assert from "node:assert/strict";
import test from "node:test";

import { createInitialBirthdayPopupState, shouldShowBirthdayPopup } from "./state";

const DAY_MS = 86_400_000;
const FIRST_SEEN_AT = new Date("2026-08-01T12:00:00.000Z");

test("does not cap birthday popup appearances by seen count", () => {
  const state = {
    ...createInitialBirthdayPopupState(),
    firstSeenAt: FIRST_SEEN_AT.toISOString(),
    seenCount: 10_000,
  };

  assert.equal(
    shouldShowBirthdayPopup(state, new Date(FIRST_SEEN_AT.getTime() + 20 * DAY_MS)),
    true,
  );
});

test("keeps the 21-day birthday popup campaign window", () => {
  const state = {
    ...createInitialBirthdayPopupState(),
    firstSeenAt: FIRST_SEEN_AT.toISOString(),
  };

  assert.equal(
    shouldShowBirthdayPopup(state, new Date(FIRST_SEEN_AT.getTime() + 21 * DAY_MS + 1)),
    false,
  );
});
