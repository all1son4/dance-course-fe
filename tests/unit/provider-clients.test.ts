import assert from "node:assert/strict";
import test from "node:test";

import { sendTelegramMessage } from "@/lib/telegram/bot-api";

import { installJsonFetchFixture } from "../fixtures/providers";

test("Telegram fixture records the provider request without network access", async (t) => {
  const calls = installJsonFetchFixture(t, [
    {
      body: {
        ok: true,
        result: {
          message_id: 42,
        },
      },
    },
  ]);

  await sendTelegramMessage({
    botToken: "fixture-token",
    chatId: "-100123",
    disableWebPagePreview: true,
    parseMode: "HTML",
    text: "Test message",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.telegram.org/botfixture-token/sendMessage");
  assert.equal(calls[0]?.method, "POST");
  assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), {
    chat_id: "-100123",
    disable_web_page_preview: true,
    parse_mode: "HTML",
    text: "Test message",
  });
});

test("Telegram outbox mode performs one provider attempt after a claim", async (t) => {
  const calls = installJsonFetchFixture(t, [
    {
      body: {
        description: "temporary failure",
        error_code: 500,
        ok: false,
      },
      status: 500,
    },
    {
      body: {
        ok: true,
        result: { message_id: 43 },
      },
    },
  ]);

  await assert.rejects(
    sendTelegramMessage({
      botToken: "fixture-token",
      chatId: "-100123",
      maxAttempts: 1,
      text: "Test outbox message",
    }),
    /telegram_api_failed/u,
  );

  assert.equal(calls.length, 1);
});

test("Resend fixture records normalized email and idempotency data", async (t) => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFromEmail = process.env.RESEND_FROM_EMAIL;
  const previousReplyTo = process.env.RESEND_REPLY_TO;

  process.env.RESEND_API_KEY = "re_fixture";
  process.env.RESEND_FROM_EMAIL = "Dance <sender@example.com>";
  process.env.RESEND_REPLY_TO = "reply@example.com";

  t.after(() => {
    restoreEnvironmentVariable("RESEND_API_KEY", previousApiKey);
    restoreEnvironmentVariable("RESEND_FROM_EMAIL", previousFromEmail);
    restoreEnvironmentVariable("RESEND_REPLY_TO", previousReplyTo);
  });

  const calls = installJsonFetchFixture(t, [
    {
      body: {
        id: "email_fixture",
      },
    },
  ]);
  const { sendResendEmail } = await import("@/lib/email/resend");
  const result = await sendResendEmail({
    html: "<p>Hello</p>",
    idempotencyKey: " purchase-success:pi_fixture ",
    subject: " Payment   confirmed ",
    text: "Hello",
    to: "customer@example.com",
  });

  assert.deepEqual(result, {
    emailId: "email_fixture",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.resend.com/emails");
  assert.equal(calls[0]?.headers.get("Authorization"), "Bearer re_fixture");
  assert.equal(calls[0]?.headers.get("Idempotency-Key"), "purchase-success:pi_fixture");
  assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), {
    from: "Dance <sender@example.com>",
    html: "<p>Hello</p>",
    reply_to: ["reply@example.com"],
    subject: "Payment confirmed",
    text: "Hello",
    to: ["customer@example.com"],
  });
});

const restoreEnvironmentVariable = (name: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
};
