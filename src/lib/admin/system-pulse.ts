import { getDatabaseClient } from "@/db/client";
import { getTelegramWebhookInfo } from "@/lib/telegram/bot-api";

/**
 * The live signals of the shop, read-only: are payments arriving, is anything
 * stuck between Stripe and the buyer, is the Telegram bot receiving updates.
 * Each signal carries its own verdict so the admin never has to interpret raw
 * numbers to know whether to act.
 */

export type PulseTone = "success" | "warning" | "danger" | "neutral";

export type PulseSignal = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: PulseTone;
};

export type SystemPulse = {
  generatedAt: string;
  signals: PulseSignal[];
};

const HOUR_MS = 3600_000;
const TELEGRAM_CHECK_TIMEOUT_MS = 3000;

const formatAgo = (from: Date | null, now: Date) => {
  if (!from) return "ещё не было";
  const minutes = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000));
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
};

const formatAge = (from: Date | null, now: Date) => {
  if (!from) return "—";
  const minutes = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} мин`;
  return `${Math.round(minutes / 60)} ч`;
};

type DatabaseSignals = {
  lastSaleAt: Date | null;
  lastStripeEventAt: Date | null;
  stuckPayments: number;
  attempts24h: number;
  failed24h: number;
  stripeBacklog: number;
  oldestStripeBacklogAt: Date | null;
  queueBacklog: number;
  oldestQueueAt: Date | null;
  sent24h: number;
};

const readDatabaseSignals = async (now: Date): Promise<DatabaseSignals> => {
  const nowIso = now.toISOString();
  const [row] = await getDatabaseClient()<DatabaseSignals[]>`
    SELECT
      (SELECT MAX(succeeded_at) FROM purchases WHERE outcome = 'succeeded') AS "lastSaleAt",
      (SELECT MAX(received_at) FROM stripe_events) AS "lastStripeEventAt",
      (SELECT count(*)::int FROM purchases
        WHERE outcome IN ('processing', 'requires_action')
          AND created_at < ${nowIso}::timestamptz - interval '1 hour'
          AND created_at > ${nowIso}::timestamptz - interval '7 days') AS "stuckPayments",
      (SELECT count(*)::int FROM purchases
        WHERE created_at > ${nowIso}::timestamptz - interval '24 hours'
          AND created_at <= ${nowIso}::timestamptz) AS "attempts24h",
      (SELECT count(*)::int FROM purchases
        WHERE outcome IN ('failed', 'canceled')
          AND created_at > ${nowIso}::timestamptz - interval '24 hours'
          AND created_at <= ${nowIso}::timestamptz) AS "failed24h",
      (SELECT count(*)::int FROM stripe_events
        WHERE processing_status IN ('pending', 'processing', 'failed')) AS "stripeBacklog",
      (SELECT MIN(received_at) FROM stripe_events
        WHERE processing_status IN ('pending', 'processing', 'failed')) AS "oldestStripeBacklogAt",
      (SELECT count(*)::int FROM purchase_side_effects
        WHERE status IN ('pending', 'sending', 'failed')) AS "queueBacklog",
      (SELECT MIN(created_at) FROM purchase_side_effects
        WHERE status IN ('pending', 'sending', 'failed')) AS "oldestQueueAt",
      (SELECT count(*)::int FROM purchase_side_effects
        WHERE status = 'sent'
          AND sent_at > ${nowIso}::timestamptz - interval '24 hours'
          AND sent_at <= ${nowIso}::timestamptz) AS "sent24h"
  `;
  return row!;
};

const telegramSignal = async (now: Date): Promise<PulseSignal> => {
  try {
    // The overview waits for this answer: a slow Telegram must not slow the admin.
    const info = await Promise.race([
      getTelegramWebhookInfo(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("telegram_timeout")),
          TELEGRAM_CHECK_TIMEOUT_MS,
        ),
      ),
    ]);
    const lastErrorAt = info.last_error_date
      ? new Date(info.last_error_date * 1000)
      : null;
    const recentError =
      lastErrorAt !== null && now.getTime() - lastErrorAt.getTime() < HOUR_MS;

    if (!info.url) {
      return {
        id: "telegram",
        label: "Telegram-бот",
        value: "Не подключён",
        detail: "У бота нет адреса для обновлений: входы в чаты не обрабатываются.",
        tone: "danger",
      };
    }
    if (recentError) {
      return {
        id: "telegram",
        label: "Telegram-бот",
        value: "Ошибки",
        detail: `Последняя ${formatAgo(lastErrorAt, now)}: ${info.last_error_message ?? "без описания"}.`,
        tone: "danger",
      };
    }
    return {
      id: "telegram",
      label: "Telegram-бот",
      value: info.pending_update_count > 50 ? "Отстаёт" : "Работает",
      detail:
        info.pending_update_count > 0
          ? `В очереди у Telegram: ${info.pending_update_count}.`
          : `Обновления доходят до ${new URL(info.url).host}.`,
      tone: info.pending_update_count > 50 ? "warning" : "success",
    };
  } catch {
    return {
      id: "telegram",
      label: "Telegram-бот",
      value: "Нет ответа",
      detail: "Telegram не ответил на проверку. Обнови через минуту.",
      tone: "warning",
    };
  }
};

export async function getSystemPulse(now = new Date()): Promise<SystemPulse> {
  const [db, telegram] = await Promise.all([
    readDatabaseSignals(now),
    telegramSignal(now),
  ]);
  const failRate = db.attempts24h > 0 ? db.failed24h / db.attempts24h : 0;
  const queueAgeMs = db.oldestQueueAt
    ? now.getTime() - new Date(db.oldestQueueAt).getTime()
    : 0;
  const stripeAgeMs = db.oldestStripeBacklogAt
    ? now.getTime() - new Date(db.oldestStripeBacklogAt).getTime()
    : 0;

  const signals: PulseSignal[] = [
    {
      id: "last-sale",
      label: "Последняя оплата",
      value: formatAgo(db.lastSaleAt && new Date(db.lastSaleAt), now),
      detail: `Событие Stripe — ${formatAgo(db.lastStripeEventAt && new Date(db.lastStripeEventAt), now)}.`,
      tone: "neutral",
    },
    {
      id: "stripe-backlog",
      label: "Оплаты в обработке",
      value: db.stripeBacklog === 0 ? "Всё обработано" : String(db.stripeBacklog),
      detail:
        db.stripeBacklog === 0
          ? "Каждое событие Stripe дошло до покупки."
          : `Самое старое ждёт ${formatAge(db.oldestStripeBacklogAt && new Date(db.oldestStripeBacklogAt), now)}.`,
      tone:
        db.stripeBacklog === 0
          ? "success"
          : stripeAgeMs > 15 * 60_000
            ? "danger"
            : "warning",
    },
    {
      id: "stuck-payments",
      label: "Зависшие оплаты",
      value: String(db.stuckPayments),
      detail:
        db.stuckPayments === 0
          ? "Нет оплат, застрявших на подтверждении банка."
          : "Дольше часа ждут подтверждения банка. Обычно покупатель бросил оплату.",
      tone: db.stuckPayments === 0 ? "success" : "warning",
    },
    {
      id: "fail-rate",
      label: "Отказы за сутки",
      value: db.attempts24h === 0 ? "—" : `${db.failed24h} из ${db.attempts24h}`,
      detail:
        db.attempts24h === 0
          ? "Попыток оплаты за сутки не было."
          : failRate >= 0.5 && db.failed24h >= 3
            ? "Больше половины попыток не прошли — проверь оплату на сайте."
            : "Отказы банков и брошенные оплаты — в пределах обычного.",
      tone:
        db.attempts24h === 0
          ? "neutral"
          : failRate >= 0.5 && db.failed24h >= 3
            ? "danger"
            : "success",
    },
    {
      id: "queue",
      label: "Письма и Telegram",
      value: db.queueBacklog === 0 ? "Очередь пуста" : `${db.queueBacklog} в очереди`,
      detail:
        db.queueBacklog === 0
          ? `За сутки отправлено: ${db.sent24h}.`
          : `Самая старая задача ждёт ${formatAge(db.oldestQueueAt && new Date(db.oldestQueueAt), now)}.`,
      tone:
        db.queueBacklog === 0
          ? "success"
          : queueAgeMs > 2 * HOUR_MS
            ? "danger"
            : queueAgeMs > 30 * 60_000
              ? "warning"
              : "success",
    },
    telegram,
  ];

  return { generatedAt: now.toISOString(), signals };
}
