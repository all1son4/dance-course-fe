import assert from "node:assert/strict";
import test from "node:test";

import { getTelegramAccessRuntime } from "./access-persistence";

test("keeps legacy Telegram access persistence until its explicit cutover", () => {
  assert.equal(getTelegramAccessRuntime({}), "legacy");
  assert.equal(getTelegramAccessRuntime({ DB_TELEGRAM_ACCESS_MODE: "shadow" }), "legacy");
});

test("enables PostgreSQL-only Telegram access persistence explicitly", () => {
  assert.equal(
    getTelegramAccessRuntime({ DB_TELEGRAM_ACCESS_MODE: "database" }),
    "database",
  );
});

test("rejects an invalid Telegram access mode instead of falling back", () => {
  assert.throws(
    () => getTelegramAccessRuntime({ DB_TELEGRAM_ACCESS_MODE: "invalid" }),
    /DB_TELEGRAM_ACCESS_MODE must be one of/u,
  );
});
