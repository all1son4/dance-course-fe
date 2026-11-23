import assert from "node:assert/strict";
import test from "node:test";

import { isUnknownChatParticipantError } from "./bot-api";

test("an account Telegram never saw in the chat is told apart from real failures", () => {
  assert.equal(
    isUnknownChatParticipantError(
      new Error(
        "telegram_api_failed:unbanChatMember:Bad Request: PARTICIPANT_ID_INVALID",
      ),
    ),
    true,
  );
  assert.equal(
    isUnknownChatParticipantError(
      new Error("telegram_api_failed:unbanChatMember:Bad Request: not enough rights"),
    ),
    false,
  );
  assert.equal(isUnknownChatParticipantError(new TypeError("fetch failed")), false);
  assert.equal(isUnknownChatParticipantError("PARTICIPANT_ID_INVALID"), false);
});
