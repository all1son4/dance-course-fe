import { Check, ChevronRight, EyeOff, RefreshCw, RotateCcw } from "lucide-react";
import styled from "styled-components";

import type {
  OperationsEventGroup,
  OperationsSnapshot,
  ProblemAccessEntitlement,
  ReissuedAccessLink,
  StatusMessage,
} from "../lib/admin.types";
import { formatDateTime } from "../lib/admin.utils";
import {
  buildSystems,
  type DeadLetterEntry,
  type SystemState,
} from "../lib/operations-view";
import {
  ItemCard,
  ItemHead,
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
  Meta,
  Mono,
  Panel,
  Skeleton,
  Stack,
} from "../ui/primitives";
import { CellPrimary, CellSecondary, DataTable, TableScroller } from "../ui/table";

const JournalAreaTitle = styled.h3`
  margin: 0;
  color: var(--a-ink-3);
  font-size: var(--a-text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

/* The code and record on the left, the action on the right; they wrap on a phone. */
const JournalFoot = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 12px;
  min-width: 0;

  > :first-child {
    min-width: 0;
    overflow-wrap: anywhere;
  }
`;

type OperationsWorkspaceProps = {
  isLoading: boolean;
  onRefresh: () => void | Promise<void>;
  onReissueAccess: (paymentIntentId: string) => void | Promise<void>;
  onReplay: (queue: "inbox" | "outbox", key: string) => void | Promise<void>;
  onTidy: (
    body:
      | { action: "archive_event"; area: string; code: string; event: string }
      | { action: "dismiss_dead_letter"; key: string; queue: "inbox" | "outbox" },
    done: string,
  ) => void | Promise<void>;
  reissuedLinks: Record<string, ReissuedAccessLink[]>;
  reissuingPaymentIntentId: string;
  replayingKey: string;
  snapshot: OperationsSnapshot | null;
  status: StatusMessage;
};

const SYSTEM_BADGES: Record<SystemState, { label: string; tone: AdminTone }> = {
  alert: { label: "Сбой", tone: "danger" },
  ok: { label: "Работает", tone: "success" },
  warn: { label: "Внимание", tone: "warning" },
};

const ENTITLEMENT_STATUS_META: Record<
  ProblemAccessEntitlement["status"],
  { label: string; tone: AdminTone }
> = {
  link_failed: { label: "Ссылка не создалась", tone: "danger" },
  manual_pending: { label: "Ждёт ручной выдачи", tone: "warning" },
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

/** A purchase whose Telegram access needs a hand: the reissue button, or where to go. */
const EntitlementCard = ({
  entitlement,
  links,
  onReissueAccess,
  reissuingPaymentIntentId,
}: {
  entitlement: ProblemAccessEntitlement;
  links: ReissuedAccessLink[];
  onReissueAccess: OperationsWorkspaceProps["onReissueAccess"];
  reissuingPaymentIntentId: string;
}) => {
  const statusMeta = ENTITLEMENT_STATUS_META[entitlement.status];
  const isReissuing = reissuingPaymentIntentId === entitlement.paymentIntentId;

  return (
    <ItemCard>
      <ItemHead>
        <strong>
          {entitlement.customerName || entitlement.customerEmail || "Без имени"}
        </strong>
        <Badge $tone={statusMeta.tone}>{statusMeta.label}</Badge>
      </ItemHead>
      {entitlement.customerName && entitlement.customerEmail && (
        <Meta>{entitlement.customerEmail}</Meta>
      )}
      <Meta>
        {entitlement.productTitle || "Покупка"} · обновлено{" "}
        {formatDateTime(entitlement.updatedAt)}
      </Meta>
      <Mono>{entitlement.paymentIntentId}</Mono>
      {entitlement.status === "link_failed" ? (
        <div>
          <AdminButton
            size="sm"
            variant="primary"
            icon={<RotateCcw aria-hidden />}
            loading={isReissuing}
            disabled={Boolean(reissuingPaymentIntentId) && !isReissuing}
            onClick={() => void onReissueAccess(entitlement.paymentIntentId)}
          >
            {isReissuing ? "Перевыпускаю…" : "Перевыпустить ссылку"}
          </AdminButton>
        </div>
      ) : (
        <Meta>Выдай доступ в Online Group → «Приглашения».</Meta>
      )}
      {links.length > 0 && <ReissuedLinks links={links} />}
    </ItemCard>
  );
};

const DeadLetterTable = ({
  entries,
  onReplay,
  onTidy,
  replayingKey,
}: {
  entries: DeadLetterEntry[];
  onReplay: OperationsWorkspaceProps["onReplay"];
  onTidy: OperationsWorkspaceProps["onTidy"];
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
                <AdminButton
                  size="sm"
                  variant="ghost"
                  icon={<Check aria-hidden />}
                  disabled={Boolean(replayingKey)}
                  onClick={() =>
                    void onTidy(
                      {
                        action: "dismiss_dead_letter",
                        key: entry.itemKey,
                        queue: entry.queue,
                      },
                      "Отмечено как решённое — задача ушла из тревог.",
                    )
                  }
                >
                  Решено
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
  onTidy,
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
  return (
    <Stack $gap={16}>
      <StatusLine status={status} />

      <Panel
        title="Что нужно починить"
        description={`Строки со сбоем раскрыты сразу; внутри — что случилось и кнопка починки. Проверено в ${formatDateTime(snapshot.capturedAt)}.`}
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
                        onTidy={onTidy}
                        replayingKey={replayingKey}
                      />
                    )}

                    {system.entitlements.map((entitlement) => (
                      <EntitlementCard
                        entitlement={entitlement}
                        key={entitlement.entitlementId}
                        links={reissuedLinks[entitlement.paymentIntentId] ?? []}
                        onReissueAccess={onReissueAccess}
                        reissuingPaymentIntentId={reissuingPaymentIntentId}
                      />
                    ))}

                    {showsHealedLinks &&
                      healedReissuedLinks.map(([paymentIntentId, links]) => (
                        <ItemCard key={`healed-${paymentIntentId}`}>
                          <ItemHead>
                            <strong>Ссылки перевыпущены</strong>
                            <Badge $tone="success">Готово</Badge>
                          </ItemHead>
                          <Meta>
                            Доступ восстановлен — скопируй ссылки и отправь покупателю
                            (или переотправь письмо в разделе «Покупки»).
                          </Meta>
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

      <EventJournal events={snapshot.events ?? []} onTidy={onTidy} />
    </Stack>
  );
};

const AREA_TITLES: Record<OperationsEventGroup["area"], string> = {
  telegram: "Telegram",
  stripe: "Stripe",
  email: "Письма",
  database: "База данных",
  app: "Сайт",
};
const AREA_ORDER: OperationsEventGroup["area"][] = [
  "telegram",
  "stripe",
  "email",
  "database",
  "app",
];

/**
 * «Журнал событий»: what broke in the last 30 days, by where it broke. Same event
 * and code of one day are one line with a count; «Убрать» hides it until it recurs.
 */
const EventJournal = ({
  events,
  onTidy,
}: {
  events: OperationsEventGroup[];
  onTidy: OperationsWorkspaceProps["onTidy"];
}) => (
  <Panel
    title="Журнал событий"
    description="Сбои за 30 дней по местам, где они случились. Одинаковые собраны в одну строку со счётчиком; «Убрать» скрывает строку до следующего раза. Хранится 90 дней."
  >
    {events.length === 0 ? (
      <EmptyState title="За 30 дней сбоев не было" />
    ) : (
      <Stack $gap={18}>
        {AREA_ORDER.flatMap((area) => {
          const group = events.filter((event) => event.area === area);
          if (group.length === 0) return [];
          return [
            <Stack $gap={8} key={area}>
              <JournalAreaTitle>
                {AREA_TITLES[area]} · {group.length}
              </JournalAreaTitle>
              {group.map((event) => (
                <ItemCard key={`${event.event}|${event.code}`}>
                  <ItemHead>
                    <strong>{event.title}</strong>
                    <Badge $tone={event.severity === "error" ? "danger" : "warning"}>
                      {event.occurrences > 1 ? `×${event.occurrences}` : "1 раз"}
                    </Badge>
                  </ItemHead>
                  <Meta>{event.explanation}</Meta>
                  <Meta>
                    {event.days > 1
                      ? `${event.days} дн. · с ${formatDateTime(event.firstSeenAt)} · последний раз ${formatDateTime(event.lastSeenAt)}`
                      : `Последний раз ${formatDateTime(event.lastSeenAt)}`}
                  </Meta>
                  <JournalFoot>
                    <Mono>
                      {[event.code, event.lastReference].filter(Boolean).join(" · ")}
                    </Mono>
                    <AdminButton
                      size="sm"
                      variant="ghost"
                      icon={<EyeOff aria-hidden />}
                      onClick={() =>
                        void onTidy(
                          {
                            action: "archive_event",
                            area: event.area,
                            code: event.code,
                            event: event.event,
                          },
                          "Строка убрана — вернётся, если случится снова.",
                        )
                      }
                    >
                      Убрать
                    </AdminButton>
                  </JournalFoot>
                </ItemCard>
              ))}
            </Stack>,
          ];
        })}
      </Stack>
    )}
  </Panel>
);
