import assert from "node:assert/strict";
import test from "node:test";

// Parsed once per process and cached, so the configuration is set before the import.
process.env.TELEGRAM_LESSON_SOURCES_JSON = JSON.stringify([
  { offerId: "off_a", sourceChatId: "-1001", sourceMessageId: 5, lessonLanguage: "en" },
  { offerId: "off_a", sourceChatId: "-1002", sourceMessageId: 6 },
  { sourceChatId: "-1003", sourceMessageId: 7 },
]);
process.env.TELEGRAM_CHANNEL_TARGETS_JSON = JSON.stringify([
  { offerId: "off_c", chatId: -100123 },
  { offerId: "off_d", chatId: "-100124", lessonLanguage: "ru" },
  { chatId: "-100125" },
]);

test("both settings also accept a plain array of entries that name their offer", async () => {
  const config = await import("./config");

  assert.deepEqual(
    config.getTelegramLessonSourceByOfferId({ lessonLanguage: "en", offerId: "off_a" }),
    {
      lessonTitle: "Dance lesson",
      offerId: "off_a",
      sourceChatId: "-1001",
      sourceMessageId: 5,
    },
  );
  assert.deepEqual(config.getTelegramLessonSourceByOfferId({ offerId: "off_a" }), {
    lessonTitle: "Урок танца",
    offerId: "off_a",
    sourceChatId: "-1002",
    sourceMessageId: 6,
  });
  assert.deepEqual(config.getTelegramChannelTargetByOfferId({ offerId: "off_c" }), {
    chatId: "-100123",
    lessonLanguage: null,
    offerId: "off_c",
  });
  assert.deepEqual(
    config.getTelegramChannelTargetByOfferId({ lessonLanguage: "ru", offerId: "off_d" }),
    { chatId: "-100124", lessonLanguage: "ru", offerId: "off_d" },
  );
  assert.equal(
    config.getTelegramChannelTargetByOfferId({ lessonLanguage: "en", offerId: "off_d" }),
    null,
  );
});
