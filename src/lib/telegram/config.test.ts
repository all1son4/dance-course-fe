import assert from "node:assert/strict";
import test from "node:test";

// The parsed targets are cached on first use, so the configuration has to exist
// before the module is imported. Tests therefore import it lazily.
process.env.TELEGRAM_CHANNEL_TARGETS_JSON = JSON.stringify({
  off_bilingual: {
    en: { chatId: "-100200000002" },
    ru: { chatId: "-100200000001" },
  },
  off_single: { chatId: "-100200000003" },
});

const loadTelegramConfig = () => import("./config");

test("[BEH-CHECKOUT-02] sends each lesson language to its own Telegram channel", async () => {
  const { getTelegramChannelTargetByOfferId } = await loadTelegramConfig();

  assert.deepEqual(
    getTelegramChannelTargetByOfferId({
      lessonLanguage: "ru",
      offerId: "off_bilingual",
    }),
    { chatId: "-100200000001", lessonLanguage: "ru", offerId: "off_bilingual" },
  );
  assert.deepEqual(
    getTelegramChannelTargetByOfferId({
      lessonLanguage: "en",
      offerId: "off_bilingual",
    }),
    { chatId: "-100200000002", lessonLanguage: "en", offerId: "off_bilingual" },
  );
});

test("keeps one shared channel for an offer configured without languages", async () => {
  const { getTelegramChannelTargetByOfferId } = await loadTelegramConfig();

  // A single-channel offer must ignore the buyer's language instead of losing
  // its target: both selections resolve to the same configured chat.
  for (const lessonLanguage of ["ru", "en"]) {
    assert.equal(
      getTelegramChannelTargetByOfferId({ lessonLanguage, offerId: "off_single" })
        ?.chatId,
      "-100200000003",
    );
  }
});

test("resolves an absent, empty, or unknown language without guessing a channel", async () => {
  const { getTelegramChannelTargetByOfferId } = await loadTelegramConfig();

  // A bilingual offer has no language-free target, so an unusable language must
  // not silently pick one of the two channels.
  for (const lessonLanguage of [null, undefined, "", "  ", "de"]) {
    assert.equal(
      getTelegramChannelTargetByOfferId({ lessonLanguage, offerId: "off_bilingual" }),
      null,
    );
  }

  // Locale-shaped values still resolve to their base language.
  assert.equal(
    getTelegramChannelTargetByOfferId({
      lessonLanguage: "en-GB",
      offerId: "off_bilingual",
    })?.chatId,
    "-100200000002",
  );
});

test("returns nothing for an offer that has no configured channel", async () => {
  const { getTelegramChannelTargetByOfferId } = await loadTelegramConfig();

  assert.equal(
    getTelegramChannelTargetByOfferId({ lessonLanguage: "ru", offerId: "off_absent" }),
    null,
  );
});
