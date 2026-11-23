import { sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { readOperationalDatabaseStatus } from "@/db/operational-status";
import { countOutstandingPolishTerminalSales } from "@/db/polish-terminal-sales";
import { purchases } from "@/db/schema";
import { stripeFinancialDataComplete } from "@/db/stripe-sales";
import {
  getAccountingMonthValue,
  getPreviousAccountingMonthValue,
} from "@/lib/accounting-month";
import { addWarsawCalendarDays } from "@/lib/inspiration-hub/calendar";
import { getCohortsOverview } from "@/lib/online-group/cohort-admin";
import { PLUS_HUB_GRACE_DAYS } from "@/lib/online-group/cohort-messages";
import {
  getOnlineGroupSale,
  ONLINE_GROUP_SALE_REFUSAL_LABELS,
} from "@/lib/online-group-sale";
import { plural } from "@/lib/plural";
import { DAY_MS } from "@/lib/time";

import { countRunningHubPeriods, getHubAdminOverview } from "./hub-admin";
import { getUrgentPulseItems } from "./pulse-attention";
import { getSystemPulse } from "./system-pulse";

const EVENT_WINDOW_DAYS = 21;

/** The admin sections an attention item or event leads to. */
export type AdminView =
  "inspiration-hub" | "online-group" | "operations" | "purchases" | "sales";

export type AttentionItem = {
  id: string;
  view: AdminView;
  severity: "danger" | "warning";
  title: string;
  detail: string;
  /** A fix the overview can run in place; otherwise the item opens its section. */
  fix?: { kind: "retry-cohort-post"; cohortId: string; label: string };
};

export type AdminEvent = {
  id: string;
  at: string;
  view: AdminView;
  title: string;
};

const getAdminEnvironment = () =>
  process.env.VERCEL_ENV === "production"
    ? ("production" as const)
    : process.env.VERCEL_ENV === "preview"
      ? ("preview" as const)
      : ("development" as const);

const formatPln = (minor: number) =>
  `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(minor / 100))} PLN`;

/** Production counts live Stripe sales only; elsewhere test-mode sales are the data. */
const isProductionDatabase = () => process.env.VERCEL_ENV === "production";

/**
 * «Заработано за месяц»: what Stripe left after its fee (the conversion of EUR sales
 * included), by the rule of «Покупки» and the monthly report — a sale counts from its
 * first processed payment_intent.succeeded event, and only once its balance
 * transaction is complete. A sale Stripe has not settled yet is counted apart.
 */
export const readSalesMetrics = async (now: Date) => {
  const at = now.toISOString();
  const rows = await getDatabase().execute<{
    monthNet: string;
    monthCount: number;
    monthUnsettled: number;
    previousNet: string;
    weekCount: number;
  }>(sql`
    WITH bounds AS (
      SELECT
        date_trunc('month', ${at}::timestamptz AT TIME ZONE 'Europe/Warsaw') AS month_start,
        date_trunc('month', ${at}::timestamptz AT TIME ZONE 'Europe/Warsaw') - interval '1 month' AS previous_start
    ),
    sales AS (
      SELECT
        CASE WHEN ${stripeFinancialDataComplete} THEN ${purchases.stripeNetAmountMinor} END AS net,
        events.sale_at
      FROM ${purchases}
      JOIN (
        SELECT payment_intent_id, MIN(stripe_created_at) AS sale_at
        FROM stripe_events
        WHERE event_type = 'payment_intent.succeeded'
          AND processing_status = 'processed'
          AND outcome_snapshot = 'succeeded'
          AND payment_intent_id IS NOT NULL
          AND stripe_created_at IS NOT NULL
        GROUP BY payment_intent_id
      ) AS events ON events.payment_intent_id = ${purchases.paymentIntentId}
      WHERE ${purchases.outcome} = 'succeeded'
        AND ${purchases.source} = 'stripe'
        AND (${!isProductionDatabase()} OR ${purchases.livemode} = true)
    ),
    marked AS (
      SELECT net, sale_at,
        sale_at AT TIME ZONE 'Europe/Warsaw' >= bounds.month_start
          AND sale_at <= ${at}::timestamptz AS this_month,
        sale_at AT TIME ZONE 'Europe/Warsaw' >= bounds.previous_start
          AND sale_at AT TIME ZONE 'Europe/Warsaw' < bounds.month_start
          AND sale_at <= ${at}::timestamptz - interval '1 month' AS previous_to_date
      FROM sales, bounds
    )
    SELECT
      COALESCE(SUM(net) FILTER (WHERE this_month), 0)::text AS "monthNet",
      count(*) FILTER (WHERE this_month)::int AS "monthCount",
      count(*) FILTER (WHERE this_month AND net IS NULL)::int AS "monthUnsettled",
      COALESCE(SUM(net) FILTER (WHERE previous_to_date), 0)::text AS "previousNet",
      count(*) FILTER (
        WHERE sale_at > ${at}::timestamptz - interval '7 days'
          AND sale_at <= ${at}::timestamptz)::int AS "weekCount"
    FROM marked
  `);
  const [row] = rows;
  const monthNet = Number(row?.monthNet ?? 0);
  // Same days of the previous month, so the comparison is fair mid-month.
  const previousToDate = Number(row?.previousNet ?? 0);

  return {
    monthLabel: new Intl.DateTimeFormat("ru-RU", {
      month: "long",
      timeZone: "Europe/Warsaw",
    }).format(now),
    monthNet: formatPln(monthNet),
    monthCount: row?.monthCount ?? 0,
    /** Sales of the month Stripe has not settled yet: not in the sum. */
    monthUnsettled: row?.monthUnsettled ?? 0,
    deltaPercent:
      previousToDate > 0
        ? Math.round(((monthNet - previousToDate) / previousToDate) * 100)
        : null,
    weekCount: row?.weekCount ?? 0,
  };
};

/**
 * The control centre's home: one list of everything that needs a person, across all
 * sections, each with a way to act; the numbers that tell how things go; and what is
 * coming. Section badges in the sidebar are counted from the same list.
 */
export async function getAdminOverview(now = new Date()) {
  const monthValue = getAccountingMonthValue(now);
  // The calendar month before, not "32 days ago": that lands two months back on 1–4 March.
  const previousMonthValue = monthValue
    ? getPreviousAccountingMonthValue(monthValue)
    : null;
  // One reading of the queues serves both the system items below and the pulse.
  const operationsRead = readOperationalDatabaseStatus();
  const [
    operations,
    cohorts,
    hub,
    sale,
    sales,
    hubCounts,
    polishNow,
    polishPrevious,
    pulse,
  ] = await Promise.all([
    operationsRead,
    getCohortsOverview(now),
    getHubAdminOverview({ now }),
    getOnlineGroupSale(),
    readSalesMetrics(now),
    countRunningHubPeriods(now),
    monthValue ? countOutstandingPolishTerminalSales(monthValue) : Promise.resolve(0),
    previousMonthValue
      ? countOutstandingPolishTerminalSales(previousMonthValue)
      : Promise.resolve(0),
    getSystemPulse(now, operationsRead),
  ]);

  const attention: AttentionItem[] = [];
  const add = (item: AttentionItem) => attention.push(item);

  // System: what Stripe, mail and Telegram could not finish on their own.
  const deadLetters = operations.inbox.deadLetters + operations.outbox.deadLetters;
  if (deadLetters > 0) {
    add({
      id: "system-dead-letters",
      view: "operations",
      severity: "danger",
      title: `${deadLetters} ${plural(deadLetters, "задача не выполнилась", "задачи не выполнились", "задач не выполнено")} после всех попыток`,
      detail: "Письма, оплаты или уведомления. Можно запустить ещё раз.",
    });
  }
  if (operations.access.linkFailed > 0) {
    add({
      id: "system-link-failed",
      view: "operations",
      severity: "warning",
      title: `${operations.access.linkFailed} ${plural(operations.access.linkFailed, "ссылка в Telegram не создалась", "ссылки в Telegram не создались", "ссылок в Telegram не создано")}`,
      detail: "Выдай ссылку заново в разделе «Система».",
    });
  }
  if (operations.outbox.staleLeases + operations.inbox.staleLeases > 0) {
    add({
      id: "system-stale",
      view: "operations",
      severity: "warning",
      title: "Часть писем или уведомлений задерживается",
      detail: "Обычно проходит само; если дольше часа — открой «Систему».",
    });
  }

  // Live signals that need a person now: the bot failing to receive updates, or
  // payments failing far more than usual.
  for (const item of getUrgentPulseItems(pulse.signals)) add(item);

  // Inspiration Hub (К5, К6, К13).
  if (hub.problems.settingsMissing) {
    add({
      id: "hub-settings",
      view: "inspiration-hub",
      severity: "danger",
      title: "Не выбрана Telegram-группа библиотеки",
      detail:
        "Ссылки в библиотеку не выдаются, окончания доступа не отслеживаются. Напиши разработчику.",
    });
  }
  if (hub.problems.stalledPaymentIntentIds.length > 0) {
    const count = hub.problems.stalledPaymentIntentIds.length;
    add({
      id: "hub-stalled",
      view: "inspiration-hub",
      severity: "danger",
      title: `${count} ${plural(count, "покупка библиотеки", "покупки библиотеки", "покупок библиотеки")} без дат`,
      detail:
        "После закрытия потока даты не проставились. Люди пока в библиотеке. Напиши разработчику.",
    });
  }
  const ownerless =
    hub.problems.ownerlessPaymentIntentIds.length +
    hub.problems.endedOwnerlessPaymentIntentIds.length;
  if (ownerless > 0) {
    add({
      id: "hub-ownerless",
      view: "inspiration-hub",
      severity: "warning",
      title: `${ownerless} ${plural(ownerless, "покупка библиотеки", "покупки библиотеки", "покупок библиотеки")} без Telegram-аккаунта`,
      detail:
        "Ссылкой не воспользовались больше 3 дней. Напиши на email из покупки или выдай ссылку заново.",
    });
  }

  // Online Group (HUB-D13, HUB-D29).
  for (const cohort of cohorts) {
    if (cohort.post && ["failed", "dead_letter"].includes(cohort.post.status)) {
      add({
        id: `cohort-post-${cohort.id}`,
        view: "online-group",
        severity: "danger",
        title: `Пост о закрытии «${cohort.title}» не опубликован`,
        // Telegram's own error text is English and technical: say what to do instead.
        detail:
          "Бот не смог отправить пост в чат потока. Проверь права бота в карточке потока и нажми «Повторить».",
        fix: { kind: "retry-cohort-post", cohortId: cohort.id, label: "Повторить" },
      });
    }
    const next = cohort.next;
    if (
      !cohort.closedAt &&
      next &&
      !next.salesEnabled &&
      Date.parse(next.startsAt) - now.getTime() < 14 * DAY_MS
    ) {
      add({
        id: `cohort-close-${cohort.id}`,
        view: "online-group",
        severity: "warning",
        title: `Закрой «${cohort.title}», чтобы открыть продажи «${next.title}»`,
        detail: "Продажи следующего потока откроются, когда закроешь текущий.",
      });
    }
  }
  // A cohort waiting for its predecessor's closure is already named above.
  const waitsForClosure = attention.some((item) => item.id.startsWith("cohort-close-"));
  if (
    !sale.open &&
    !waitsForClosure &&
    sale.reason !== "campaign_missing" &&
    sale.reason !== "previous_cohort_open"
  ) {
    add({
      id: "online-group-sale",
      view: "online-group",
      severity: "warning",
      title: "Online Group сейчас нельзя купить",
      detail: ONLINE_GROUP_SALE_REFUSAL_LABELS[sale.reason],
    });
  }

  // Polish payments still missing from the fiscal terminal.
  const polish = polishNow + polishPrevious;
  if (polish > 0) {
    add({
      id: "polish-terminal",
      view: "purchases",
      severity: "warning",
      title: `${polish} ${plural(polish, "польская оплата не внесена", "польские оплаты не внесены", "польских оплат не внесено")} в кассу`,
      detail: "Отметь их в разделе «Покупки», когда пробьёшь чек.",
    });
  }

  // What is coming in the next three weeks.
  const windowEnd = now.getTime() + EVENT_WINDOW_DAYS * DAY_MS;
  const events: AdminEvent[] = [];
  for (const cohort of cohorts) {
    const startsAt = Date.parse(cohort.startsAt);
    if (startsAt > now.getTime() && startsAt < windowEnd) {
      events.push({
        id: `start-${cohort.id}`,
        at: cohort.startsAt,
        view: "online-group",
        title: `Старт «${cohort.title}»`,
      });
    }
    if (cohort.accessEndsAt) {
      // The library stays open PLUS_HUB_GRACE_DAYS days after the cohort's access
      // ends; the event marks the start of the last of them, the day the cohort card
      // shows as «Библиотека у Plus до», and stays until that day is over.
      const accessEndsAt = new Date(cohort.accessEndsAt);
      const graceEnd = addWarsawCalendarDays(accessEndsAt, PLUS_HUB_GRACE_DAYS).getTime();
      const lastDay = addWarsawCalendarDays(accessEndsAt, PLUS_HUB_GRACE_DAYS - 1);
      if (graceEnd > now.getTime() && lastDay.getTime() < windowEnd) {
        events.push({
          id: `grace-${cohort.id}`,
          at: lastDay.toISOString(),
          view: "inspiration-hub",
          title: `Последний день библиотеки у Plus «${cohort.title}»`,
        });
      }
    }
  }
  if (hub.preview.removals.length > 0) {
    const count = hub.preview.removals.length;
    events.push({
      id: "cron-removals",
      at: hub.preview.at,
      view: "inspiration-hub",
      title: `Ночью бот уберёт из библиотеки ${count} ${plural(count, "человека", "человека", "человек")}`,
    });
  }
  // «Закончатся за 7 дней» is the library tile's hint; no second line for it here.
  events.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));

  const current =
    cohorts.find(
      (cohort) => !cohort.closedAt && Date.parse(cohort.startsAt) <= now.getTime(),
    ) ?? cohorts.find((cohort) => !cohort.closedAt);

  const badges = attention.reduce<Partial<Record<AdminView, number>>>((counts, item) => {
    counts[item.view] = (counts[item.view] ?? 0) + 1;
    return counts;
  }, {});

  return {
    environment: getAdminEnvironment(),
    generatedAt: now.toISOString(),
    attention: attention.sort((left, right) =>
      left.severity === right.severity ? 0 : left.severity === "danger" ? -1 : 1,
    ),
    badges,
    events,
    metrics: {
      sales,
      cohort: current
        ? {
            title: current.title,
            startsAt: current.startsAt,
            purchases: current.facts.purchases,
            plus: current.facts.plusPurchases,
          }
        : null,
      hub: hubCounts,
    },
  };
}

export type AdminOverview = Awaited<ReturnType<typeof getAdminOverview>>;
