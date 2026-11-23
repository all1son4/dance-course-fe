import type {
  OperationsQueueStatus,
  OperationsSnapshot,
  ProblemAccessEntitlement,
} from "./admin.types";

/*
 * What «Система» says about each system, computed from the operations snapshot: the
 * state (ok, warn, alert), the one-line detail, the notes and the items to repair.
 * Pure, so the thresholds are tested without rendering.
 */

export type SystemState = "alert" | "ok" | "warn";

export type DeadLetterEntry = {
  attemptCount: number;
  deadLetteredAt: string;
  errorCode: string;
  errorMessage: string;
  itemKey: string;
  queue: "inbox" | "outbox";
  taskLabel: string;
  taskMeta: string;
};

export type SystemHealth = {
  deadLetters: DeadLetterEntry[];
  detail: string;
  entitlements: ProblemAccessEntitlement[];
  key: string;
  name: string;
  notes: string[];
  state: SystemState;
};

const OUTBOX_KIND_LABELS: Record<string, string> = {
  access_invitation_email: "Письмо приглашения",
  admin_telegram_alert: "Уведомление о покупке в Telegram",
  campaign_email_delivery: "Письмо рассылки",
  monthly_report_delivery: "Месячный отчёт",
  polish_terminal_reminder: "Напоминание о польских продажах",
  choreo_access_expiry_reminder: "Окончание доступа к разбору",
  cohort_closure_post: "Пост о закрытии потока",
  cohort_grace_reminder: "Напоминание Plus о последнем дне библиотеки",
  hub_expiry_reminder: "Напоминание о конце доступа к библиотеке",
  hub_period_start_invite: "Ссылка в библиотеку в день начала",
  online_group_previous_chat_removal: "Удаление из чата прошлого потока",
  purchase_success_email: "Письмо о покупке",
  telegram_access_delivery: "Выдача Telegram-доступа",
};

// Fresh queue items clear themselves within seconds; only items older than
// this need the admin's attention.
const QUEUE_AGE_WARNING_SECONDS = 10 * 60;

const formatQueueAge = (seconds: number | null) => {
  if (seconds === null || seconds <= 0) {
    return "";
  }

  if (seconds < 60) {
    return `${seconds} сек`;
  }

  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} мин`;
  }

  return `${Math.round(seconds / 360) / 10} ч`;
};

const buildQueueSystem = ({
  deadLetters,
  key,
  name,
  problemNoun,
  queue,
}: {
  deadLetters: DeadLetterEntry[];
  key: string;
  name: string;
  problemNoun: string;
  queue: OperationsQueueStatus;
}): SystemHealth => {
  const notes: string[] = [];
  const oldestAge = formatQueueAge(queue.oldestReadyAgeSeconds);
  const isQueueStuck =
    queue.ready > 0 && (queue.oldestReadyAgeSeconds ?? 0) > QUEUE_AGE_WARNING_SECONDS;

  if (queue.staleLeases > 0) {
    notes.push(
      `Задержалось: ${queue.staleLeases}. Обычно проходит само за пару минут. Если число не уменьшается — нажми «Обновить»: задача появится ниже с кнопкой «Повторить».`,
    );
  }

  if (isQueueStuck) {
    notes.push(
      `Ждут обработки: ${queue.ready}, дольше всех — ${oldestAge}. Если так весь день — напиши разработчику.`,
    );
  }

  // The counter is authoritative: the visible list is capped at 20 entries.
  if (deadLetters.length < queue.deadLetters) {
    notes.push(
      `Показаны первые ${deadLetters.length} задач из ${queue.deadLetters}. Повтори видимые и обнови статус — появятся следующие.`,
    );
  }

  const state: SystemState =
    queue.deadLetters > 0 || deadLetters.length > 0
      ? "alert"
      : notes.length > 0
        ? "warn"
        : "ok";
  const detail =
    state === "alert"
      ? `${problemNoun}: ${Math.max(queue.deadLetters, deadLetters.length)}. Ниже можно повторить доставку.`
      : notes.length > 0
        ? "Есть ожидающие задачи. Разверни строку, чтобы посмотреть детали."
        : queue.ready > 0 || queue.working > 0
          ? `Сейчас в обработке: ${queue.ready + queue.working}. Вмешательство не нужно.`
          : "Всё обработано.";

  return {
    deadLetters,
    detail,
    entitlements: [],
    key,
    name,
    notes,
    state,
  };
};

export const buildSystems = (snapshot: OperationsSnapshot): SystemHealth[] => {
  const inboxDeadLetters: DeadLetterEntry[] = snapshot.inboxDeadLetters.map((entry) => ({
    attemptCount: entry.attemptCount,
    deadLetteredAt: entry.deadLetteredAt,
    errorCode: entry.errorCode,
    errorMessage: entry.errorMessage,
    itemKey: entry.stripeEventId,
    queue: "inbox" as const,
    taskLabel: entry.eventType,
    taskMeta: entry.paymentIntentId || entry.stripeEventId,
  }));
  const outboxDeadLetters: DeadLetterEntry[] = snapshot.outboxDeadLetters.map(
    (entry) => ({
      attemptCount: entry.attemptCount,
      deadLetteredAt: entry.deadLetteredAt,
      errorCode: entry.lastErrorCode,
      errorMessage: entry.lastErrorMessage,
      itemKey: entry.deduplicationKey,
      queue: "outbox" as const,
      taskLabel: OUTBOX_KIND_LABELS[entry.kind] ?? entry.kind,
      taskMeta: entry.recipient || entry.deduplicationKey,
    }),
  );
  const problemEntitlements = snapshot.problemEntitlements;
  const linkFailedCount = snapshot.access.linkFailed;
  const manualPendingCount = snapshot.access.manualPending;

  const accessSystem: SystemHealth = {
    deadLetters: [],
    detail:
      linkFailedCount > 0
        ? `Ссылка не создалась: ${linkFailedCount}. Ниже можно перевыпустить.`
        : manualPendingCount > 0
          ? `Ждут ручной выдачи: ${manualPendingCount}. Разверни строку, чтобы посмотреть кому.`
          : snapshot.access.pending > 0
            ? `Выдаётся прямо сейчас: ${snapshot.access.pending}. Вмешательство не нужно.`
            : "Все купленные доступы выданы.",
    entitlements: problemEntitlements,
    key: "access",
    name: "Доступы в Telegram",
    notes: [],
    state: linkFailedCount > 0 ? "alert" : manualPendingCount > 0 ? "warn" : "ok",
  };

  const failedReports = snapshot.reports.failed ?? 0;
  const sentReports = snapshot.reports.sent ?? 0;
  return [
    buildQueueSystem({
      deadLetters: inboxDeadLetters,
      key: "inbox",
      name: "События оплат Stripe",
      problemNoun: "Не обработано",
      queue: snapshot.inbox,
    }),
    buildQueueSystem({
      deadLetters: outboxDeadLetters,
      key: "outbox",
      name: "Письма и уведомления",
      problemNoun: "Не доставлено",
      queue: snapshot.outbox,
    }),
    accessSystem,
    {
      deadLetters: [],
      detail:
        failedReports > 0
          ? `С ошибкой отправки: ${failedReports}. Разверни строку, чтобы узнать, как починить.`
          : `Отправлено за всё время: ${sentReports}.`,
      entitlements: [],
      key: "reports",
      name: "Месячные отчёты",
      notes:
        failedReports > 0
          ? [
              "Открой раздел «Покупки», выбери нужный месяц и нажми «Отправить на почту» — отчёт уйдёт заново.",
            ]
          : [],
      state: failedReports > 0 ? "alert" : "ok",
    },
  ];
};
