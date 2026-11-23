import assert from "node:assert/strict";
import test from "node:test";

import { checkChatMembership, isActiveTelegramMember } from "./chat-membership";

test("a member, an admin, the creator and a restricted member still in the chat count", () => {
  for (const status of ["member", "administrator", "creator"]) {
    assert.equal(isActiveTelegramMember({ status }), true, status);
  }
  assert.equal(isActiveTelegramMember({ is_member: true, status: "restricted" }), true);
  assert.equal(isActiveTelegramMember({ is_member: false, status: "restricted" }), false);
  assert.equal(isActiveTelegramMember({ status: "left" }), false);
  assert.equal(isActiveTelegramMember(undefined), false);
});

test("Telegram's answer decides; a failed call is checkFailed, never an absence", async (t) => {
  process.env.TELEGRAM_BOT_TOKEN ||= "membership-test-token";
  const statuses: unknown[] = [
    { ok: true, result: { status: "member" } },
    { ok: true, result: { status: "left" } },
  ];
  t.mock.method(globalThis, "fetch", async () => {
    const next = statuses.shift();
    return next ? Response.json(next) : Response.json({ ok: false }, { status: 500 });
  });
  const errors = t.mock.method(console, "error", () => undefined);
  const check = () =>
    checkChatMembership({ chatId: "-100", failureEvent: "Test membership", userId: "7" });

  assert.deepEqual(await check(), { checkFailed: false, isMember: true });
  assert.deepEqual(await check(), { checkFailed: false, isMember: false });
  assert.deepEqual(await check(), { checkFailed: true, isMember: false });
  assert.ok(errors.mock.calls.some((call) => call.arguments[0] === "Test membership"));
});
