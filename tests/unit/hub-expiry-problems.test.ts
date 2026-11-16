import assert from "node:assert/strict";
import test from "node:test";

import { buildHubExpiryProblemsText } from "@/lib/telegram/online-group-hub-expiry";

test("the Hub cron report lists only the problems it saw, with payment IDs", () => {
  const text = buildHubExpiryProblemsText({
    hubSettingsMissing: false,
    ownerlessEndedPaymentIntentIds: ["pi_ended"],
    ownerlessPurchasePaymentIntentIds: ["pi_old_a", "pi_old_b"],
    stalledContinuationPaymentIntentIds: [],
  });

  assert.match(text, /^⚠️ Inspiration Hub/u);
  assert.doesNotMatch(text, /inspiration_hub_settings/u);
  assert.match(text, /удалить некого:\n• pi_ended/u);
  assert.match(text, /больше 3 дней назад.*:\n• pi_old_a\n• pi_old_b$/u);
});

test("a missing shared Hub setting is named in the report", () => {
  const text = buildHubExpiryProblemsText({
    hubSettingsMissing: true,
    ownerlessEndedPaymentIntentIds: [],
    ownerlessPurchasePaymentIntentIds: [],
    stalledContinuationPaymentIntentIds: [],
  });

  assert.match(text, /Не задан общий чат хаба/u);
  assert.doesNotMatch(text, /•/u);
});

test("a stalled continuation is named in the report (К13)", () => {
  const text = buildHubExpiryProblemsText({
    hubSettingsMissing: false,
    ownerlessEndedPaymentIntentIds: [],
    ownerlessPurchasePaymentIntentIds: [],
    stalledContinuationPaymentIntentIds: ["pi_stalled"],
  });

  assert.match(text, /так и не получило даты.*:\n• pi_stalled$/u);
});
