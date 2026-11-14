import assert from "node:assert/strict";
import test from "node:test";

import { getUrgentPulseItems } from "./pulse-attention";
import type { PulseSignal } from "./system-pulse";

const signal = (overrides: Partial<PulseSignal>): PulseSignal => ({
  detail: "detail",
  id: "telegram",
  label: "Telegram-бот",
  tone: "success",
  value: "Работает",
  ...overrides,
});

test("only a failing bot or a failing day reach the overview", () => {
  const items = getUrgentPulseItems([
    signal({ id: "telegram", tone: "danger", value: "Ошибки" }),
    signal({
      id: "fail-rate",
      label: "Отказы за сутки",
      tone: "danger",
      value: "3 из 4",
    }),
    signal({
      id: "queue",
      label: "Письма и Telegram",
      tone: "danger",
      value: "5 в очереди",
    }),
    signal({
      id: "stuck-payments",
      label: "Зависшие оплаты",
      tone: "warning",
      value: "1",
    }),
  ]);

  assert.deepEqual(
    items.map((item) => item.id),
    ["pulse-telegram", "pulse-fail-rate"],
  );
  assert.equal(items[0]?.title, "Telegram-бот: ошибки");
  assert.equal(items[0]?.view, "operations");
});

test("a calm pulse adds nothing", () => {
  assert.deepEqual(
    getUrgentPulseItems([signal({ tone: "warning", value: "Нет ответа" })]),
    [],
  );
});
