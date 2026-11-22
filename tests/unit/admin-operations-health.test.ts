import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { OperationsWorkspace } from "@/app/admin/components/operations-workspace";
import type {
  OperationsQueueStatus,
  OperationsSnapshot,
} from "@/app/admin/lib/admin.types";

/*
 * Pins what «Система» says about each system (state badge, detail line, notes) for
 * the thresholds it reads: dead letters, a queue waiting over ten minutes, stale
 * leases, a capped list, failed links, manual accesses, failed reports.
 */

const idleQueue: OperationsQueueStatus = {
  deadLetters: 0,
  oldestReadyAgeSeconds: null,
  ready: 0,
  retries: 0,
  staleLeases: 0,
  working: 0,
};

const snapshotWith = (overrides: Partial<OperationsSnapshot>): OperationsSnapshot => ({
  access: { linkFailed: 0, manualPending: 0, pending: 0 },
  capturedAt: "2026-11-22T10:00:00.000Z",
  events: [],
  inbox: idleQueue,
  inboxDeadLetters: [],
  outbox: idleQueue,
  outboxDeadLetters: [],
  problemEntitlements: [],
  projection: { unlinkedProcessedEvents: 0, unverifiedEvents: 0 },
  reports: {},
  ...overrides,
});

const noop = () => undefined;

const renderText = (snapshot: OperationsSnapshot) =>
  renderToStaticMarkup(
    createElement(OperationsWorkspace, {
      isLoading: false,
      onRefresh: noop,
      onReissueAccess: noop,
      onReplay: noop,
      onTidy: noop,
      reissuedLinks: {},
      reissuingPaymentIntentId: "",
      replayingKey: "",
      snapshot,
      status: { text: "", tone: "info" },
    }),
  )
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** The lines between a system's name and the next system (or the technical details). */
const systemLines = (lines: string[], name: string) => {
  const names = [
    "События оплат Stripe",
    "Письма и уведомления",
    "Доступы в Telegram",
    "Месячные отчёты",
    "Технические детали",
  ];
  const start = lines.indexOf(name);
  assert.notEqual(start, -1, `${name} is shown`);
  const end = lines.findIndex((line, index) => index > start && names.includes(line));
  return lines.slice(start + 1, end);
};

test("every system works when nothing waits", () => {
  const lines = renderText(snapshotWith({ reports: { sent: 3 } }));

  assert.deepEqual(systemLines(lines, "События оплат Stripe"), [
    "Всё обработано.",
    "Работает",
  ]);
  assert.deepEqual(systemLines(lines, "Письма и уведомления"), [
    "Всё обработано.",
    "Работает",
  ]);
  assert.deepEqual(systemLines(lines, "Доступы в Telegram"), [
    "Все купленные доступы выданы.",
    "Работает",
  ]);
  assert.deepEqual(systemLines(lines, "Месячные отчёты"), [
    "Отправлено за всё время: 3.",
    "Работает",
  ]);
});

test("work in progress and fresh queues need no attention", () => {
  const lines = renderText(
    snapshotWith({
      access: { linkFailed: 0, manualPending: 0, pending: 2 },
      inbox: { ...idleQueue, oldestReadyAgeSeconds: 600, ready: 1, working: 1 },
      outbox: { ...idleQueue, oldestReadyAgeSeconds: 7200, ready: 0, working: 3 },
    }),
  );

  assert.deepEqual(systemLines(lines, "События оплат Stripe"), [
    "Сейчас в обработке: 2. Вмешательство не нужно.",
    "Работает",
  ]);
  assert.deepEqual(systemLines(lines, "Письма и уведомления"), [
    "Сейчас в обработке: 3. Вмешательство не нужно.",
    "Работает",
  ]);
  assert.deepEqual(systemLines(lines, "Доступы в Telegram"), [
    "Выдаётся прямо сейчас: 2. Вмешательство не нужно.",
    "Работает",
  ]);
  assert.deepEqual(systemLines(lines, "Месячные отчёты"), [
    "Отправлено за всё время: 0.",
    "Работает",
  ]);
});

test("a queue older than ten minutes, stale leases and manual accesses warn", () => {
  const lines = renderText(
    snapshotWith({
      access: { linkFailed: 0, manualPending: 2, pending: 1 },
      inbox: { ...idleQueue, oldestReadyAgeSeconds: 601, ready: 4, staleLeases: 1 },
      outbox: { ...idleQueue, oldestReadyAgeSeconds: 5400, ready: 2 },
    }),
  );

  assert.deepEqual(systemLines(lines, "События оплат Stripe"), [
    "Есть ожидающие задачи. Разверни строку, чтобы посмотреть детали.",
    "Внимание",
    "Задержалось: 1. Обычно проходит само за пару минут. Если число не уменьшается — нажми «Обновить»: задача появится ниже с кнопкой «Повторить».",
    "Ждут обработки: 4, дольше всех — 10 мин. Если так весь день — напиши разработчику.",
  ]);
  assert.deepEqual(systemLines(lines, "Письма и уведомления"), [
    "Есть ожидающие задачи. Разверни строку, чтобы посмотреть детали.",
    "Внимание",
    "Ждут обработки: 2, дольше всех — 1.5 ч. Если так весь день — напиши разработчику.",
  ]);
  assert.deepEqual(systemLines(lines, "Доступы в Telegram").slice(0, 2), [
    "Ждут ручной выдачи: 2. Разверни строку, чтобы посмотреть кому.",
    "Внимание",
  ]);
});

test("dead letters, failed links and failed reports are a failure", () => {
  const lines = renderText(
    snapshotWith({
      access: { linkFailed: 1, manualPending: 3, pending: 0 },
      inbox: { ...idleQueue, deadLetters: 25 },
      inboxDeadLetters: [
        {
          attemptCount: 8,
          deadLetteredAt: "2026-11-21T09:00:00.000Z",
          errorCode: "projection_failed",
          errorMessage: "boom",
          eventType: "payment_intent.succeeded",
          paymentIntentId: "pi_pinned",
          stripeEventId: "evt_pinned",
        },
      ],
      outbox: idleQueue,
      outboxDeadLetters: [
        {
          attemptCount: 5,
          deadLetteredAt: "2026-11-21T09:00:00.000Z",
          deduplicationKey: "purchase_success_email:pinned",
          kind: "purchase_success_email",
          lastErrorCode: "resend_failed",
          lastErrorMessage: "boom",
          recipient: "",
        },
      ],
      reports: { failed: 1, sent: 4 },
    }),
  );

  const inbox = systemLines(lines, "События оплат Stripe");
  assert.deepEqual(inbox.slice(0, 3), [
    "Не обработано: 25. Ниже можно повторить доставку.",
    "Сбой",
    "Показаны первые 1 задач из 25. Повтори видимые и обнови статус — появятся следующие.",
  ]);
  assert.ok(inbox.includes("payment_intent.succeeded"));
  assert.ok(inbox.includes("pi_pinned"));

  const outbox = systemLines(lines, "Письма и уведомления");
  assert.deepEqual(outbox.slice(0, 2), [
    "Не доставлено: 1. Ниже можно повторить доставку.",
    "Сбой",
  ]);
  assert.ok(outbox.includes("Письмо о покупке"));
  assert.ok(outbox.includes("purchase_success_email:pinned"));

  assert.deepEqual(systemLines(lines, "Доступы в Telegram").slice(0, 2), [
    "Ссылка не создалась: 1. Ниже можно перевыпустить.",
    "Сбой",
  ]);
  assert.deepEqual(systemLines(lines, "Месячные отчёты"), [
    "С ошибкой отправки: 1. Разверни строку, чтобы узнать, как починить.",
    "Сбой",
    "Открой раздел «Покупки», выбери нужный месяц и нажми «Отправить на почту» — отчёт уйдёт заново.",
  ]);
});
