import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import type {
  OperationsQueueStatus,
  OperationsSnapshot,
  ProblemAccessEntitlement,
  ReissuedAccessLink,
  StatusMessage,
} from "../lib/admin.types";
import { formatDateTime } from "../lib/admin.utils";
import {
  BroadcastActionButton,
  CardEntityName,
  HealthBanner,
  HealthBannerBody,
  HealthBannerText,
  HealthBannerTitle,
  IconActionButton,
  JournalEmptyState,
  JournalSkeletonCard,
  JournalSkeletonList,
  MonoMeta,
  RecentLinkCard,
  RecentLinkHeader,
  RecentLinkMeta,
  SalesStatusBadge,
  SkeletonLine,
  StatusText,
  SurfaceCard,
  SurfaceDescription,
  SurfaceHeaderRow,
  SurfaceTitle,
  SystemAccordion,
  SystemBody,
  SystemBodyNote,
  SystemDetail,
  SystemInfo,
  SystemList,
  SystemName,
  SystemRow,
  SystemRowStatic,
  SystemSummaryEnd,
  TechDetailRow,
  TechDetails,
  WorkspaceStack,
} from "../page.styles";
import { CopyableLink } from "./copyable-link";

type OperationsWorkspaceProps = {
  copyingUrl: string;
  isLoading: boolean;
  onCopy: (link: string) => void | Promise<void>;
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

const SYSTEM_BADGES: Record<
  SystemState,
  { label: string; state: "blocked" | "closed" | "open" }
> = {
  alert: { label: "Сбой", state: "closed" },
  ok: { label: "Работает", state: "open" },
  warn: { label: "Внимание", state: "blocked" },
};

const OUTBOX_KIND_LABELS: Record<string, string> = {
  admin_telegram_alert: "Telegram-алерт о покупке",
  campaign_email_delivery: "Письмо рассылки",
  google_sheets_export: "Выгрузка в Google Sheets",
  monthly_report_delivery: "Месячный отчет",
  purchase_success_email: "Письмо о покупке",
  successful_customer_export: "Выгрузка покупателя в Sheets",
  telegram_access_delivery: "Выдача Telegram-доступа",
};

const ENTITLEMENT_STATUS_META: Record<
  ProblemAccessEntitlement["status"],
  { label: string; state: "blocked" | "closed" }
> = {
  link_failed: { label: "Ссылка не создалась", state: "closed" },
  manual_pending: { label: "Ждет ручной выдачи", state: "blocked" },
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
      `Зависло в работе: ${queue.staleLeases}. Воркер подберет такие задачи сам — обнови статус через пару минут, и если число не уходит, повтори задачу после появления в списке ниже.`,
    );
  }

  if (isQueueStuck) {
    notes.push(
      `В очереди: ${queue.ready}, самая старая задача ждет ${oldestAge}. Очередь двигается вебхуками и ежедневным обслуживанием — если ожидание растет весь день, что-то не так.`,
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
      ? `${problemNoun}: ${Math.max(queue.deadLetters, deadLetters.length)}. Разверни строку, чтобы повторить доставку.`
      : notes.length > 0
        ? `Есть ожидающие задачи. Разверни строку, чтобы посмотреть детали.`
        : queue.ready > 0 || queue.working > 0
          ? `Сейчас в обработке: ${queue.ready + queue.working}. Вмешательство не нужно.`
          : "Очередь пуста, все обработано.";

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
        ? `Ссылка не создалась: ${linkFailedCount}. Разверни строку, чтобы перевыпустить.`
        : manualPendingCount > 0
          ? `Ждут ручной выдачи: ${manualPendingCount}. Разверни строку, чтобы посмотреть кому.`
          : snapshot.access.pending > 0
            ? `Выдается прямо сейчас: ${snapshot.access.pending}. Вмешательство не нужно.`
            : "Все купленные доступы выданы.",
    entitlements: problemEntitlements,
    key: "access",
    name: "Доступы в Telegram",
    notes: [],
    state: linkFailedCount > 0 ? "alert" : manualPendingCount > 0 ? "warn" : "ok",
  };

  const failedReports = snapshot.reports.failed ?? 0;
  const sentReports = snapshot.reports.sent ?? 0;
  const waitingSheetsExports = snapshot.projection.waitingSheetsExports;

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
      name: "Письма и алерты",
      problemNoun: "Не доставлено",
      queue: snapshot.outbox,
    }),
    accessSystem,
    {
      deadLetters: [],
      detail:
        waitingSheetsExports > 0
          ? `Ждут выгрузки: ${waitingSheetsExports}. Уйдут при ближайшем прогоне.`
          : "Очередь на выгрузку пуста.",
      entitlements: [],
      key: "sheets",
      name: "Выгрузка в Google Sheets",
      notes:
        waitingSheetsExports > 0
          ? [
              "Выгрузка уходит автоматически: ее запускает каждый вебхук оплаты и ежедневное обслуживание. Если число не уменьшается несколько дней, проверь доступ сервисного аккаунта к таблице.",
            ]
          : [],
      state: waitingSheetsExports > 0 ? "warn" : "ok",
    },
    {
      deadLetters: [],
      detail:
        failedReports > 0
          ? `С ошибкой отправки: ${failedReports}. Разверни строку, чтобы узнать, как починить.`
          : `Отправлено за все время: ${sentReports}.`,
      entitlements: [],
      key: "reports",
      name: "Месячные отчеты",
      notes:
        failedReports > 0
          ? [
              "Открой вкладку «Продажи», выбери нужный месяц и нажми «Отправить на почту» — это создаст свежую доставку отчета взамен упавшей.",
            ]
          : [],
      state: failedReports > 0 ? "alert" : "ok",
    },
  ];
};

const OperationsSkeleton = () => (
  <JournalSkeletonList>
    {Array.from({ length: 3 }, (_, index) => (
      <JournalSkeletonCard key={`operations-skeleton-${index}`}>
        <SkeletonLine $width="42%" />
        <SkeletonLine $width="86%" />
        <SkeletonLine $height="32px" $width="100%" />
      </JournalSkeletonCard>
    ))}
  </JournalSkeletonList>
);

export const OperationsWorkspace = ({
  copyingUrl,
  isLoading,
  onCopy,
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
    <IconActionButton
      type="button"
      onClick={onRefresh}
      disabled={isLoading}
      $isLoading={isLoading}
      aria-label="Обновить статус"
      title="Обновить статус"
    >
      {isLoading ? <LoaderCircle aria-hidden /> : <RefreshCw aria-hidden />}
    </IconActionButton>
  );

  if (!snapshot) {
    return (
      <WorkspaceStack>
        <SurfaceCard>
          <SurfaceHeaderRow>
            <SurfaceTitle>Статус систем</SurfaceTitle>
            {refreshButton}
          </SurfaceHeaderRow>
          {isLoading ? (
            <OperationsSkeleton />
          ) : (
            <JournalEmptyState>
              Статус пока не загружен. Нажми «Обновить».
            </JournalEmptyState>
          )}
          {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}
        </SurfaceCard>
      </WorkspaceStack>
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
  const bannerTone: SystemState =
    alertSystems.length > 0 ? "alert" : warnSystems.length > 0 ? "warn" : "ok";
  const bannerTitle =
    bannerTone === "alert"
      ? "Есть сбои — нужно вмешаться"
      : bannerTone === "warn"
        ? "Работает, но есть ожидающие задачи"
        : "Все системы работают штатно";
  const bannerText =
    bannerTone === "ok"
      ? "Оплаты обрабатываются, письма доставлены, доступы выданы."
      : `${[...alertSystems, ...warnSystems]
          .map((system) => system.name)
          .join(", ")} — разверни строку ниже, чтобы увидеть проблему и починить.`;

  return (
    <WorkspaceStack>
      <HealthBanner $tone={bannerTone}>
        <HealthBannerBody>
          {bannerTone === "ok" ? (
            <CircleCheck aria-hidden />
          ) : bannerTone === "warn" ? (
            <TriangleAlert aria-hidden />
          ) : (
            <CircleAlert aria-hidden />
          )}
          <div>
            <HealthBannerTitle>{bannerTitle}</HealthBannerTitle>
            <HealthBannerText>
              {bannerText} Снимок от {formatDateTime(snapshot.capturedAt)}.
            </HealthBannerText>
          </div>
        </HealthBannerBody>
        {refreshButton}
      </HealthBanner>

      {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}

      <SurfaceCard>
        <SurfaceTitle>Системы</SurfaceTitle>
        <SurfaceDescription>
          Строку с пометкой «Сбой» или «Внимание» можно развернуть: внутри — что случилось
          и кнопка починки, если она возможна.
        </SurfaceDescription>
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
                  <SystemName>{system.name}</SystemName>
                  <SystemDetail>{system.detail}</SystemDetail>
                </SystemInfo>
                <SystemSummaryEnd>
                  <SalesStatusBadge $state={badge.state}>{badge.label}</SalesStatusBadge>
                  {hasExpandableContent && <ChevronRight aria-hidden />}
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
                <SystemAccordion>
                  <summary>{header}</summary>
                  <SystemBody>
                    {system.notes.map((note) => (
                      <SystemBodyNote key={note}>{note}</SystemBodyNote>
                    ))}

                    {system.deadLetters.map((entry) => {
                      const isReplaying = replayingKey === entry.itemKey;

                      return (
                        <RecentLinkCard key={`${entry.queue}-${entry.itemKey}`}>
                          <RecentLinkHeader>
                            <CardEntityName>{entry.taskLabel}</CardEntityName>
                            <SalesStatusBadge $state="closed">
                              Попыток: {entry.attemptCount}
                            </SalesStatusBadge>
                          </RecentLinkHeader>
                          <RecentLinkMeta>
                            Ошибка: {entry.errorCode || "неизвестно"}
                            {entry.errorMessage ? ` — ${entry.errorMessage}` : ""}
                          </RecentLinkMeta>
                          {entry.deadLetteredAt && (
                            <RecentLinkMeta>
                              Упала: {formatDateTime(entry.deadLetteredAt)}
                            </RecentLinkMeta>
                          )}
                          <MonoMeta>{entry.taskMeta}</MonoMeta>
                          <BroadcastActionButton
                            type="button"
                            onClick={() => onReplay(entry.queue, entry.itemKey)}
                            disabled={Boolean(replayingKey)}
                          >
                            {isReplaying ? (
                              <LoaderCircle aria-hidden />
                            ) : (
                              <RotateCcw aria-hidden />
                            )}
                            {isReplaying ? "Повторяю..." : "Повторить доставку"}
                          </BroadcastActionButton>
                        </RecentLinkCard>
                      );
                    })}

                    {system.entitlements.map((entitlement) => {
                      const statusMeta = ENTITLEMENT_STATUS_META[entitlement.status];
                      const isReissuing =
                        reissuingPaymentIntentId === entitlement.paymentIntentId;
                      const links = reissuedLinks[entitlement.paymentIntentId] ?? [];

                      return (
                        <RecentLinkCard key={entitlement.entitlementId}>
                          <RecentLinkHeader>
                            <CardEntityName>
                              {entitlement.customerName ||
                                entitlement.customerEmail ||
                                "Без имени"}
                            </CardEntityName>
                            <SalesStatusBadge $state={statusMeta.state}>
                              {statusMeta.label}
                            </SalesStatusBadge>
                          </RecentLinkHeader>
                          {entitlement.customerName && entitlement.customerEmail && (
                            <RecentLinkMeta>{entitlement.customerEmail}</RecentLinkMeta>
                          )}
                          <RecentLinkMeta>
                            {entitlement.productTitle || "Покупка"} | Обновлено:{" "}
                            {formatDateTime(entitlement.updatedAt)}
                          </RecentLinkMeta>
                          <MonoMeta>{entitlement.paymentIntentId}</MonoMeta>
                          {entitlement.status === "link_failed" ? (
                            <BroadcastActionButton
                              type="button"
                              onClick={() => onReissueAccess(entitlement.paymentIntentId)}
                              disabled={Boolean(reissuingPaymentIntentId)}
                            >
                              {isReissuing ? (
                                <LoaderCircle aria-hidden />
                              ) : (
                                <RotateCcw aria-hidden />
                              )}
                              {isReissuing ? "Перевыпускаю..." : "Перевыпустить ссылку"}
                            </BroadcastActionButton>
                          ) : (
                            <RecentLinkMeta>
                              Для этого тарифа доступ выдается вручную — например, через
                              раздел Online Group.
                            </RecentLinkMeta>
                          )}
                          {links.map((link) => (
                            <div key={`${entitlement.entitlementId}-${link.accessKey}`}>
                              <RecentLinkMeta>
                                {link.label}
                                {link.tokenExpiresAt
                                  ? ` | Действует до: ${formatDateTime(link.tokenExpiresAt)}`
                                  : ""}
                              </RecentLinkMeta>
                              <CopyableLink
                                isCopying={copyingUrl === link.accessUrl}
                                link={link.accessUrl}
                                onCopy={onCopy}
                              />
                            </div>
                          ))}
                        </RecentLinkCard>
                      );
                    })}

                    {showsHealedLinks &&
                      healedReissuedLinks.map(([paymentIntentId, links]) => (
                        <RecentLinkCard key={`healed-${paymentIntentId}`}>
                          <RecentLinkHeader>
                            <CardEntityName>Ссылки перевыпущены</CardEntityName>
                            <SalesStatusBadge $state="open">Готово</SalesStatusBadge>
                          </RecentLinkHeader>
                          <RecentLinkMeta>
                            Доступ восстановлен — скопируй ссылки и отправь покупателю
                            (или переотправь письмо со вкладки «Продажи»).
                          </RecentLinkMeta>
                          <MonoMeta>{paymentIntentId}</MonoMeta>
                          {links.map((link) => (
                            <div key={`healed-${paymentIntentId}-${link.accessKey}`}>
                              <RecentLinkMeta>
                                {link.label}
                                {link.tokenExpiresAt
                                  ? ` | Действует до: ${formatDateTime(link.tokenExpiresAt)}`
                                  : ""}
                              </RecentLinkMeta>
                              <CopyableLink
                                isCopying={copyingUrl === link.accessUrl}
                                link={link.accessUrl}
                                onCopy={onCopy}
                              />
                            </div>
                          ))}
                        </RecentLinkCard>
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
          <TechDetailRow>
            <span>Задач в работе прямо сейчас</span>
            <span>
              события: {snapshot.inbox.working} · письма: {snapshot.outbox.working}
            </span>
          </TechDetailRow>
          <TechDetailRow>
            <span>Доставлено не с первой попытки</span>
            <span>
              события: {snapshot.inbox.retries} · письма: {snapshot.outbox.retries}
            </span>
          </TechDetailRow>
          <TechDetailRow>
            <span>Исторические события без подписи (наследие миграции, не влияет)</span>
            <span>{snapshot.projection.unverifiedEvents}</span>
          </TechDetailRow>
          <TechDetailRow>
            <span>Обработанные события без привязки к покупке</span>
            <span>{snapshot.projection.unlinkedProcessedEvents}</span>
          </TechDetailRow>
        </TechDetails>
      </SurfaceCard>
    </WorkspaceStack>
  );
};
