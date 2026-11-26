import assert from "node:assert/strict";
import test from "node:test";

import { BOT_COPY, resolveBotLocale, resolvePurchaseBotLocale } from "./bot-copy";

test("a purchase message speaks the language the purchase was made in", () => {
  assert.equal(resolvePurchaseBotLocale({ checkoutLocale: "pl" }), "pl");
  assert.equal(resolvePurchaseBotLocale({ checkoutLocale: "en" }), "en");
  assert.equal(resolvePurchaseBotLocale({ checkoutLocale: "ru" }), "ru");
  // Like the purchase email: a record without a language is Russian.
  assert.equal(resolvePurchaseBotLocale({ checkoutLocale: "" }), "ru");
});

test("before a purchase is known the bot answers in the person's Telegram language", () => {
  assert.equal(resolveBotLocale("pl"), "pl");
  assert.equal(resolveBotLocale("ru"), "ru");
  assert.equal(resolveBotLocale("uk"), "ru");
  assert.equal(resolveBotLocale("be"), "ru");
  assert.equal(resolveBotLocale("en-GB"), "en");
  assert.equal(resolveBotLocale("de"), "en");
  assert.equal(resolveBotLocale(undefined), "en");
});

test("every bot message exists in all three languages", () => {
  const keys = Object.keys(BOT_COPY.ru).sort();

  assert.deepEqual(Object.keys(BOT_COPY.en).sort(), keys);
  assert.deepEqual(Object.keys(BOT_COPY.pl).sort(), keys);
});
