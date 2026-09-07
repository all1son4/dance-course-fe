import assert from "node:assert/strict";
import test from "node:test";

import {
  TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
  TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
  type TelegramAccessTokenSheetRecord,
  type TelegramUserBindingSheetRecord,
} from "@/lib/google-sheets-schema";

import {
  createTelegramBindingFixture,
  createTelegramTokenFixture,
} from "../../../tests/helpers/telegram-records";
import type {
  TelegramAccessTokenRecord,
  TelegramUserBindingRecord,
} from "./access-records";

// Archive imports are intentional only at this compatibility-test boundary.
test("Telegram token contract preserves all 17 archive fields and string values", () => {
  const empty = createTelegramTokenFixture();
  assert.deepEqual(Object.keys(empty), [...TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS]);
  assert.ok(Object.values(empty).every((value) => value === ""));

  const archive: TelegramAccessTokenSheetRecord = createTelegramTokenFixture({
    ...Object.fromEntries(
      TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS.map((field) => [field, `fixture:${field}`]),
    ),
    telegram_user_id: "9007199254740993",
    chat_id: "-1001234567890",
    token_value: "fixture_bearer+/=",
    expires_at: "2026-09-07T00:00:00.000Z",
  });
  const record: TelegramAccessTokenRecord = archive;
  const restored: TelegramAccessTokenSheetRecord = { ...record };

  assert.deepEqual(restored, archive);
  assert.equal(record.telegram_user_id, "9007199254740993");
  assert.equal(record.token_value, "fixture_bearer+/=");
});

test("Telegram binding contract preserves all 14 archive fields and string values", () => {
  const empty = createTelegramBindingFixture();
  assert.deepEqual(Object.keys(empty), [...TELEGRAM_USER_BINDINGS_SHEET_HEADERS]);
  assert.ok(Object.values(empty).every((value) => value === ""));

  const archive: TelegramUserBindingSheetRecord = createTelegramBindingFixture({
    ...Object.fromEntries(
      TELEGRAM_USER_BINDINGS_SHEET_HEADERS.map((field) => [field, `fixture:${field}`]),
    ),
    invite_link: "https://t.me/+fixture_only",
    revoked_reason: 'Причина, "fixture"',
    telegram_user_id: "9007199254740993",
    access_expires_at: "",
  });
  const record: TelegramUserBindingRecord = archive;
  const restored: TelegramUserBindingSheetRecord = { ...record };

  assert.deepEqual(restored, archive);
  assert.equal(record.access_expires_at, "");
  assert.equal(record.invite_link, "https://t.me/+fixture_only");
});
