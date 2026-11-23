import assert from "node:assert/strict";
import test from "node:test";

import { describeErrorCode } from "./error-code";
import { titleOfEvent } from "./event-titles";
import { explainErrorCode } from "./explanations";

test("a Telegram failure keeps its method and description, never a person", () => {
  assert.deepEqual(
    describeErrorCode(
      new Error("telegram_api_failed:getChatMember:Bad Request: PARTICIPANT_ID_INVALID"),
    ),
    { area: "telegram", code: "getChatMember: PARTICIPANT_ID_INVALID" },
  );
  assert.deepEqual(
    describeErrorCode(
      new Error("telegram_api_failed:sendMessage:Too Many Requests: retry after 17"),
    ),
    { area: "telegram", code: "sendMessage: Too Many Requests: retry after N" },
  );
  assert.deepEqual(describeErrorCode(new Error("telegram_bot_not_configured")), {
    area: "telegram",
    code: "telegram_bot_not_configured",
  });
});

test("provider bodies and query parameters never reach the code", () => {
  // Resend echoes the address in its body; only the status stays.
  assert.deepEqual(
    describeErrorCode(
      new Error(
        'resend_request_failed:422:{"message":"Invalid `to` field: a@b.example"}',
      ),
    ),
    { area: "email", code: "resend: HTTP 422" },
  );

  // A Drizzle error carries the parameters; only the SQLSTATE of its cause stays.
  const drizzle = Object.assign(
    new Error("Failed query: select ... params: person@example.test,123456789"),
    { cause: Object.assign(new Error("deadlock detected"), { code: "40P01" }) },
  );
  assert.deepEqual(describeErrorCode(drizzle), {
    area: "database",
    code: "postgres: 40P01",
  });

  // Free text is never kept: only its category.
  assert.deepEqual(describeErrorCode(new Error("Something about person@example.test")), {
    area: "app",
    code: "Error",
  });
  assert.deepEqual(describeErrorCode(new TypeError("x is undefined")), {
    area: "app",
    code: "TypeError",
  });
});

test("Stripe, timeouts, network and our own codes", () => {
  assert.deepEqual(
    describeErrorCode(
      Object.assign(new Error("Your card was declined."), {
        type: "StripeCardError",
        code: "card_declined",
      }),
    ),
    { area: "stripe", code: "stripe: Card:card_declined" },
  );
  assert.deepEqual(
    describeErrorCode(Object.assign(new Error("aborted"), { name: "AbortError" })),
    { area: "app", code: "timeout" },
  );
  assert.deepEqual(
    describeErrorCode(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })),
    { area: "app", code: "ECONNRESET" },
  );
  // postgres.js wraps its own connection codes in a Drizzle error.
  assert.deepEqual(
    describeErrorCode(
      Object.assign(new Error("Failed query: select ..."), {
        cause: Object.assign(new Error("write CONNECTION_CLOSED host:5432"), {
          code: "CONNECTION_CLOSED",
        }),
      }),
    ),
    { area: "app", code: "CONNECTION_CLOSED" },
  );
  assert.match(explainErrorCode("CONNECT_TIMEOUT"), /подключиться к базе/u);
  assert.deepEqual(describeErrorCode(new Error("access_invitation_links_unavailable")), {
    area: "app",
    code: "access_invitation_links_unavailable",
  });
});

test("each known code has a plain explanation; an unknown one asks for the developer", () => {
  assert.match(
    explainErrorCode("getChatMember: PARTICIPANT_ID_INVALID"),
    /не нашёл этот аккаунт в чате/u,
  );
  assert.match(explainErrorCode("createChatInviteLink: not enough rights"), /прав/u);
  assert.match(explainErrorCode("resend: HTTP 429"), /лимит/u);
  assert.match(explainErrorCode("postgres: 40P01"), /блокировка/u);
  assert.match(explainErrorCode("Error"), /разработчика/u);
});

test("events read in Russian; patterns keep their subject", () => {
  assert.equal(
    titleOfEvent("Failed to ensure invitation accesses"),
    "Не удалось выдать ссылку по приглашению",
  );
  assert.equal(
    titleOfEvent("Outbox job failed after all retries: access_invitation_email"),
    "Задача не выполнилась после всех повторов: access_invitation_email",
  );
  assert.equal(titleOfEvent("Some new event"), "Some new event");
});
