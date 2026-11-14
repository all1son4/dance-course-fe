import assert from "node:assert/strict";
import test from "node:test";

import {
  kickUnexpectedMember,
  TEMP_KICK_SECONDS,
} from "@/lib/telegram/online-group-access";

test("К15: a kick stays a temporary ban even after every API retry", async (t) => {
  process.env.TELEGRAM_BOT_TOKEN ||= "kick-test-token";
  let untilDate = 0;
  t.mock.method(globalThis, "fetch", async (_url: string | URL, init?: RequestInit) => {
    untilDate = (JSON.parse(String(init?.body)) as { until_date: number }).until_date;
    return Response.json({ ok: true, result: true });
  });
  const sentAt = Math.floor(Date.now() / 1000);

  await kickUnexpectedMember("chat", "user");

  // Three 10-second timeouts plus backoff take about 31 seconds; 30 must remain.
  const worstCaseLastAttempt = sentAt + 3 * 10 + 3;
  assert.ok(untilDate - worstCaseLastAttempt >= 30, `until_date ${untilDate}`);
  assert.equal(untilDate - sentAt >= TEMP_KICK_SECONDS - 1, true);
});
