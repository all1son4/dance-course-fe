import {
  ArrowRight,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  LibraryBig,
  Link2,
  Receipt,
  RefreshCw,
  Store,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import styled from "styled-components";

import type { AdminOverview } from "@/lib/admin/overview";

import type { AdminFeatureId } from "../lib/admin.types";
import {
  AdminButton,
  Callout,
  EmptyState,
  PageHeader,
  Panel,
  Skeleton,
  Stack,
  StatTile,
  TileGrid,
} from "../ui/primitives";
import { AttentionList } from "./attention-list";

const Columns = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;

  @container admin-content (max-width: 900px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const List = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const EventRow = styled.li`
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--a-border);

  &:first-child {
    border-top: 0;
    padding-top: 2px;
  }
`;

const DateBadge = styled.span`
  display: grid;
  justify-items: center;
  padding: 5px 0;
  border-radius: 10px;
  background: var(--a-surface-sunken);
  line-height: 1.1;

  b {
    font-size: var(--a-text-lg);
    font-weight: 700;
  }

  small {
    color: var(--a-ink-2);
    font-size: 11px;
  }
`;

const QuickGrid = styled.div`
  display: grid;
  gap: 8px;

  button {
    justify-content: flex-start;
  }
`;

const formatDay = (iso: string) => {
  const date = new Date(iso);
  return {
    day: new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      timeZone: "Europe/Warsaw",
    }).format(date),
    month: new Intl.DateTimeFormat("ru-RU", { month: "short", timeZone: "Europe/Warsaw" })
      .format(date)
      .replace(".", ""),
  };
};

const formatUpdated = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(new Date(iso));

type OverviewWorkspaceProps = {
  failed: boolean;
  isLoading: boolean;
  onNavigate: (view: AdminFeatureId) => void;
  onRefresh: () => void | Promise<void>;
  overview: AdminOverview | null;
};

export const OverviewWorkspace = ({
  failed,
  isLoading,
  onNavigate,
  onRefresh,
  overview,
}: OverviewWorkspaceProps) => {
  const metrics = overview?.metrics;

  return (
    <Stack $gap={20}>
      <PageHeader
        title="Обзор"
        description={
          overview
            ? `Обновлено в ${formatUpdated(overview.generatedAt)} по Варшаве`
            : "Собираю данные со всех разделов…"
        }
        actions={
          <AdminButton
            icon={<RefreshCw aria-hidden />}
            loading={isLoading}
            onClick={() => void onRefresh()}
          >
            Обновить
          </AdminButton>
        }
      />

      {failed && overview && (
        <Callout tone="warning" title="Обзор не обновился">
          Показаны данные прошлой загрузки. Нажми «Обновить» через минуту.
        </Callout>
      )}

      {failed && !overview && (
        <Panel>
          <EmptyState
            icon={<CircleAlert aria-hidden />}
            title="Не удалось загрузить обзор"
            text="Остальные разделы работают. Попробуй обновить через минуту."
            action={<AdminButton onClick={() => void onRefresh()}>Обновить</AdminButton>}
          />
        </Panel>
      )}

      <TileGrid>
        {metrics ? (
          <>
            <StatTile
              icon={<TrendingUp aria-hidden />}
              label={`Выручка за ${metrics.sales.monthLabel}`}
              value={metrics.sales.monthGross}
              hint={
                metrics.sales.deltaPercent === null
                  ? `${metrics.sales.monthCount} продаж`
                  : `${metrics.sales.deltaPercent > 0 ? "+" : ""}${metrics.sales.deltaPercent}% к тем же дням прошлого месяца`
              }
              hintTone={
                metrics.sales.deltaPercent === null
                  ? undefined
                  : metrics.sales.deltaPercent >= 0
                    ? "success"
                    : "danger"
              }
              onClick={() => onNavigate("purchases")}
            />
            <StatTile
              icon={<Receipt aria-hidden />}
              label="Продаж за 7 дней"
              value={metrics.sales.weekCount}
              hint={`${metrics.sales.monthCount} с начала месяца`}
              onClick={() => onNavigate("purchases")}
            />
            <StatTile
              icon={<UsersRound aria-hidden />}
              label={metrics.cohort?.title ?? "Online Group"}
              value={metrics.cohort ? metrics.cohort.purchases : "—"}
              hint={
                metrics.cohort
                  ? `Plus ${metrics.cohort.plus} · Standard ${metrics.cohort.purchases - metrics.cohort.plus}`
                  : "Потоков пока нет"
              }
              onClick={() => onNavigate("online-group")}
            />
            <StatTile
              icon={<LibraryBig aria-hidden />}
              label="Периодов хаба идёт"
              value={metrics.hub.active}
              hint={
                metrics.hub.endingSoon > 0
                  ? `${metrics.hub.endingSoon} закончатся за 7 дней`
                  : metrics.hub.scheduled > 0
                    ? `${metrics.hub.scheduled} начнутся позже`
                    : "Ничего не заканчивается на неделе"
              }
              hintTone={metrics.hub.endingSoon > 0 ? "warning" : undefined}
              onClick={() => onNavigate("inspiration-hub")}
            />
          </>
        ) : (
          Array.from({ length: 4 }, (_, index) => (
            <Panel key={index}>
              <Stack $gap={10}>
                <Skeleton $width="55%" />
                <Skeleton $height={26} $width="40%" />
                <Skeleton $width="70%" />
              </Stack>
            </Panel>
          ))
        )}
      </TileGrid>

      <Columns>
        <Panel
          title={
            overview && overview.attention.length > 0
              ? `Требует внимания · ${overview.attention.length}`
              : "Требует внимания"
          }
          description="Всё, что система не смогла решить сама, из всех разделов."
        >
          {!overview ? (
            <Stack $gap={12}>
              <Skeleton $height={40} />
              <Skeleton $height={40} />
            </Stack>
          ) : overview.attention.length === 0 ? (
            <EmptyState
              icon={<CircleCheck aria-hidden style={{ color: "var(--a-success)" }} />}
              title="Всё в порядке"
              text="Оплаты, письма, доступы и потоки работают без вмешательства."
            />
          ) : (
            <AttentionList
              items={overview.attention}
              onFixed={() => void onRefresh()}
              onNavigate={onNavigate}
            />
          )}
        </Panel>

        <Stack $gap={16}>
          <Panel title="Ближайшие события" description="Следующие три недели.">
            {!overview ? (
              <Skeleton $height={40} />
            ) : overview.events.length === 0 ? (
              <EmptyState
                icon={<CalendarClock aria-hidden />}
                title="Ничего не запланировано"
                text="Здесь появятся старты потоков и окончания доступа."
              />
            ) : (
              <List>
                {overview.events.map((event) => {
                  const { day, month } = formatDay(event.at);
                  return (
                    <EventRow key={event.id}>
                      <DateBadge aria-label={`${day} ${month}`}>
                        <b>{day}</b>
                        <small>{month}</small>
                      </DateBadge>
                      <span>{event.title}</span>
                      <AdminButton
                        size="sm"
                        variant="ghost"
                        aria-label={`Открыть: ${event.title}`}
                        icon={<ArrowRight aria-hidden />}
                        onClick={() => onNavigate(event.view)}
                      />
                    </EventRow>
                  );
                })}
              </List>
            )}
          </Panel>

          <Panel title="Быстрые действия">
            <QuickGrid>
              <AdminButton
                icon={<Link2 aria-hidden />}
                onClick={() => onNavigate("invite-links")}
              >
                Выдать ссылку
              </AdminButton>
              <AdminButton
                icon={<Store aria-hidden />}
                onClick={() => onNavigate("sales")}
              >
                Продажи вкл/выкл
              </AdminButton>
              <AdminButton
                icon={<Receipt aria-hidden />}
                onClick={() => onNavigate("purchases")}
              >
                Отчёт за месяц
              </AdminButton>
              <AdminButton
                icon={<UsersRound aria-hidden />}
                onClick={() => onNavigate("online-group")}
              >
                Потоки
              </AdminButton>
            </QuickGrid>
          </Panel>
        </Stack>
      </Columns>
    </Stack>
  );
};
