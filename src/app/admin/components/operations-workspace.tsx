import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";

import type {
  OperationsQueueStatus,
  OperationsSnapshot,
  ProblemAccessEntitlement,
  ReissuedAccessLink,
  StatusMessage,
} from "../lib/admin.types";
import { formatDateTime } from "../lib/admin.utils";
import {
  ItemCard,
  ItemHead,
  ItemMeta,
  LinkCaption,
  SystemAccordion,
  SystemBody,
  SystemInfo,
  SystemList,
  SystemRow,
  SystemRowStatic,
  SystemSummaryEnd,
  TechDetails,
} from "../styles/operations.styles";
import type { AdminTone } from "../styles/tokens.styles";
import { CopyField } from "../ui/copy";
import { StatusLine } from "../ui/forms";
import {
  AdminButton,
  Badge,
  Callout,
  EmptyState,
  Mono,
  Panel,
  Skeleton,
  Stack,
} from "../ui/primitives";
import { CellPrimary, CellSecondary, DataTable, TableScroller } from "../ui/table";

type OperationsWorkspaceProps = {
  isLoading: boolean;
  onRefresh: () => void | Promise<void>;
  onReissueAccess: (paymentIntentId: string) => void | Promise<void>;
  onReplay: (queue: "inbox" | "outbox", key: string) => void | Promise<void>;
  reissuedLinks: Record<string, ReissuedAccessLink[]>;
  reissuingPaymentIntentId: string;
  replayingKey: string;
  snapshot: OperationsSnapshot | null;
  status: StatusMessage;
};

type SystemState = "alert" | "ok" | "warn";

type DeadLetterEntry = {
  attemptCount: number;
  deadLetteredAt: string;
  errorCode: string;
  errorMessage: string;
  itemKey: string;
  queue: "inbox" | "outbox";
  taskLabel: string;
  taskMeta: string;
};

type SystemHealth = {
  deadLetters: DeadLetterEntry[];
  detail: string;
  entitlements: ProblemAccessEntitlement[];
  key: string;
  name: string;
  notes: string[];
  state: SystemState;
};

const SYSTEM_BADGES: Record<SystemState, { label: string; tone: AdminTone }> = {
  alert: { label: "Сбой", tone: "danger" },
  ok: { label: "Работает", tone: "success" },
  warn: { label: "Внимание", tone: "warning" },
};

const OUTBOX_KIND_LABELS: Record<string, string> = {
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

const ENTITLEMENT_STATUS_META: Record<
  ProblemAccessEntitlement["status"],
  { label: string; tone: AdminTone }
> = {
  link_failed: { label: "Ссылка не создалась", tone: "danger" },
  manual_pending: { label: "Ждёт ручной выдачи", tone: "warning" },
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

const buildSystems = (snapshot: OperationsSnapshot): SystemHealth[] => {
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

const BANNER: Record<SystemState, { icon: ReactNode; title: string; tone: AdminTone }> = {
  alert: {
    icon: <CircleAlert aria-hidden />,
    title: "Есть сбои — нужно вмешаться",
    tone: "danger",
  },
  ok: {
    icon: <CircleCheck aria-hidden />,
    title: "Все системы работают штатно",
    tone: "success",
  },
  warn: {
    icon: <TriangleAlert aria-hidden />,
    title: "Работает, но есть ожидающие задачи",
    tone: "warning",
  },
};

const ReissuedLinks = ({ links }: { links: ReissuedAccessLink[] }) => (
  <Stack $gap={8}>
    {links.map((link) => (
      <div key={link.accessKey}>
        <CopyField label={link.label || "Ссылка"} value={link.accessUrl} />
        {link.tokenExpiresAt && (
          <LinkCaption>
            Войти по ссылке можно до {formatDateTime(link.tokenExpiresAt)}
          </LinkCaption>
        )}
      </div>
    ))}
  </Stack>
);

const DeadLetterTable = ({
  entries,
  onReplay,
  replayingKey,
}: {
  entries: DeadLetterEntry[];
  onReplay: OperationsWorkspaceProps["onReplay"];
  replayingKey: string;
}) => (
  <TableScroller>
    <DataTable>
      <thead>
        <tr>
          <th scope="col">Задача</th>
          <th scope="col">Ошибка</th>
          <th scope="col">Когда</th>
          <th scope="col">Попыток</th>
          <th scope="col" aria-label="Действие" />
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const isReplaying = replayingKey === entry.itemKey;
          return (
            <tr key={`${entry.queue}-${entry.itemKey}`}>
              <td data-label="Задача">
                <CellPrimary>{entry.taskLabel}</CellPrimary>
                <Mono>{entry.taskMeta}</Mono>
              </td>
              <td data-label="Ошибка">
                <CellSecondary>
                  {entry.errorCode || "неизвестно"}
                  {entry.errorMessage ? ` — ${entry.errorMessage}` : ""}
                </CellSecondary>
              </td>
              <td data-label="Когда">
                {entry.deadLetteredAt ? formatDateTime(entry.deadLetteredAt) : "—"}
              </td>
              <td data-label="Попыток">
                <Badge $tone="danger">{entry.attemptCount}</Badge>
              </td>
              <td data-actions>
                <AdminButton
                  size="sm"
                  icon={<RotateCcw aria-hidden />}
                  loading={isReplaying}
                  disabled={Boolean(replayingKey) && !isReplaying}
                  onClick={() => void onReplay(entry.queue, entry.itemKey)}
                >
                  {isReplaying ? "Повторяю…" : "Повторить"}
                </AdminButton>
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  </TableScroller>
);

export const OperationsWorkspace = ({
  isLoading,
  onRefresh,
  onReissueAccess,
  onReplay,
  reissuedLinks,
  reissuingPaymentIntentId,
  replayingKey,
  snapshot,
  status,
}: OperationsWorkspaceProps) => {
  const refreshButton = (
    <AdminButton
      size="sm"
      icon={<RefreshCw aria-hidden />}
      loading={isLoading}
      onClick={() => void onRefresh()}
    >
      Обновить
    </AdminButton>
  );

  if (!snapshot) {
    return (
      <Stack $gap={16}>
        <StatusLine status={status} />
        <Panel title="Статус систем" actions={refreshButton}>
          {isLoading ? (
            <Stack $gap={12}>
              <Skeleton $height={44} />
              <Skeleton $height={44} />
              <Skeleton $height={44} />
            </Stack>
          ) : (
            <EmptyState
              title="Статус пока не загружен"
              text="Нажми «Обновить», чтобы проверить оплаты, письма и доступы."
            />
          )}
        </Panel>
      </Stack>
    );
  }

  const systems = buildSystems(snapshot);
  // Links issued for entitlements that have since healed: their problem card is
  // gone from the list, but the admin still needs to copy the URLs somewhere.
  const healedReissuedLinks = Object.entries(reissuedLinks).filter(
    ([paymentIntentId, links]) =>
      links.length > 0 &&
      !snapshot.problemEntitlements.some(
        (entitlement) => entitlement.paymentIntentId === paymentIntentId,
      ),
  );
  const alertSystems = systems.filter((system) => system.state === "alert");
  const warnSystems = systems.filter((system) => system.state === "warn");
  const bannerState: SystemState =
    alertSystems.length > 0 ? "alert" : warnSystems.length > 0 ? "warn" : "ok";
  const banner = BANNER[bannerState];
  const bannerText =
    bannerState === "ok"
      ? "Оплаты обрабатываются, письма доставлены, доступы выданы."
      : `${[...alertSystems, ...warnSystems]
          .map((system) => system.name)
          .join(", ")} — подробности и починка в строке ниже.`;

  return (
    <Stack $gap={16}>
      <Callout tone={banner.tone} icon={banner.icon} title={banner.title}>
        {bannerText} Проверено в {formatDateTime(snapshot.capturedAt)}.
      </Callout>

      <StatusLine status={status} />

      <Panel
        title="Системы"
        description="Строки со сбоем раскрыты сразу; «Внимание» раскрывается по нажатию. Внутри — что случилось и кнопка починки, если она возможна."
        actions={refreshButton}
      >
        <SystemList>
          {systems.map((system) => {
            const badge = SYSTEM_BADGES[system.state];
            const showsHealedLinks =
              system.key === "access" && healedReissuedLinks.length > 0;
            const hasExpandableContent =
              system.deadLetters.length > 0 ||
              system.entitlements.length > 0 ||
              system.notes.length > 0 ||
              showsHealedLinks;
            const header = (
              <>
                <SystemInfo>
                  <strong>{system.name}</strong>
                  <span>{system.detail}</span>
                </SystemInfo>
                <SystemSummaryEnd>
                  <Badge $tone={badge.tone}>{badge.label}</Badge>
                  {hasExpandableContent && <ChevronRight aria-hidden data-chevron />}
                </SystemSummaryEnd>
              </>
            );

            if (!hasExpandableContent) {
              return (
                <SystemRow key={system.key}>
                  <SystemRowStatic>{header}</SystemRowStatic>
                </SystemRow>
              );
            }

            return (
              <SystemRow key={system.key}>
                <SystemAccordion open={system.state === "alert" || showsHealedLinks}>
                  <summary>{header}</summary>
                  <SystemBody>
                    {system.notes.map((note) => (
                      <Callout key={note} tone="info">
                        {note}
                      </Callout>
                    ))}

                    {system.deadLetters.length > 0 && (
                      <DeadLetterTable
                        entries={system.deadLetters}
                        onReplay={onReplay}
                        replayingKey={replayingKey}
                      />
                    )}

                    {system.entitlements.map((entitlement) => {
                      const statusMeta = ENTITLEMENT_STATUS_META[entitlement.status];
                      const isReissuing =
                        reissuingPaymentIntentId === entitlement.paymentIntentId;
                      const links = reissuedLinks[entitlement.paymentIntentId] ?? [];

                      return (
                        <ItemCard key={entitlement.entitlementId}>
                          <ItemHead>
                            <strong>
                              {entitlement.customerName ||
                                entitlement.customerEmail ||
                                "Без имени"}
                            </strong>
                            <Badge $tone={statusMeta.tone}>{statusMeta.label}</Badge>
                          </ItemHead>
                          {entitlement.customerName && entitlement.customerEmail && (
                            <ItemMeta>{entitlement.customerEmail}</ItemMeta>
                          )}
                          <ItemMeta>
                            {entitlement.productTitle || "Покупка"} · обновлено{" "}
                            {formatDateTime(entitlement.updatedAt)}
                          </ItemMeta>
                          <Mono>{entitlement.paymentIntentId}</Mono>
                          {entitlement.status === "link_failed" ? (
                            <div>
                              <AdminButton
                                size="sm"
                                variant="primary"
                                icon={<RotateCcw aria-hidden />}
                                loading={isReissuing}
                                disabled={
                                  Boolean(reissuingPaymentIntentId) && !isReissuing
                                }
                                onClick={() =>
                                  void onReissueAccess(entitlement.paymentIntentId)
                                }
                              >
                                {isReissuing ? "Перевыпускаю…" : "Перевыпустить ссылку"}
                              </AdminButton>
                            </div>
                          ) : (
                            <ItemMeta>
                              Выдай доступ в Online Group → «Ручной доступ».
                            </ItemMeta>
                          )}
                          {links.length > 0 && <ReissuedLinks links={links} />}
                        </ItemCard>
                      );
                    })}

                    {showsHealedLinks &&
                      healedReissuedLinks.map(([paymentIntentId, links]) => (
                        <ItemCard key={`healed-${paymentIntentId}`}>
                          <ItemHead>
                            <strong>Ссылки перевыпущены</strong>
                            <Badge $tone="success">Готово</Badge>
                          </ItemHead>
                          <ItemMeta>
                            Доступ восстановлен — скопируй ссылки и отправь покупателю
                            (или переотправь письмо в разделе «Покупки»).
                          </ItemMeta>
                          <Mono>{paymentIntentId}</Mono>
                          <ReissuedLinks links={links} />
                        </ItemCard>
                      ))}
                  </SystemBody>
                </SystemAccordion>
              </SystemRow>
            );
          })}
        </SystemList>

        <TechDetails>
          <summary>
            <ChevronRight aria-hidden />
            Технические детали
          </summary>
          <dl>
            <div>
              <dt>Задач в работе прямо сейчас</dt>
              <dd>
                события: {snapshot.inbox.working} · письма: {snapshot.outbox.working}
              </dd>
            </div>
            <div>
              <dt>Доставлено не с первой попытки</dt>
              <dd>
                события: {snapshot.inbox.retries} · письма: {snapshot.outbox.retries}
              </dd>
            </div>
            <div>
              <dt>Старые события, до переезда сайта (ни на что не влияют)</dt>
              <dd>{snapshot.projection.unverifiedEvents}</dd>
            </div>
            <div>
              <dt>Обработанные события без привязки к покупке</dt>
              <dd>{snapshot.projection.unlinkedProcessedEvents}</dd>
            </div>
          </dl>
        </TechDetails>
      </Panel>
    </Stack>
  );
};
