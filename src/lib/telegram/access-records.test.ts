import assert from "node:assert/strict";
import test from "node:test";

import {
  createTelegramBindingFixture,
  createTelegramTokenFixture,
} from "../../../tests/helpers/telegram-records";
import type {
  TelegramAccessTokenRecord,
  TelegramUserBindingRecord,
} from "./access-records";

const TELEGRAM_TOKEN_FIELDS = [
  "token_id",
  "token_hash",
  "token_value",
  "payment_intent_id",
  "product_id",
  "offer_id",
  "customer_email",
  "link_kind",
  "chat_id",
  "access_expires_at",
  "status",
  "created_at",
  "expires_at",
  "used_at",
  "telegram_user_id",
  "telegram_username",
  "last_error",
] as const satisfies readonly (keyof TelegramAccessTokenRecord)[];

const TELEGRAM_BINDING_FIELDS = [
  "telegram_user_id",
  "telegram_username",
  "payment_intent_id",
  "customer_email",
  "product_id",
  "offer_id",
  "chat_id",
  "invite_link",
  "bound_at",
  "last_seen_at",
  "access_expires_at",
  "revoked_at",
  "revoked_reason",
  "status",
] as const satisfies readonly (keyof TelegramUserBindingRecord)[];

test("Telegram token contract preserves all 17 fields and string values", () => {
  const empty = createTelegramTokenFixture();
  assert.deepEqual(Object.keys(empty), [...TELEGRAM_TOKEN_FIELDS]);
  assert.ok(Object.values(empty).every((value) => value === ""));

  const record = createTelegramTokenFixture({
    ...Object.fromEntries(
      TELEGRAM_TOKEN_FIELDS.map((field) => [field, `fixture:${field}`]),
    ),
    telegram_user_id: "9007199254740993",
    chat_id: "-1001234567890",
    token_value: "fixture_bearer+/=",
    expires_at: "2026-09-07T00:00:00.000Z",
  });
  const restored: TelegramAccessTokenRecord = { ...record };

  assert.deepEqual(restored, record);
  assert.equal(record.telegram_user_id, "9007199254740993");
  assert.equal(record.token_value, "fixture_bearer+/=");
});

test("Telegram binding contract preserves all 14 fields and string values", () => {
  const empty = createTelegramBindingFixture();
  assert.deepEqual(Object.keys(empty), [...TELEGRAM_BINDING_FIELDS]);
  assert.ok(Object.values(empty).every((value) => value === ""));

  const record = createTelegramBindingFixture({
    ...Object.fromEntries(
      TELEGRAM_BINDING_FIELDS.map((field) => [field, `fixture:${field}`]),
    ),
    invite_link: "https://t.me/+fixture_only",
    revoked_reason: 'Причина, "fixture"',
    telegram_user_id: "9007199254740993",
    access_expires_at: "",
  });
  const restored: TelegramUserBindingRecord = { ...record };

  assert.deepEqual(restored, record);
  assert.equal(record.access_expires_at, "");
  assert.equal(record.invite_link, "https://t.me/+fixture_only");
});
