import {
  CalendarClock,
  CircleAlert,
  LibraryBig,
  Link2,
  RefreshCw,
  Search,
  Store,
  TriangleAlert,
  UserMinus,
} from "lucide-react";
import { useMemo, useState } from "react";
import styled from "styled-components";

import type { HubAdminOverview, HubPeriodState } from "@/lib/admin/hub-admin";

import type { ReissuedLink, ReissueOutcome } from "../hooks/use-hub-admin";
import type { AdminFeatureId } from "../lib/admin.types";
import type { AdminTone } from "../styles/tokens.styles";
import { CopyField } from "../ui/copy";
import { TextField, useToast } from "../ui/feedback";
import {
  AdminButton,
  Badge,
  Callout,
  EmptyState,
  Muted,
  PageHeader,
  Panel,
  Row,
  SegmentedTabs,
  Skeleton,
  Stack,
  StatTile,
  TileGrid,
} from "../ui/primitives";
import { CellPrimary, CellSecondary, DataTable, TableScroller } from "../ui/table";
import { BotRightsCheck } from "./bot-rights-check";

const STATE_LABELS: Record<HubPeriodState, { label: string; tone: AdminTone }> = {
  active: { label: "Идёт", tone: "success" },
  ended: { label: "Закончился", tone: "neutral" },
  scheduled: { label: "Начнётся", tone: "info" },
  waiting: { label: "После потока", tone: "info" },
};

type Filter = "all" | "active" | "endingSoon" | "upcoming" | "ended";

/** The same 7-day window as the overview counts (ENDING_SOON_DAYS in hub-admin.ts). */
const ENDING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

const Columns = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;

  @container admin-content (max-width: 900px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const RemovalList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    border-top: 1px solid var(--a-border);
  }

  li:first-child {
    border-top: 0;
  }

  svg {
    width: 16px;
    height: 16px;
    color: var(--a-ink-3);
  }
`;

const SearchBox = styled.div`
  position: relative;
  flex: 1 1 220px;
  max-width: 320px;

  svg {
    position: absolute;
    left: 11px;
    top: 50%;
    width: 15px;
    height: 15px;
    transform: translateY(-50%);
    color: var(--a-ink-3);
  }

  input {
    padding-left: 32px;
  }

  @media (max-width: 640px) {
    max-width: none;
  }
`;

const formatDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Europe/Warsaw",
      }).format(new Date(iso))
    : "";

const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(new Date(iso));

const toDateInput = (iso: string) => iso.slice(0, 10);

type HubWorkspaceProps = {
  failed: boolean;
  hub: HubAdminOverview | null;
  isLoading: boolean;
  onNavigate: (view: AdminFeatureId) => void;
  onOpenPurchase: (paymentIntentId: string) => void;
  onPreviewAtChange: (value: string) => void;
  onRefresh: () => void;
  onReissue: (paymentIntentId: string) => Promise<ReissueOutcome>;
  onUnauthorized: () => void;
  previewAt: string;
  reissued: Record<string, ReissuedLink[] | "none">;
  reissuing: string;
};

export const HubWorkspace = ({
  failed,
  hub,
  isLoading,
  onNavigate,
  onOpenPurchase,
  onPreviewAtChange,
  onRefresh,
  onReissue,
  onUnauthorized,
  previewAt,
  reissued,
  reissuing,
}: HubWorkspaceProps) => {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const periods = useMemo(() => {
    const needle = search.trim().toLowerCase();
    // Counted from the moment the server built the overview, like the tile itself.
    const endingSoonBefore = Date.parse(hub?.generatedAt ?? "") + ENDING_SOON_MS;
    return (hub?.periods ?? []).filter((period) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "active" && period.state === "active") ||
        (filter === "endingSoon" &&
          period.state === "active" &&
          period.expiresAt !== null &&
          Date.parse(period.expiresAt) <= endingSoonBefore) ||
        (filter === "upcoming" &&
          (period.state === "scheduled" || period.state === "waiting")) ||
        (filter === "ended" && period.state === "ended");
      const matchesSearch =
        !needle ||
        [
          period.customerName,
          period.customerEmail,
          period.telegramUsername ?? "",
          period.paymentIntentId,
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return matchesFilter && matchesSearch;
    });
  }, [filter, hub, search]);

  if (!hub) {
    return (
      <Stack $gap={20}>
        <PageHeader
          title="Inspiration Hub"
          description="Загружаю периоды и состояние библиотеки…"
        />
        {failed ? (
          <Panel>
            <EmptyState
              icon={<CircleAlert aria-hidden />}
              title="Не удалось загрузить библиотеку"
              action={<AdminButton onClick={onRefresh}>Обновить</AdminButton>}
            />
          </Panel>
        ) : (
          <TileGrid>
            {Array.from({ length: 4 }, (_, index) => (
              <Panel key={index}>
                <Skeleton $height={46} />
              </Panel>
            ))}
          </TileGrid>
        )}
      </Stack>
    );
  }

  const problems = hub.problems;
  const ownerless = [
    ...problems.ownerlessPaymentIntentIds,
    ...problems.endedOwnerlessPaymentIntentIds,
  ];

  const reissue = async (paymentIntentId: string) => {
    const outcome = await onReissue(paymentIntentId);
    toast(
      outcome === "ready"
        ? {
            tone: "success",
            title: "Ссылка готова",
            description: "Она ниже, в строке покупки.",
          }
        : outcome === "not_needed"
          ? {
              tone: "info",
              title: "Новая ссылка не нужна",
              description: "Доступ уже активен или ещё не начался.",
            }
          : outcome === "telegram_failed"
            ? {
                tone: "danger",
                title: "Telegram не создал ссылку",
                description: "Проверь права бота в группе библиотеки и попробуй ещё раз.",
              }
            : {
                tone: "danger",
                title: "Ссылку выдать не удалось",
                description: "Попробуй ещё раз через минуту.",
              },
    );
  };

  return (
    <Stack $gap={20}>
      <PageHeader
        title="Inspiration Hub"
        description="Оплаченные периоды, доступ в чат и проблемы, которые нужно решить вручную."
        actions={
          <AdminButton
            icon={<RefreshCw aria-hidden />}
            loading={isLoading}
            onClick={onRefresh}
          >
            Обновить
          </AdminButton>
        }
      />

      {failed && (
        <Callout tone="warning" title="Данные не обновились">
          Показан прошлый расчёт: последний запрос не прошёл. Нажми «Обновить».
        </Callout>
      )}

      {(problems.settingsMissing ||
        problems.stalledPaymentIntentIds.length > 0 ||
        ownerless.length > 0) && (
        <Stack $gap={10}>
          {problems.settingsMissing && (
            <Callout
              tone="danger"
              icon={<CircleAlert aria-hidden />}
              title="Не выбрана Telegram-группа библиотеки"
            >
              Ссылки в библиотеку не выдаются, окончания доступа не отслеживаются. Напиши
              разработчику.
            </Callout>
          )}
          {problems.stalledPaymentIntentIds.length > 0 && (
            <Callout
              tone="danger"
              icon={<CircleAlert aria-hidden />}
              title="Покупки библиотеки без дат после закрытия потока"
            >
              Люди пока остаются в библиотеке. Напиши разработчику; покупки:{" "}
              {problems.stalledPaymentIntentIds.map((id) => (
                <AdminButton
                  key={id}
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpenPurchase(id)}
                >
                  {id}
                </AdminButton>
              ))}
            </Callout>
          )}
          {ownerless.length > 0 && (
            <Callout
              tone="warning"
              icon={<TriangleAlert aria-hidden />}
              title={`Не вошли по ссылке больше 3 дней: ${ownerless.length}`}
            >
              Без входа система не знает их Telegram и не уберёт по окончании. Напиши им
              или выдай ссылку заново — строки отмечены в таблице ниже.
            </Callout>
          )}
        </Stack>
      )}

      <TileGrid>
        <StatTile
          icon={<LibraryBig aria-hidden />}
          label="Периодов идёт"
          value={hub.counts.active}
          onClick={() => setFilter("active")}
        />
        <StatTile
          icon={<CalendarClock aria-hidden />}
          label="Начнутся позже"
          value={hub.counts.scheduled}
          hint="Ссылка придёт в день начала"
          onClick={() => setFilter("upcoming")}
        />
        <StatTile
          icon={<TriangleAlert aria-hidden />}
          label="Закончатся за 7 дней"
          value={hub.counts.endingSoon}
          hintTone={hub.counts.endingSoon > 0 ? "warning" : undefined}
          hint={
            hub.counts.endingSoon > 0
              ? "Хороший момент напомнить о продлении"
              : "Спокойная неделя"
          }
          onClick={() => setFilter("endingSoon")}
        />
        <StatTile
          icon={<Store aria-hidden />}
          label="Продажи библиотеки"
          value={hub.salesEnabled ? "Открыты" : "Закрыты"}
          hint="Переключаются в «Каталоге»"
          hintTone={hub.salesEnabled ? "success" : undefined}
          onClick={() => onNavigate("sales")}
        />
      </TileGrid>

      <Columns>
        <Panel
          title="Telegram-группа библиотеки"
          description={hub.chat ? `ID ${hub.chat.chatId}` : "Не настроен"}
        >
          {hub.chat ? (
            <Stack $gap={10}>
              <strong>{hub.chat.title}</strong>
              <BotRightsCheck chatId={hub.chat.chatId} onUnauthorized={onUnauthorized} />
            </Stack>
          ) : (
            <Muted>Группа не выбрана. Напиши разработчику.</Muted>
          )}
        </Panel>

        <Panel
          title="Кого бот уберёт из библиотеки ночью"
          description={`Это предпросмотр — он никого не удаляет. Ближайшая проверка: ${formatDateTime(hub.nextCronAt)}. Можно выбрать другую дату.`}
          actions={
            <Row $gap={6}>
              <TextField
                type="date"
                aria-label="Дата проверки"
                // The server previews at most 120 days ahead.
                min={toDateInput(hub.nextCronAt)}
                max={toDateInput(
                  new Date(
                    Date.parse(hub.nextCronAt) + 120 * 24 * 60 * 60 * 1000,
                  ).toISOString(),
                )}
                value={previewAt ? toDateInput(previewAt) : toDateInput(hub.nextCronAt)}
                onChange={(event) =>
                  onPreviewAtChange(
                    event.target.value ? `${event.target.value}T03:00:00.000Z` : "",
                  )
                }
                style={{ width: 160, minHeight: 34 }}
              />
              {previewAt && (
                <AdminButton
                  size="sm"
                  variant="ghost"
                  onClick={() => onPreviewAtChange("")}
                >
                  Сбросить
                </AdminButton>
              )}
            </Row>
          }
        >
          {hub.preview.removals.length === 0 ? (
            <EmptyState
              title="Никого"
              text={`На ${formatDateTime(hub.preview.at)} никто не будет удалён.`}
            />
          ) : (
            <RemovalList>
              {hub.preview.removals.map((removal) => (
                <li key={`${removal.chatId}:${removal.telegramUserId}`}>
                  <UserMinus aria-hidden />
                  <span>
                    {removal.telegramUsername
                      ? `@${removal.telegramUsername}`
                      : "Без @username"}{" "}
                    <Muted>· ID {removal.telegramUserId}</Muted>
                  </span>
                </li>
              ))}
            </RemovalList>
          )}
        </Panel>
      </Columns>

      <Panel
        flush
        title="Покупки библиотеки"
        description="Последние 300 периодов. Поиск по имени, email, @username или номеру платежа."
        actions={
          <Row $gap={8}>
            <SearchBox>
              <Search aria-hidden />
              <TextField
                type="search"
                placeholder="Найти"
                aria-label="Найти покупку библиотеки"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                style={{ minHeight: 34 }}
              />
            </SearchBox>
            <SegmentedTabs<Filter>
              label="Фильтр периодов"
              value={filter}
              onChange={setFilter}
              items={[
                { id: "all", label: "Все" },
                { id: "active", label: "Идут" },
                { id: "endingSoon", label: "Скоро закончатся" },
                { id: "upcoming", label: "Начнутся" },
                { id: "ended", label: "Закончились" },
              ]}
            />
          </Row>
        }
      >
        <div style={{ padding: "0 20px 20px" }}>
          {periods.length === 0 ? (
            <EmptyState title="Ничего не найдено" text="Измени фильтр или поиск." />
          ) : (
            <TableScroller>
              <DataTable>
                <thead>
                  <tr>
                    <th>Имя</th>
                    <th>Тариф</th>
                    <th>Период</th>
                    <th>Telegram</th>
                    <th>Состояние</th>
                    <th aria-label="Действия" />
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period) => {
                    const state = STATE_LABELS[period.state];
                    const links = reissued[period.paymentIntentId];
                    const isOwnerless = ownerless.includes(period.paymentIntentId);
                    return (
                      <tr key={period.paymentIntentId}>
                        <td data-label="Имя">
                          <CellPrimary>{period.customerName || "Без имени"}</CellPrimary>
                          <CellSecondary>{period.customerEmail}</CellSecondary>
                        </td>
                        <td data-label="Тариф">
                          <CellPrimary>
                            {period.offerLabel || "Inspiration Hub"}
                          </CellPrimary>
                          <CellSecondary>
                            Оплата {formatDate(period.paidAt)}
                          </CellSecondary>
                        </td>
                        <td data-label="Период">
                          {period.startsAt ? (
                            `${formatDate(period.startsAt)} — ${formatDate(period.expiresAt)}`
                          ) : (
                            <Muted>После окончания потока</Muted>
                          )}
                        </td>
                        <td data-label="Telegram">
                          {period.telegramUsername ? (
                            `@${period.telegramUsername}`
                          ) : period.telegramUserId ? (
                            <Muted>ID {period.telegramUserId}</Muted>
                          ) : (
                            <Badge $tone={isOwnerless ? "warning" : "neutral"}>
                              Ещё не привязан
                            </Badge>
                          )}
                        </td>
                        <td data-label="Состояние">
                          <Badge $tone={state.tone}>{state.label}</Badge>
                        </td>
                        <td data-actions>
                          <Stack $gap={8}>
                            <Row $gap={6} $justify="flex-end">
                              {period.state === "active" && (
                                <AdminButton
                                  size="sm"
                                  icon={<Link2 aria-hidden />}
                                  loading={reissuing === period.paymentIntentId}
                                  onClick={() => void reissue(period.paymentIntentId)}
                                >
                                  Ссылка заново
                                </AdminButton>
                              )}
                              <AdminButton
                                size="sm"
                                variant="ghost"
                                onClick={() => onOpenPurchase(period.paymentIntentId)}
                              >
                                Покупка
                              </AdminButton>
                            </Row>
                            {(period.state === "scheduled" ||
                              period.state === "waiting") && (
                              <Muted>Ссылка придёт в день начала.</Muted>
                            )}
                            {links === "none" && (
                              <Muted>
                                Ссылка не нужна: доступ уже активен или ещё не начался.
                              </Muted>
                            )}
                            {Array.isArray(links) &&
                              links.map((link) => (
                                <CopyField key={link.accessUrl} value={link.accessUrl} />
                              ))}
                          </Stack>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </TableScroller>
          )}
        </div>
      </Panel>
    </Stack>
  );
};
