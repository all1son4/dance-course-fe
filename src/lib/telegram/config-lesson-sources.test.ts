import assert from "node:assert/strict";
import test from "node:test";

// Parsed once per process and cached, so the configuration is set before the import.
process.env.TELEGRAM_LESSON_SOURCES_JSON = JSON.stringify({
  off_single: { sourceChatId: "-1001", sourceMessageId: 5, lessonTitle: "Single" },
  off_bilingual: {
    en: { sourceChatId: "-1002", sourceMessageId: 7 },
    ru: { sourceChatId: "-1003", sourceMessageId: "8", lessonTitle: "Русский" },
    de: { sourceChatId: "-1004", sourceMessageId: 9 },
  },
  off_invalid: { sourceChatId: "-1005", sourceMessageId: 0 },
});

test("lesson sources keyed by offer, alone or per lesson language", async () => {
  const { getTelegramLessonSourceByOfferId: source } = await import("./config");

  const single = {
    lessonTitle: "Single",
    offerId: "off_single",
    sourceChatId: "-1001",
    sourceMessageId: 5,
  };
  assert.deepEqual(source({ offerId: "off_single" }), single);
  assert.deepEqual(source({ lessonLanguage: "ru", offerId: "off_single" }), single);
  // An English lesson never falls back to the shared (Russian) source.
  assert.equal(source({ lessonLanguage: "en", offerId: "off_single" }), null);
  assert.deepEqual(source({ lessonLanguage: "en", offerId: "off_bilingual" }), {
    lessonTitle: "Dance lesson",
    offerId: "off_bilingual",
    sourceChatId: "-1002",
    sourceMessageId: 7,
  });
  assert.deepEqual(source({ lessonLanguage: "ru", offerId: "off_bilingual" }), {
    lessonTitle: "Русский",
    offerId: "off_bilingual",
    sourceChatId: "-1003",
    sourceMessageId: 8,
  });
  assert.equal(source({ offerId: "off_bilingual" }), null);
  assert.equal(source({ lessonLanguage: "de", offerId: "off_bilingual" }), null);
  assert.equal(source({ offerId: "off_invalid" }), null);
});
