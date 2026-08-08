import assert from "node:assert/strict";
import test from "node:test";

import {
  getOnlineGroupIdentityReuseLookup,
  getReusableTimedAccessTelegramBindings,
  type TimedAccessTelegramBinding,
} from "@/lib/telegram/identity-reuse-policy";

const NOW = Date.parse("2026-08-08T12:00:00.000Z");

const binding = (
  overrides: Partial<TimedAccessTelegramBinding> = {},
): TimedAccessTelegramBinding => ({
  access_expires_at: "2026-08-10T12:00:00.000Z",
  chat_id: "chat-primary",
  status: "active",
  telegram_user_id: "telegram-user-1",
  ...overrides,
});

test("preserves timed-access reuse for the longest active binding in the same chat", () => {
  const reusable = getReusableTimedAccessTelegramBindings({
    bindings: [
      binding(),
      binding({
        access_expires_at: "2026-08-12T12:00:00.000Z",
        telegram_user_id: "telegram-user-2",
      }),
      binding({ chat_id: "another-chat" }),
      binding({ access_expires_at: "2026-08-07T12:00:00.000Z" }),
      binding({ status: "revoked" }),
      binding({ telegram_user_id: "" }),
    ],
    chatId: "chat-primary",
    nowMs: NOW,
  });

  assert.deepEqual(
    reusable.map((candidate) => candidate.telegram_user_id),
    ["telegram-user-2", "telegram-user-1"],
  );
});

test("preserves Online Group lookup precedence and email fallback", () => {
  assert.deepEqual(
    getOnlineGroupIdentityReuseLookup({
      customerEmailSnapshot: "buyer@example.com",
      customerId: "customer-id",
    }),
    {
      kind: "customer_id",
      value: "customer-id",
    },
  );
  assert.deepEqual(
    getOnlineGroupIdentityReuseLookup({
      customerEmailSnapshot: "buyer@example.com",
      customerId: null,
    }),
    {
      kind: "email_snapshot",
      value: "buyer@example.com",
    },
  );
  assert.equal(
    getOnlineGroupIdentityReuseLookup({
      customerEmailSnapshot: null,
      customerId: null,
    }),
    null,
  );
});
