import assert from "node:assert/strict";
import test from "node:test";

import {
  BIRTHDAY_DROP_OFFER_ID,
  LOVE_ME_IN_THE_MORNING_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";

import { getMissingChoreoLessonLanguages } from "./choreo-sales";

test("requires the new tutorial's own language channels rather than the Birthday Drop target", () => {
  process.env.TELEGRAM_CHANNEL_TARGETS_JSON = JSON.stringify({
    [BIRTHDAY_DROP_OFFER_ID]: { chatId: "-100111" },
    [LOVE_ME_IN_THE_MORNING_OFFER_ID]: { ru: { chatId: "-100222" } },
  });
  assert.deepEqual(
    getMissingChoreoLessonLanguages(SELLABLE_PRODUCTS["choreo-love-me-in-the-morning"]),
    ["en"],
  );
  assert.deepEqual(
    getMissingChoreoLessonLanguages(SELLABLE_PRODUCTS["choreo-birthday-drop"]),
    [],
  );
  assert.deepEqual(
    getMissingChoreoLessonLanguages(SELLABLE_PRODUCTS["choreo-her-lies"]),
    [],
  );
});
