"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import Button from "@/components/common/Button";
import Checkbox from "@/components/common/Checkbox";
import Input from "@/components/common/Input";
import ToggleSwitch from "@/components/common/ToggleSwitch";
import {
  ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
  ONLINE_GROUP_RENEWAL_OFFER_ID,
  SELLABLE_PRODUCTS_LIST,
} from "@/constants/sellable-products";
import { getOfferAccessDurationDaysByOfferId } from "@/lib/telegram/offer-access";

import {
  AdminInvitePage,
  AdminShell,
  ButtonRow,
  Card,
  CheckboxList,
  CopyButton,
  Description,
  FeaturePlaceholder,
  Form,
  FormControl,
  FormGrid,
  HeaderInfo,
  HeaderMeta,
  HeaderRow,
  IconActionButton,
  JournalEmptyState,
  JournalSkeletonCard,
  JournalSkeletonList,
  LinkStateBadge,
  LockCard,
  LockDescription,
  LockTitle,
  LockViewport,
  MainPanel,
  OnlineGroupWorkspace,
  PolicyLabel,
  PolicyList,
  PolicyRow,
  PolicyValue,
  RecentLinkCard,
  RecentLinkHeader,
  RecentLinkMeta,
  RecentLinksList,
  RenewalLinkControls,
  RenewalLinksList,
  ResultBox,
  ResultValue,
  SectionHeading,
  Sidebar,
  SidebarActionRow,
  SidebarFooter,
  SidebarFooterHint,
  SidebarHint,
  SidebarIconButton,
  SidebarItem,
  SidebarItemLabel,
  SidebarItemMeta,
  SidebarNav,
  SidebarTitle,
  SidebarTop,
  SkeletonLine,
  StatusText,
  SummaryGrid,
  SummaryItem,
  SummaryLabel,
  SummaryValue,
  SurfaceCard,
  SurfaceDescription,
  SurfaceHeaderActions,
  SurfaceHeaderRow,
  SurfaceTitle,
  Title,
  WorkspaceGrid,
  WorkspacePrimary,
  WorkspaceSecondary,
} from "./page.styles";

type AdminFeatureId =
  | "invite-links"
  | "online-group"
  | "access-control"
  | "broadcasts"
  | "reports";
type GeneratorKind = "choreo" | "first-touch";
type LessonLanguage = "en" | "ru";
type LinkState = "active" | "used";
type StatusTone = "error" | "info" | "success";
type AuthState = "authorized" | "checking" | "locked";
type AdminFeature = {
  description: string;
  id: AdminFeatureId;
  isAvailable: boolean;
  label: string;
};
type ChoreoSelection = {
  key: string;
  label: string;
  lessonLanguage: LessonLanguage;
  offerId: string;
  productId: string;
};
type StatusMessage = {
  text: string;
  tone: StatusTone;
} | null;
type SelectOption = {
  label: string;
  value: string;
};
type GeneratedLinkEntry = {
  accessUrl: string;
  adminLabel: string;
  createdAtIso: string;
  linkState: LinkState;
  selectionLabel: string;
  tokenExpiresAt: string;
};
type TelegramChatOption = {
  chatId: string;
  title: string;
  type: string;
  updatedAt: string;
};
type RenewalCampaignEntry = {
  checkoutUrl: string;
  createdAt: string;
  id: string;
  offerId: string;
  slug: string;
  sourceChatId: string;
  sourceChatIds: string[];
  sourceChatTitle: string;
  sourceChatTitles: string[];
  status: string;
  targetChatId: string;
  title: string;
};
type OnlineGroupCampaignEntry = {
  createdAt: string;
  id: string;
  inspirationChatId: string;
  mainChatId: string;
  startsAt: string;
  status: string;
  title: string;
};
type AuthResponse = {
  authorized?: boolean;
  errorCode?: string;
};

type GenerateResponse = {
  accessUrl?: string;
  errorCode?: string;
  reason?: string;
  status?: string;
  tokenExpiresAt?: string;
};

type HistoryResponse = {
  errorCode?: string;
  items?: GeneratedLinkEntry[];
  stale?: boolean;
};
type TelegramChatsResponse = {
  chats?: TelegramChatOption[];
  errorCode?: string;
};
type RenewalCampaignsResponse = {
  campaign?: {
    checkoutUrl: string;
    createdAt: string;
    id: string;
    offerId: string;
    productId: string;
    slug: string;
    sourceChatIds: string[];
    sourceChatTitles: string[];
    targetChatTitle: string;
    title: string;
  };
  campaigns?: RenewalCampaignEntry[];
  errorCode?: string;
  reused?: boolean;
  status?: string;
};
type OnlineGroupCampaignsResponse = {
  campaign?: OnlineGroupCampaignEntry & {
    inspirationChatTitle: string;
    mainChatTitle: string;
  };
  campaigns?: OnlineGroupCampaignEntry[];
  errorCode?: string;
  reused?: boolean;
  status?: string;
};
type MonthlySalesReportMonthsResponse = {
  errorCode?: string;
  months?: SelectOption[];
};
type MonthlySalesReportResponse = {
  deliveredAtUtc?: string | null;
  deliveredTo?: string;
  endUtcIso?: string;
  errorCode?: string;
  generatedAtUtc?: string;
  isAlreadyDelivered?: boolean;
  month?: string;
  rowCount?: number;
  sha256?: string;
  skippedReason?: "already_delivered" | "empty" | null;
  startUtcIso?: string;
  status?: "failed" | "sent" | "skipped";
};
type BroadcastStats = {
  failed: number;
  pending: number;
  sent: number;
  total: number;
};
type FirstTouchBroadcastResponse = {
  errorCode?: string;
  result?: BroadcastStats & {
    attempted: number;
  };
  stats?: BroadcastStats;
};

const ADMIN_API_ENDPOINTS = {
  auth: "/admin/auth",
  firstTouchBroadcast: "/admin/api/broadcasts/first-touch-sales-start",
  inviteLinks: "/admin/api/invite-links",
  inviteLinksHistory: "/admin/api/invite-links/history",
  monthlySalesReport: "/admin/api/reports/monthly-sales",
  onlineGroupSettings: "/admin/api/online-group-settings",
  renewalCampaigns: "/admin/api/renewal-campaigns",
  telegramChats: "/admin/api/telegram/chats",
} as const;

const ADMIN_SESSION_HEARTBEAT_MS = 5 * 60_000;
const JOURNAL_SKELETON_COUNT = 3;

const ADMIN_FEATURES: AdminFeature[] = [
  {
    id: "invite-links",
    isAvailable: true,
    label: "Invite-ссылки",
    description: "Ручная выдача доступов без покупки",
  },
  {
    id: "online-group",
    isAvailable: true,
    label: "Настройки Online Group",
    description: "Текущий поток, Inspiration Hub и продления",
  },
  {
    id: "access-control",
    isAvailable: false,
    label: "Управление доступом",
    description: "История, отзыв, продление (скоро)",
  },
  {
    id: "broadcasts",
    isAvailable: true,
    label: "Рассылки",
    description: "Разовые email-кампании",
  },
  {
    id: "reports",
    isAvailable: true,
    label: "Отчеты",
    description: "Ежемесячный отчет по продажам Stripe",
  },
];

const KIND_OPTIONS: Array<{ label: string; value: GeneratorKind }> = [
  {
    label: "Первый курс (First Touch)",
    value: "first-touch",
  },
  {
    label: "Разбор",
    value: "choreo",
  },
];

const OFFER_TYPE_LABELS: Record<string, string> = {
  "with-mentor": "С куратором",
  "without-mentor": "Без куратора",
};

const LESSON_LANGUAGE_LABELS: Record<LessonLanguage, string> = {
  en: "EN",
  ru: "RU",
};

const ADMIN_FEATURE_COPY: Record<
  AdminFeatureId,
  {
    description: string;
    meta: string;
  }
> = {
  "access-control": {
    description:
      "Раздел в подготовке. Ниже можно размещать таблицы, фильтры и операционные действия.",
    meta: "Для каждого invite добавляй идентификатор, чтобы журнал был понятным.",
  },
  broadcasts: {
    description: "Разовые email-рассылки по заявкам из Neon с зеркалом в Google Sheets.",
    meta: "Повторный запуск отправляет письма только тем, у кого еще нет успешной отправки.",
  },
  "invite-links": {
    description:
      "Генерация одноразовых Telegram invite-ссылок с той же бизнес-логикой, что и в боевом платежном потоке.",
    meta: "Для каждого invite добавляй идентификатор, чтобы журнал был понятным.",
  },
  "online-group": {
    description:
      "Настройка текущего потока, постоянного Inspiration Hub и ссылок продления.",
    meta: "Plus открывает основной чат без автоматического срока, а Inspiration Hub — до старта следующего потока.",
  },
  reports: {
    description:
      "Генерация и отправка CSV-отчета по успешным продажам за выбранный месяц.",
    meta: "Ручной запуск отправляет письмо каждый раз, если за выбранный период есть продажи.",
  },
};

const RefreshIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </svg>
);

const CopyIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const formatDateTime = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(date);
};

const formatDateTimeInput = (value: string) => {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

const formatAccessDurationLabel = (days: number | null | undefined) => {
  if (!days || days <= 0) {
    return "Без ограничения после вступления";
  }

  if (days === 60) {
    return "60 дней с момента вступления";
  }

  return `${days} дней с момента вступления`;
};

const resolveLinkStateLabel = (state: LinkState) =>
  state === "used" ? "Использована" : "Активна";

const getChoreoSelections = () =>
  SELLABLE_PRODUCTS_LIST.filter((product) => product.type === "choreo")
    .flatMap((product) =>
      product.offers.flatMap((offer) =>
        (["ru", "en"] as LessonLanguage[]).map((lessonLanguage) => {
          const offerTypeLabel = OFFER_TYPE_LABELS[offer.code] ?? offer.label;

          return {
            key: `${product.id}::${offer.id}::${lessonLanguage}`,
            label: `${product.title} • ${LESSON_LANGUAGE_LABELS[lessonLanguage]} • ${offerTypeLabel}`,
            lessonLanguage,
            offerId: offer.id,
            productId: product.id,
          } satisfies ChoreoSelection;
        }),
      ),
    )
    .sort((left, right) => left.label.localeCompare(right.label, "ru"));

const resolveGeneratorErrorMessage = (errorCode: string, reason: string) => {
  if (errorCode === "unauthorized") {
    return "Сессия истекла. Введи пароль еще раз.";
  }

  if (errorCode === "invalid_offer_selection") {
    return "Выбранные параметры невалидны. Проверь параметры и попробуй снова.";
  }

  if (errorCode === "rate_limited") {
    return "Слишком много запросов. Подожди немного и попробуй снова.";
  }

  if (errorCode === "invalid_origin") {
    return "Запрос отклонен по Origin. Открой страницу напрямую и попробуй снова.";
  }

  if (reason === "channel_not_configured") {
    return "Для выбранного оффера не настроен Telegram-канал.";
  }

  if (reason === "offer_not_supported") {
    return "Этот оффер сейчас не поддерживает выдачу invite-ссылки.";
  }

  return "Не удалось сгенерировать ссылку. Проверь настройки и попробуй снова.";
};

type AdminLoginProps = {
  authPassword: string;
  authStatus: StatusMessage;
  isChecking: boolean;
  isUnlocking: boolean;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

// Presentation stays stateless so extraction cannot move or reset operational state.
const AdminLogin = ({
  authPassword,
  authStatus,
  isChecking,
  isUnlocking,
  onPasswordChange,
  onSubmit,
}: AdminLoginProps) => (
  <AdminInvitePage>
    <LockViewport>
      <LockCard>
        <LockTitle>Вход в админ-панель</LockTitle>
        <LockDescription>Пароль открывает доступ ко всей админ-панели</LockDescription>
        <Form onSubmit={onSubmit}>
          <FormControl>
            <Input
              id="admin-password"
              name="adminPassword"
              type="password"
              label="Пароль"
              value={authPassword}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Введите пароль"
              disabled={isChecking || isUnlocking}
              width="100%"
            />
          </FormControl>
          <ButtonRow>
            <Button
              buttonText={
                isChecking ? "Проверка..." : isUnlocking ? "Открываю..." : "Войти"
              }
              type="submit"
              disabled={isChecking || isUnlocking || !authPassword.trim()}
              isLoading={isUnlocking}
              width="100%"
            />
          </ButtonRow>
          {authStatus && (
            <StatusText $tone={authStatus.tone}>{authStatus.text}</StatusText>
          )}
        </Form>
      </LockCard>
    </LockViewport>
  </AdminInvitePage>
);

type AdminSidebarProps = {
  activeFeatureId: AdminFeatureId;
  isLoggingOut: boolean;
  isRefreshingSession: boolean;
  onFeatureSelect: (featureId: AdminFeatureId) => void;
  onLogout: () => void | Promise<void>;
  onRefreshSession: () => void | Promise<void>;
};

const AdminSidebar = ({
  activeFeatureId,
  isLoggingOut,
  isRefreshingSession,
  onFeatureSelect,
  onLogout,
  onRefreshSession,
}: AdminSidebarProps) => (
  <Sidebar>
    <SidebarTop>
      <SidebarTitle>Admin</SidebarTitle>
      <SidebarHint>Выбери нужный раздел слева.</SidebarHint>
      <SidebarNav>
        {ADMIN_FEATURES.map((feature) => (
          <SidebarItem
            key={feature.id}
            type="button"
            $active={feature.id === activeFeatureId}
            $available={feature.isAvailable}
            onClick={() => feature.isAvailable && onFeatureSelect(feature.id)}
            disabled={!feature.isAvailable}
            aria-current={feature.id === activeFeatureId ? "page" : undefined}
          >
            <SidebarItemLabel>{feature.label}</SidebarItemLabel>
            <SidebarItemMeta>{feature.description}</SidebarItemMeta>
          </SidebarItem>
        ))}
      </SidebarNav>
    </SidebarTop>

    <SidebarFooter>
      <SidebarFooterHint>Сессия администратора</SidebarFooterHint>
      <SidebarActionRow>
        <SidebarIconButton
          type="button"
          onClick={onRefreshSession}
          disabled={isRefreshingSession}
          $isLoading={isRefreshingSession}
          aria-label="Проверить сессию"
          title="Проверить сессию"
        >
          <RefreshIcon />
        </SidebarIconButton>
        <Button
          buttonText={isLoggingOut ? "Выход..." : "Выйти"}
          type="button"
          onClick={onLogout}
          disabled={isLoggingOut}
          isLoading={isLoggingOut}
          size="sm"
          variant="secondary"
          width="100%"
        />
      </SidebarActionRow>
    </SidebarFooter>
  </Sidebar>
);

const AdminFeatureHeader = ({ feature }: { feature: AdminFeature }) => {
  const copy = ADMIN_FEATURE_COPY[feature.id];

  return (
    <HeaderRow>
      <HeaderInfo>
        <Title>{feature.label}</Title>
        <Description>{copy.description}</Description>
        <HeaderMeta>{copy.meta}</HeaderMeta>
      </HeaderInfo>
    </HeaderRow>
  );
};

type CopyableLinkProps = {
  ariaLabel?: string;
  disabled?: boolean;
  isCopying: boolean;
  link: string;
  onCopy: (link: string) => void | Promise<void>;
  title?: string;
};

const CopyableLink = ({
  ariaLabel = "Копировать ссылку",
  disabled = false,
  isCopying,
  link,
  onCopy,
  title = "Копировать ссылку",
}: CopyableLinkProps) => (
  <ResultBox>
    <ResultValue>{link}</ResultValue>
    <CopyButton>
      <IconActionButton
        type="button"
        onClick={() => onCopy(link)}
        disabled={disabled || isCopying}
        $isLoading={isCopying}
        aria-label={ariaLabel}
        title={title}
      >
        <CopyIcon />
      </IconActionButton>
    </CopyButton>
  </ResultBox>
);

type ActiveOnlineGroupCardProps = {
  activeCampaign: OnlineGroupCampaignEntry | undefined;
  activeMainChatTitle: string;
  inspirationChatTitle: string;
  isFormOpen: boolean;
  isLoading: boolean;
  isSaveDisabled: boolean;
  isSaving: boolean;
  libraryChatId: string;
  mainChatId: string;
  onFormToggle: () => void;
  onLibraryChatChange: (value: string) => void;
  onMainChatChange: (value: string) => void;
  onRefresh: () => void | Promise<void>;
  onStartsAtChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onTitleChange: (value: string) => void;
  startsAt: string;
  status: StatusMessage;
  telegramChatOptions: SelectOption[];
  title: string;
};

const ActiveOnlineGroupCard = ({
  activeCampaign,
  activeMainChatTitle,
  inspirationChatTitle,
  isFormOpen,
  isLoading,
  isSaveDisabled,
  isSaving,
  libraryChatId,
  mainChatId,
  onFormToggle,
  onLibraryChatChange,
  onMainChatChange,
  onRefresh,
  onStartsAtChange,
  onSubmit,
  onTitleChange,
  startsAt,
  status,
  telegramChatOptions,
  title,
}: ActiveOnlineGroupCardProps) => (
  <SurfaceCard>
    <SurfaceHeaderRow>
      <SurfaceTitle>1. Активный поток</SurfaceTitle>
      <SurfaceHeaderActions>
        {activeCampaign && (
          <Button
            buttonText={isFormOpen ? "Скрыть форму" : "Изменить"}
            type="button"
            onClick={onFormToggle}
            size="sm"
            variant="secondary"
            width="auto"
          />
        )}
        <IconActionButton
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          $isLoading={isLoading}
          aria-label="Обновить Online Group"
          title="Обновить Online Group"
        >
          <RefreshIcon />
        </IconActionButton>
      </SurfaceHeaderActions>
    </SurfaceHeaderRow>
    <SurfaceDescription>
      Куда попадут участники после новой покупки или продления.
    </SurfaceDescription>
    {activeCampaign ? (
      <SummaryGrid>
        <SummaryItem>
          <SummaryLabel>Поток</SummaryLabel>
          <SummaryValue>{activeCampaign.title}</SummaryValue>
        </SummaryItem>
        <SummaryItem>
          <SummaryLabel>Старт потока</SummaryLabel>
          <SummaryValue>{formatDateTime(activeCampaign.startsAt)}</SummaryValue>
        </SummaryItem>
        <SummaryItem>
          <SummaryLabel>Основной чат</SummaryLabel>
          <SummaryValue>{activeMainChatTitle}</SummaryValue>
        </SummaryItem>
        <SummaryItem>
          <SummaryLabel>Inspiration Hub</SummaryLabel>
          <SummaryValue>{inspirationChatTitle}</SummaryValue>
        </SummaryItem>
      </SummaryGrid>
    ) : (
      <StatusText $tone="info">Активный поток еще не настроен.</StatusText>
    )}
    {(isFormOpen || !activeCampaign) && (
      <Form onSubmit={onSubmit}>
        <FormGrid>
          <FormControl>
            <Input
              id="online-group-regular-chat"
              name="onlineGroupRegularChat"
              label="Основной чат потока"
              value={mainChatId}
              placeholder="Выбери новый чат Online Group"
              selectOptions={telegramChatOptions}
              onChange={(event) => onMainChatChange(event.target.value)}
              disabled={isLoading}
              width="100%"
            />
          </FormControl>
          <FormControl>
            <Input
              id="online-group-library-chat"
              name="onlineGroupLibraryChat"
              label="Постоянный Inspiration Hub"
              value={libraryChatId}
              placeholder="Выбери чат Inspiration Hub"
              selectOptions={telegramChatOptions}
              onChange={(event) => onLibraryChatChange(event.target.value)}
              disabled={isLoading || Boolean(activeCampaign)}
              width="100%"
            />
          </FormControl>
          <FormControl>
            <Input
              id="online-group-starts-at"
              name="onlineGroupStartsAt"
              label="Дата и время старта"
              value={startsAt}
              type="datetime-local"
              onChange={(event) => onStartsAtChange(event.target.value)}
              width="100%"
            />
          </FormControl>
          <FormControl>
            <Input
              id="online-group-title"
              name="onlineGroupTitle"
              label="Название потока"
              value={title}
              placeholder="Например: Online Group — август"
              onChange={(event) => onTitleChange(event.target.value)}
              width="100%"
            />
          </FormControl>
        </FormGrid>
        <ButtonRow>
          <Button
            buttonText={isSaving ? "Сохраняю..." : "Сохранить и активировать поток"}
            type="submit"
            disabled={isSaveDisabled}
            isLoading={isSaving}
            width="100%"
          />
        </ButtonRow>
      </Form>
    )}
    {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}
  </SurfaceCard>
);

type RenewalGeneratorCardProps = {
  chats: TelegramChatOption[];
  copyingUrl: string;
  generatedLink: string;
  isDisabled: boolean;
  isGenerating: boolean;
  isLoading: boolean;
  offerId: string;
  offerOptions: SelectOption[];
  onCopy: (link: string) => void | Promise<void>;
  onOfferChange: (value: string) => void;
  onRegenerate: () => void;
  onSourceChatToggle: (chatId: string, checked: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onTitleChange: (value: string) => void;
  sourceChatIds: string[];
  status: StatusMessage;
  title: string;
};

const RenewalGeneratorCard = ({
  chats,
  copyingUrl,
  generatedLink,
  isDisabled,
  isGenerating,
  isLoading,
  offerId,
  offerOptions,
  onCopy,
  onOfferChange,
  onRegenerate,
  onSourceChatToggle,
  onSubmit,
  onTitleChange,
  sourceChatIds,
  status,
  title,
}: RenewalGeneratorCardProps) => (
  <SurfaceCard>
    <SurfaceTitle>2. Создать ссылку продления</SurfaceTitle>
    <SurfaceDescription>
      Кто может купить следующий поток и по какому тарифу.
    </SurfaceDescription>
    <Form onSubmit={onSubmit}>
      <FormControl>
        <PolicyLabel>Участники из этих чатов смогут оплатить</PolicyLabel>
        <CheckboxList>
          {chats.map((chat) => (
            <Checkbox
              key={chat.chatId}
              checked={sourceChatIds.includes(chat.chatId)}
              disabled={isLoading}
              name={`renewal-source-${chat.chatId}`}
              onChange={(event) => onSourceChatToggle(chat.chatId, event.target.checked)}
              placeholder={`${chat.title} (${chat.chatId})`}
            />
          ))}
        </CheckboxList>
      </FormControl>
      <FormGrid>
        <FormControl>
          <Input
            id="renewal-offer"
            name="renewalOffer"
            label="Тариф"
            value={offerId}
            placeholder="Выбери тариф"
            selectOptions={offerOptions}
            onChange={(event) => onOfferChange(event.target.value)}
            disabled={isLoading}
            width="100%"
          />
        </FormControl>
        <FormControl>
          <Input
            id="renewal-title"
            name="renewalTitle"
            label="Название для админки"
            value={title}
            placeholder="Например: поток 1 → поток 2"
            onChange={(event) => onTitleChange(event.target.value)}
            width="100%"
          />
        </FormControl>
      </FormGrid>
      <FormGrid>
        <ButtonRow>
          <Button
            buttonText={isGenerating ? "Готовлю..." : "Создать или показать"}
            type="submit"
            disabled={isDisabled}
            isLoading={isGenerating}
            width="100%"
          />
        </ButtonRow>
        <ButtonRow>
          <Button
            buttonText={isGenerating ? "Заменяю..." : "Заменить ссылку новой"}
            type="button"
            onClick={onRegenerate}
            disabled={isDisabled}
            isLoading={isGenerating}
            variant="secondary"
            width="100%"
          />
        </ButtonRow>
      </FormGrid>
      {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}
      {generatedLink && (
        <CopyableLink
          ariaLabel="Копировать ссылку продления"
          isCopying={copyingUrl === generatedLink}
          link={generatedLink}
          onCopy={onCopy}
          title="Копировать ссылку продления"
        />
      )}
    </Form>
  </SurfaceCard>
);

type RenewalCampaignsCardProps = {
  campaigns: RenewalCampaignEntry[];
  copyingUrl: string;
  onCopy: (link: string) => void | Promise<void>;
  onToggleStatus: (slug: string, active: boolean) => void | Promise<void>;
  updatingSlug: string;
};

const RenewalCampaignsCard = ({
  campaigns,
  copyingUrl,
  onCopy,
  onToggleStatus,
  updatingSlug,
}: RenewalCampaignsCardProps) => (
  <SurfaceCard>
    <SurfaceTitle>3. Ссылки продления</SurfaceTitle>
    <SurfaceDescription>
      Включай нужную ссылку свитчером и копируй ее для отправки в чат.
    </SurfaceDescription>
    {campaigns.length === 0 ? (
      <JournalEmptyState>Ссылок пока нет.</JournalEmptyState>
    ) : (
      <RenewalLinksList>
        {campaigns.map((campaign) => {
          const isActive = campaign.status === "active";

          return (
            <RecentLinkCard key={campaign.slug}>
              <RecentLinkHeader>
                <RecentLinkMeta>{campaign.title}</RecentLinkMeta>
                <RenewalLinkControls>
                  <LinkStateBadge $state={isActive ? "active" : "used"}>
                    {campaign.offerId === ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID
                      ? "Plus"
                      : "Standard"}
                  </LinkStateBadge>
                  <ToggleSwitch
                    ariaLabel={`${isActive ? "Выключить" : "Включить"} ссылку ${campaign.title}`}
                    checked={isActive}
                    disabled={Boolean(updatingSlug)}
                    onChange={(checked) => void onToggleStatus(campaign.slug, checked)}
                  />
                </RenewalLinkControls>
              </RecentLinkHeader>
              <RecentLinkMeta>
                Проверяем: {campaign.sourceChatTitles.join(", ")}
              </RecentLinkMeta>
              <RecentLinkMeta>
                Создано: {formatDateTime(campaign.createdAt)}
              </RecentLinkMeta>
              <CopyableLink
                disabled={!isActive}
                isCopying={copyingUrl === campaign.checkoutUrl}
                link={campaign.checkoutUrl}
                onCopy={onCopy}
                title={isActive ? "Копировать ссылку" : "Сначала включи ссылку"}
              />
            </RecentLinkCard>
          );
        })}
      </RenewalLinksList>
    )}
  </SurfaceCard>
);

type InviteLinkGeneratorCardProps = {
  adminLabel: string;
  choreoSelectOptions: SelectOption[];
  copyingUrl: string;
  generatedLink: string;
  generatorStatus: StatusMessage;
  isGenerateDisabled: boolean;
  isGenerating: boolean;
  kind: GeneratorKind;
  kindSelectOptions: SelectOption[];
  onAdminLabelChange: (value: string) => void;
  onChoreoSelectionChange: (value: string) => void;
  onCopy: (link: string) => void | Promise<void>;
  onKindChange: (kind: GeneratorKind) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  resolvedChoreoSelection: ChoreoSelection | null;
  selectedChoreoKey: string;
};

const InviteLinkGeneratorCard = ({
  adminLabel,
  choreoSelectOptions,
  copyingUrl,
  generatedLink,
  generatorStatus,
  isGenerateDisabled,
  isGenerating,
  kind,
  kindSelectOptions,
  onAdminLabelChange,
  onChoreoSelectionChange,
  onCopy,
  onKindChange,
  onSubmit,
  resolvedChoreoSelection,
  selectedChoreoKey,
}: InviteLinkGeneratorCardProps) => (
  <SurfaceCard>
    <SurfaceTitle>Генератор доступа</SurfaceTitle>
    <SurfaceDescription>
      Выбери тип продукта, добавь идентификатор и сгенерируй одноразовую ссылку доступа в
      канал.
    </SurfaceDescription>
    <Form onSubmit={onSubmit}>
      <FormControl>
        <Input
          id="generator-kind"
          name="generatorKind"
          label="Что генерируем"
          value={kind}
          onChange={(event) => onKindChange(event.target.value as GeneratorKind)}
          selectOptions={kindSelectOptions}
          width="100%"
        />
      </FormControl>

      {kind === "choreo" && (
        <FormControl>
          <Input
            id="choreo-selection"
            name="choreoSelection"
            label="Разбор / язык / тип"
            value={selectedChoreoKey}
            placeholder="Выбери нужный разбор"
            selectOptions={choreoSelectOptions}
            onChange={(event) => onChoreoSelectionChange(event.target.value)}
            width="100%"
          />
        </FormControl>
      )}

      <FormControl>
        <Input
          id="admin-link-label"
          name="adminLinkLabel"
          label="Идентификатор"
          value={adminLabel}
          placeholder="Например: Аня / спец-оффер / блогер"
          onChange={(event) => onAdminLabelChange(event.target.value)}
          width="100%"
        />
      </FormControl>

      {kind === "choreo" && !resolvedChoreoSelection && (
        <StatusText $tone="info">
          Для разбора обязательно выбери конкретный оффер в селекторе.
        </StatusText>
      )}

      {!adminLabel.trim() && (
        <StatusText $tone="info">
          Добавь идентификатор, чтобы потом было понятно, кому или для чего выдавалась
          ссылка.
        </StatusText>
      )}

      <ButtonRow>
        <Button
          buttonText={isGenerating ? "Генерирую..." : "Сгенерировать ссылку"}
          type="submit"
          disabled={isGenerateDisabled}
          isLoading={isGenerating}
          width="100%"
        />
      </ButtonRow>

      {generatorStatus && (
        <StatusText $tone={generatorStatus.tone}>{generatorStatus.text}</StatusText>
      )}

      {generatedLink && (
        <CopyableLink
          isCopying={copyingUrl === generatedLink}
          link={generatedLink}
          onCopy={onCopy}
        />
      )}
    </Form>
  </SurfaceCard>
);

const InviteLinkPolicyCard = ({ accessPolicyLabel }: { accessPolicyLabel: string }) => (
  <SurfaceCard>
    <SurfaceTitle>Политика и контроль</SurfaceTitle>
    <PolicyList>
      <PolicyRow>
        <PolicyLabel>Доступ по ссылке</PolicyLabel>
        <PolicyValue>Одноразовый invite, 30 дней</PolicyValue>
      </PolicyRow>
      <PolicyRow>
        <PolicyLabel>Срок доступа</PolicyLabel>
        <PolicyValue>{accessPolicyLabel}</PolicyValue>
      </PolicyRow>
      <PolicyRow>
        <PolicyLabel>Источник данных</PolicyLabel>
        <PolicyValue>Neon primary + Google Sheets mirror</PolicyValue>
      </PolicyRow>
      <PolicyRow>
        <PolicyLabel>Защита API</PolicyLabel>
        <PolicyValue>Origin check + rate limiting</PolicyValue>
      </PolicyRow>
    </PolicyList>
  </SurfaceCard>
);

type InviteLinkJournalCardProps = {
  copyingUrl: string;
  isInitialLoading: boolean;
  isLoading: boolean;
  links: GeneratedLinkEntry[];
  onCopy: (link: string) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
};

const InviteLinkJournalCard = ({
  copyingUrl,
  isInitialLoading,
  isLoading,
  links,
  onCopy,
  onRefresh,
}: InviteLinkJournalCardProps) => (
  <SurfaceCard>
    <SurfaceHeaderRow>
      <SurfaceTitle>Журнал последних ссылок</SurfaceTitle>
      <IconActionButton
        type="button"
        onClick={onRefresh}
        disabled={isLoading}
        $isLoading={isLoading}
        aria-label="Обновить журнал"
        title="Обновить журнал"
      >
        <RefreshIcon />
      </IconActionButton>
    </SurfaceHeaderRow>
    {isInitialLoading ? (
      <JournalSkeletonList>
        {Array.from({ length: JOURNAL_SKELETON_COUNT }, (_, index) => (
          <JournalSkeletonCard key={`journal-skeleton-${index}`}>
            <SkeletonLine $width="58%" />
            <SkeletonLine $width="36%" />
            <SkeletonLine $width="100%" $height="36px" />
          </JournalSkeletonCard>
        ))}
      </JournalSkeletonList>
    ) : links.length === 0 ? (
      <JournalEmptyState>Созданных администратором ссылок нет.</JournalEmptyState>
    ) : (
      <RecentLinksList>
        {links.map((entry) => (
          <RecentLinkCard key={`${entry.accessUrl}-${entry.createdAtIso}`}>
            <RecentLinkHeader>
              <RecentLinkMeta>{entry.selectionLabel}</RecentLinkMeta>
              <LinkStateBadge $state={entry.linkState}>
                {resolveLinkStateLabel(entry.linkState)}
              </LinkStateBadge>
            </RecentLinkHeader>

            <RecentLinkMeta>Идентификатор: {entry.adminLabel || "-"}</RecentLinkMeta>
            <RecentLinkMeta>
              Создано: {formatDateTime(entry.createdAtIso)} | Токен до:{" "}
              {entry.tokenExpiresAt
                ? formatDateTime(entry.tokenExpiresAt)
                : "не определено"}
            </RecentLinkMeta>

            <CopyableLink
              isCopying={copyingUrl === entry.accessUrl}
              link={entry.accessUrl}
              onCopy={onCopy}
            />
          </RecentLinkCard>
        ))}
      </RecentLinksList>
    )}
  </SurfaceCard>
);

type BroadcastWorkspaceProps = {
  isDisabled: boolean;
  isLoadingStats: boolean;
  isSending: boolean;
  onRefresh: () => void | Promise<void>;
  onSend: () => void | Promise<void>;
  pendingCount: number;
  stats: BroadcastStats | null;
  status: StatusMessage;
};

const BroadcastWorkspace = ({
  isDisabled,
  isLoadingStats,
  isSending,
  onRefresh,
  onSend,
  pendingCount,
  stats,
  status,
}: BroadcastWorkspaceProps) => (
  <WorkspaceGrid>
    <WorkspacePrimary>
      <SurfaceCard>
        <SurfaceHeaderRow>
          <SurfaceTitle>First Touch: старт продаж</SurfaceTitle>
          <IconActionButton
            type="button"
            onClick={onRefresh}
            disabled={isLoadingStats}
            $isLoading={isLoadingStats}
            aria-label="Обновить статистику рассылки"
            title="Обновить статистику рассылки"
          >
            <RefreshIcon />
          </IconActionButton>
        </SurfaceHeaderRow>
        <SurfaceDescription>
          Отправляет разовое письмо со ссылкой на checkout курса First Touch. Уже успешно
          отправленные адреса не затрагиваются.
        </SurfaceDescription>
        <PolicyList>
          <PolicyRow>
            <PolicyLabel>Всего заявок</PolicyLabel>
            <PolicyValue>{stats?.total ?? 0}</PolicyValue>
          </PolicyRow>
          <PolicyRow>
            <PolicyLabel>Ожидают отправки</PolicyLabel>
            <PolicyValue>{stats?.pending ?? 0}</PolicyValue>
          </PolicyRow>
          <PolicyRow>
            <PolicyLabel>Уже отправлено</PolicyLabel>
            <PolicyValue>{stats?.sent ?? 0}</PolicyValue>
          </PolicyRow>
          <PolicyRow>
            <PolicyLabel>С ошибкой</PolicyLabel>
            <PolicyValue>{stats?.failed ?? 0}</PolicyValue>
          </PolicyRow>
        </PolicyList>
        <ButtonRow>
          <Button
            buttonText={
              isSending
                ? "Отправляю..."
                : isLoadingStats
                  ? "Загружаю статистику..."
                  : pendingCount === 0
                    ? "Нет адресов для отправки"
                    : "Отправить рассылку"
            }
            type="button"
            onClick={onSend}
            disabled={isDisabled}
            isLoading={isSending}
            width="100%"
          />
        </ButtonRow>
        {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}
      </SurfaceCard>
    </WorkspacePrimary>

    <WorkspaceSecondary>
      <SurfaceCard>
        <SurfaceTitle>Правила отправки</SurfaceTitle>
        <PolicyList>
          <PolicyRow>
            <PolicyLabel>Источник</PolicyLabel>
            <PolicyValue>Neon EmailCampaignLeads + Sheets mirror</PolicyValue>
          </PolicyRow>
          <PolicyRow>
            <PolicyLabel>Кампания</PolicyLabel>
            <PolicyValue>first_touch_sales_start</PolicyValue>
          </PolicyRow>
          <PolicyRow>
            <PolicyLabel>Повторный запуск</PolicyLabel>
            <PolicyValue>Только pending и failed</PolicyValue>
          </PolicyRow>
          <PolicyRow>
            <PolicyLabel>Канал доставки</PolicyLabel>
            <PolicyValue>Resend email</PolicyValue>
          </PolicyRow>
        </PolicyList>
      </SurfaceCard>
    </WorkspaceSecondary>
  </WorkspaceGrid>
);

type ReportsWorkspaceProps = {
  isDisabled: boolean;
  isGenerating: boolean;
  isLoadingMonths: boolean;
  month: string;
  monthOptions: SelectOption[];
  onGenerate: () => void | Promise<void>;
  onMonthChange: (value: string) => void;
  status: StatusMessage;
};

const ReportsWorkspace = ({
  isDisabled,
  isGenerating,
  isLoadingMonths,
  month,
  monthOptions,
  onGenerate,
  onMonthChange,
  status,
}: ReportsWorkspaceProps) => (
  <WorkspaceGrid>
    <WorkspacePrimary>
      <SurfaceCard>
        <SurfaceTitle>Ежемесячный отчет по продажам</SurfaceTitle>
        <SurfaceDescription>
          Генерирует CSV по успешным Stripe-платежам за выбранный месяц и отправляет его
          на адрес из RESEND_REPLY_TO.
        </SurfaceDescription>
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void onGenerate();
          }}
        >
          {monthOptions.length > 0 && (
            <FormControl>
              <Input
                id="monthly-sales-report-month"
                name="monthlySalesReportMonth"
                label="Месяц отчета"
                value={month}
                placeholder="Выбери месяц"
                selectOptions={monthOptions}
                onChange={(event) => onMonthChange(event.target.value)}
                disabled={isGenerating}
                width="100%"
              />
            </FormControl>
          )}
          <ButtonRow>
            <Button
              buttonText={
                isGenerating
                  ? "Отправляю..."
                  : isLoadingMonths
                    ? "Загружаю месяцы..."
                    : monthOptions.length === 0
                      ? "Нет подтвержденных продаж"
                      : "Сформировать и отправить отчет"
              }
              type="submit"
              disabled={isDisabled}
              isLoading={isGenerating}
              width="100%"
            />
          </ButtonRow>
          {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}
        </Form>
      </SurfaceCard>
    </WorkspacePrimary>

    <WorkspaceSecondary>
      <SurfaceCard>
        <SurfaceTitle>Как это работает</SurfaceTitle>
        <PolicyList>
          <PolicyRow>
            <PolicyLabel>Источник</PolicyLabel>
            <PolicyValue>Neon purchases + Stripe success events</PolicyValue>
          </PolicyRow>
          <PolicyRow>
            <PolicyLabel>Период</PolicyLabel>
            <PolicyValue>По времени успешной оплаты Stripe</PolicyValue>
          </PolicyRow>
          <PolicyRow>
            <PolicyLabel>Пустой отчет</PolicyLabel>
            <PolicyValue>Если продаж нет, письмо не отправляется</PolicyValue>
          </PolicyRow>
          <PolicyRow>
            <PolicyLabel>Защита от дублей</PolicyLabel>
            <PolicyValue>
              Cron не дублирует отправку, кнопка отправляет каждый раз
            </PolicyValue>
          </PolicyRow>
          <PolicyRow>
            <PolicyLabel>Канал доставки</PolicyLabel>
            <PolicyValue>Resend email</PolicyValue>
          </PolicyRow>
        </PolicyList>
      </SurfaceCard>
    </WorkspaceSecondary>
  </WorkspaceGrid>
);

const UnavailableFeature = ({ feature }: { feature: AdminFeature }) => (
  <>
    <FeaturePlaceholder>
      Раздел <strong>{feature.label}</strong> пока не реализован. Дальше можно добавить
      здесь таблицы, фильтры и действия для ручного управления.
    </FeaturePlaceholder>
    <SectionHeading>Скоро здесь появятся инструменты управления</SectionHeading>
  </>
);

export default function AdminPage() {
  const choreoSelections = useMemo(() => getChoreoSelections(), []);
  const choreoSelectionMap = useMemo(
    () => new Map(choreoSelections.map((item) => [item.key, item])),
    [choreoSelections],
  );

  const [authState, setAuthState] = useState<AuthState>("checking");
  const [authPassword, setAuthPassword] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeFeatureId, setActiveFeatureId] = useState<AdminFeatureId>("invite-links");
  const [authStatus, setAuthStatus] = useState<StatusMessage>({
    text: "Проверяю сессию...",
    tone: "info",
  });

  const [kind, setKind] = useState<GeneratorKind>("first-touch");
  const [selectedChoreoKey, setSelectedChoreoKey] = useState("");
  const [adminLabel, setAdminLabel] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [generatorStatus, setGeneratorStatus] = useState<StatusMessage>(null);
  const [telegramChats, setTelegramChats] = useState<TelegramChatOption[]>([]);
  const [onlineGroupCampaigns, setOnlineGroupCampaigns] = useState<
    OnlineGroupCampaignEntry[]
  >([]);
  const [onlineGroupRegularChatId, setOnlineGroupRegularChatId] = useState("");
  const [onlineGroupLibraryChatId, setOnlineGroupLibraryChatId] = useState("");
  const [onlineGroupStartsAt, setOnlineGroupStartsAt] = useState("");
  const [onlineGroupTitle, setOnlineGroupTitle] = useState("");
  const [onlineGroupStatus, setOnlineGroupStatus] = useState<StatusMessage>(null);
  const [isOnlineGroupFormOpen, setIsOnlineGroupFormOpen] = useState(false);
  const [isSavingOnlineGroupSettings, setIsSavingOnlineGroupSettings] = useState(false);
  const [renewalCampaigns, setRenewalCampaigns] = useState<RenewalCampaignEntry[]>([]);
  const [renewalSourceChatIds, setRenewalSourceChatIds] = useState<string[]>([]);
  const [renewalOfferId, setRenewalOfferId] = useState(ONLINE_GROUP_RENEWAL_OFFER_ID);
  const [renewalTitle, setRenewalTitle] = useState("");
  const [generatedRenewalLink, setGeneratedRenewalLink] = useState("");
  const [renewalStatus, setRenewalStatus] = useState<StatusMessage>(null);
  const [isLoadingOnlineGroupData, setIsLoadingOnlineGroupData] = useState(false);
  const [hasLoadedOnlineGroupData, setHasLoadedOnlineGroupData] = useState(false);
  const [isGeneratingRenewal, setIsGeneratingRenewal] = useState(false);
  const [updatingRenewalSlug, setUpdatingRenewalSlug] = useState("");
  const [copyingUrl, setCopyingUrl] = useState("");
  const [hasLoadedJournalOnce, setHasLoadedJournalOnce] = useState(false);
  const [isJournalLoading, setIsJournalLoading] = useState(false);
  const [isGeneratingMonthlySalesReport, setIsGeneratingMonthlySalesReport] =
    useState(false);
  const [isLoadingMonthlySalesReportMonths, setIsLoadingMonthlySalesReportMonths] =
    useState(false);
  const [hasLoadedMonthlySalesReportMonths, setHasLoadedMonthlySalesReportMonths] =
    useState(false);
  const [monthlyReportMonthOptions, setMonthlyReportMonthOptions] = useState<
    SelectOption[]
  >([]);
  const [monthlySalesReportStatus, setMonthlySalesReportStatus] =
    useState<StatusMessage>(null);
  const [monthlySalesReportMonth, setMonthlySalesReportMonth] = useState("");
  const [firstTouchBroadcastStats, setFirstTouchBroadcastStats] =
    useState<BroadcastStats | null>(null);
  const [firstTouchBroadcastStatus, setFirstTouchBroadcastStatus] =
    useState<StatusMessage>(null);
  const [isLoadingFirstTouchBroadcastStats, setIsLoadingFirstTouchBroadcastStats] =
    useState(false);
  const [isSendingFirstTouchBroadcast, setIsSendingFirstTouchBroadcast] = useState(false);
  const [hasLoadedFirstTouchBroadcastStats, setHasLoadedFirstTouchBroadcastStats] =
    useState(false);
  const [recentLinks, setRecentLinks] = useState<GeneratedLinkEntry[]>([]);
  const journalLoadInFlightRef = useRef(false);

  const resolvedChoreoSelection = selectedChoreoKey
    ? (choreoSelectionMap.get(selectedChoreoKey) ?? null)
    : null;
  const isGenerateDisabled =
    isGenerating || !adminLabel.trim() || (kind === "choreo" && !resolvedChoreoSelection);
  const kindSelectOptions: SelectOption[] = KIND_OPTIONS.map((option) => ({
    label: option.label,
    value: option.value,
  }));
  const choreoSelectOptions: SelectOption[] = choreoSelections.map((selection) => ({
    label: selection.label,
    value: selection.key,
  }));
  const activeFeature =
    ADMIN_FEATURES.find((feature) => feature.id === activeFeatureId) ?? ADMIN_FEATURES[0];
  const isInviteLinksFeatureActive = activeFeature.id === "invite-links";
  const isOnlineGroupFeatureActive = activeFeature.id === "online-group";
  const isBroadcastsFeatureActive = activeFeature.id === "broadcasts";
  const isReportsFeatureActive = activeFeature.id === "reports";
  const telegramChatSelectOptions: SelectOption[] = telegramChats.map((chat) => ({
    label: `${chat.title} (${chat.chatId})`,
    value: chat.chatId,
  }));
  const activeOnlineGroupCampaign = onlineGroupCampaigns.find(
    (campaign) => campaign.status === "active",
  );
  const activeMainChatTitle = activeOnlineGroupCampaign
    ? (telegramChats.find((chat) => chat.chatId === activeOnlineGroupCampaign.mainChatId)
        ?.title ?? activeOnlineGroupCampaign.mainChatId)
    : "";
  const inspirationChatTitle = activeOnlineGroupCampaign
    ? (telegramChats.find(
        (chat) => chat.chatId === activeOnlineGroupCampaign.inspirationChatId,
      )?.title ?? activeOnlineGroupCampaign.inspirationChatId)
    : "";
  const isRenewalGenerateDisabled =
    isGeneratingRenewal ||
    renewalSourceChatIds.length === 0 ||
    !activeOnlineGroupCampaign ||
    renewalSourceChatIds.includes(activeOnlineGroupCampaign.mainChatId);
  const isOnlineGroupGenerateDisabled =
    isSavingOnlineGroupSettings ||
    !onlineGroupRegularChatId ||
    !onlineGroupLibraryChatId ||
    !onlineGroupStartsAt ||
    onlineGroupRegularChatId === onlineGroupLibraryChatId;
  const renewalOfferSelectOptions: SelectOption[] = [
    {
      label: "Standard",
      value: ONLINE_GROUP_RENEWAL_OFFER_ID,
    },
    {
      label: "Plus",
      value: ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
    },
  ];
  const accessPolicyLabel = useMemo(() => {
    if (kind === "choreo" && resolvedChoreoSelection) {
      return formatAccessDurationLabel(
        getOfferAccessDurationDaysByOfferId(resolvedChoreoSelection.offerId),
      );
    }

    const firstTouchOfferId =
      SELLABLE_PRODUCTS_LIST.find((product) => product.code === "first-touch")?.offers[0]
        ?.id ?? "";

    return formatAccessDurationLabel(
      getOfferAccessDurationDaysByOfferId(firstTouchOfferId),
    );
  }, [kind, resolvedChoreoSelection]);

  const isChecking = authState === "checking";
  const isAuthorized = authState === "authorized";

  const loadRecentLinksHistory = useCallback(
    async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
      if (journalLoadInFlightRef.current) {
        return;
      }

      journalLoadInFlightRef.current = true;
      setIsJournalLoading(true);

      const endpoint = forceRefresh
        ? `${ADMIN_API_ENDPOINTS.inviteLinksHistory}?refresh=1`
        : ADMIN_API_ENDPOINTS.inviteLinksHistory;

      try {
        const response = await fetch(endpoint, {
          method: "GET",
          cache: "no-store",
        });
        const data = (await response.json()) as HistoryResponse;

        if (!response.ok) {
          if (data.errorCode === "unauthorized") {
            setAuthState("locked");
            setAuthStatus({
              text: "Сессия истекла. Введи пароль снова.",
              tone: "error",
            });
          }

          return;
        }

        const items = Array.isArray(data.items) ? data.items : [];

        setRecentLinks(items);
      } catch {
        // Silent by design: history request should not block admin actions.
      } finally {
        setHasLoadedJournalOnce(true);
        setIsJournalLoading(false);
        journalLoadInFlightRef.current = false;
      }
    },
    [],
  );

  const loadOnlineGroupAdminData = useCallback(async () => {
    setIsLoadingOnlineGroupData(true);

    try {
      const [chatsResponse, campaignsResponse, onlineGroupResponse] = await Promise.all([
        fetch(ADMIN_API_ENDPOINTS.telegramChats, {
          method: "GET",
          cache: "no-store",
        }),
        fetch(ADMIN_API_ENDPOINTS.renewalCampaigns, {
          method: "GET",
          cache: "no-store",
        }),
        fetch(ADMIN_API_ENDPOINTS.onlineGroupSettings, {
          method: "GET",
          cache: "no-store",
        }),
      ]);
      const chatsData = (await chatsResponse.json()) as TelegramChatsResponse;
      const campaignsData = (await campaignsResponse.json()) as RenewalCampaignsResponse;
      const onlineGroupData =
        (await onlineGroupResponse.json()) as OnlineGroupCampaignsResponse;

      if (!chatsResponse.ok || !campaignsResponse.ok || !onlineGroupResponse.ok) {
        if (
          chatsData.errorCode === "unauthorized" ||
          campaignsData.errorCode === "unauthorized" ||
          onlineGroupData.errorCode === "unauthorized"
        ) {
          setAuthState("locked");
          setAuthStatus({
            text: "Сессия истекла. Введи пароль снова.",
            tone: "error",
          });
          return;
        }

        setOnlineGroupStatus({
          text: "Не удалось загрузить настройки Online Group.",
          tone: "error",
        });
        setRenewalStatus({
          text: "Не удалось загрузить чаты или историю продлений.",
          tone: "error",
        });
        return;
      }

      const chats = Array.isArray(chatsData.chats) ? chatsData.chats : [];
      const campaigns = Array.isArray(campaignsData.campaigns)
        ? campaignsData.campaigns
        : [];

      setTelegramChats(chats);
      setRenewalCampaigns(campaigns);
      setOnlineGroupCampaigns(
        Array.isArray(onlineGroupData.campaigns) ? onlineGroupData.campaigns : [],
      );
      const activeOnlineGroupCampaign = onlineGroupData.campaigns?.find(
        (campaign) => campaign.status === "active",
      );
      setOnlineGroupRegularChatId(
        activeOnlineGroupCampaign?.mainChatId ?? chats[0]?.chatId ?? "",
      );
      setOnlineGroupLibraryChatId(
        activeOnlineGroupCampaign?.inspirationChatId ??
          chats[1]?.chatId ??
          chats[0]?.chatId ??
          "",
      );
      setOnlineGroupStartsAt(
        activeOnlineGroupCampaign?.startsAt
          ? formatDateTimeInput(activeOnlineGroupCampaign.startsAt)
          : "",
      );
      setOnlineGroupTitle(activeOnlineGroupCampaign?.title ?? "");
      setIsOnlineGroupFormOpen(!activeOnlineGroupCampaign);
      setRenewalSourceChatIds((currentValue) => {
        const validValues = currentValue.filter((chatId) =>
          chats.some((chat) => chat.chatId === chatId),
        );

        return validValues.length ? validValues : chats[0] ? [chats[0].chatId] : [];
      });
    } catch {
      setOnlineGroupStatus({
        text: "Ошибка сети при загрузке настроек Online Group.",
        tone: "error",
      });
      setRenewalStatus({
        text: "Ошибка сети при загрузке продлений.",
        tone: "error",
      });
    } finally {
      setHasLoadedOnlineGroupData(true);
      setIsLoadingOnlineGroupData(false);
    }
  }, []);

  const isJournalInitialLoading = isJournalLoading && !hasLoadedJournalOnce;
  const isMonthlySalesReportDisabled =
    isGeneratingMonthlySalesReport ||
    isLoadingMonthlySalesReportMonths ||
    !monthlySalesReportMonth;
  const firstTouchBroadcastPendingCount =
    (firstTouchBroadcastStats?.pending ?? 0) + (firstTouchBroadcastStats?.failed ?? 0);
  const isFirstTouchBroadcastDisabled =
    isLoadingFirstTouchBroadcastStats ||
    isSendingFirstTouchBroadcast ||
    firstTouchBroadcastPendingCount === 0;

  const loadFirstTouchBroadcastStats = useCallback(async () => {
    setIsLoadingFirstTouchBroadcastStats(true);

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.firstTouchBroadcast, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as FirstTouchBroadcastResponse;

      if (!response.ok) {
        if (data.errorCode === "unauthorized") {
          setAuthState("locked");
          setAuthStatus({
            text: "Сессия истекла. Введи пароль снова.",
            tone: "error",
          });
          return;
        }

        setFirstTouchBroadcastStatus({
          text: "Не удалось загрузить статистику рассылки.",
          tone: "error",
        });
        return;
      }

      setFirstTouchBroadcastStats(data.stats ?? null);
    } catch {
      setFirstTouchBroadcastStatus({
        text: "Не удалось загрузить статистику рассылки.",
        tone: "error",
      });
    } finally {
      setHasLoadedFirstTouchBroadcastStats(true);
      setIsLoadingFirstTouchBroadcastStats(false);
    }
  }, []);

  const loadMonthlySalesReportMonths = useCallback(async () => {
    setIsLoadingMonthlySalesReportMonths(true);

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.monthlySalesReport, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as MonthlySalesReportMonthsResponse;

      if (!response.ok) {
        if (data.errorCode === "unauthorized") {
          setAuthState("locked");
          setAuthStatus({
            text: "Сессия истекла. Введи пароль снова.",
            tone: "error",
          });
          return;
        }

        setMonthlySalesReportStatus({
          text: "Не удалось загрузить список месяцев для отчета.",
          tone: "error",
        });
        return;
      }

      const months = Array.isArray(data.months) ? data.months : [];

      setMonthlyReportMonthOptions(months);
      setMonthlySalesReportMonth((currentMonth) =>
        months.some((month) => month.value === currentMonth)
          ? currentMonth
          : (months[0]?.value ?? ""),
      );

      if (months.length === 0) {
        setMonthlySalesReportStatus({
          text: "Пока нет месяцев с успешными продажами.",
          tone: "info",
        });
      }
    } catch {
      setMonthlySalesReportStatus({
        text: "Не удалось загрузить список месяцев для отчета.",
        tone: "error",
      });
    } finally {
      setHasLoadedMonthlySalesReportMonths(true);
      setIsLoadingMonthlySalesReportMonths(false);
    }
  }, []);

  const handleGenerateMonthlySalesReport = useCallback(async () => {
    if (isMonthlySalesReportDisabled) {
      return;
    }

    setIsGeneratingMonthlySalesReport(true);
    setMonthlySalesReportStatus({
      text: "Генерирую и отправляю отчет...",
      tone: "info",
    });

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.monthlySalesReport, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportMonth: monthlySalesReportMonth,
        }),
      });
      const data = (await response.json()) as MonthlySalesReportResponse;

      if (!response.ok) {
        if (data.errorCode === "unauthorized") {
          setAuthState("locked");
          setAuthStatus({
            text: "Сессия истекла. Введи пароль снова.",
            tone: "error",
          });
        }

        if (
          data.errorCode === "invalid_monthly_sales_report_month" ||
          data.errorCode === "future_monthly_sales_report_month"
        ) {
          setMonthlySalesReportStatus({
            text: "Выбранный месяц невалиден. Обнови страницу и попробуй снова.",
            tone: "error",
          });
          return;
        }

        setMonthlySalesReportStatus({
          text: "Не удалось отправить отчет. Проверь настройки и попробуй снова.",
          tone: "error",
        });
        return;
      }

      if (data.status === "skipped" && data.skippedReason === "empty") {
        setMonthlySalesReportStatus({
          text: "За выбранный период продаж нет, письмо не отправлено.",
          tone: "info",
        });
        return;
      }

      if (data.status === "skipped" || data.isAlreadyDelivered) {
        setMonthlySalesReportStatus({
          text: "Отчет за этот период уже отправлялся.",
          tone: "info",
        });
        return;
      }

      setMonthlySalesReportStatus({
        text: `Отчет отправлен на ${data.deliveredTo || "адрес из RESEND_REPLY_TO"}. Строк: ${data.rowCount ?? 0}.`,
        tone: "success",
      });
    } catch {
      setMonthlySalesReportStatus({
        text: "Не удалось отправить отчет. Проверь настройки и попробуй снова.",
        tone: "error",
      });
    } finally {
      setIsGeneratingMonthlySalesReport(false);
    }
  }, [isMonthlySalesReportDisabled, monthlySalesReportMonth]);

  const handleSendFirstTouchBroadcast = useCallback(async () => {
    if (isFirstTouchBroadcastDisabled) {
      return;
    }

    setIsSendingFirstTouchBroadcast(true);
    setFirstTouchBroadcastStatus({
      text: "Отправляю рассылку First Touch...",
      tone: "info",
    });

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.firstTouchBroadcast, {
        method: "POST",
        cache: "no-store",
      });
      const data = (await response.json()) as FirstTouchBroadcastResponse;

      if (!response.ok) {
        if (data.errorCode === "unauthorized") {
          setAuthState("locked");
          setAuthStatus({
            text: "Сессия истекла. Введи пароль снова.",
            tone: "error",
          });
          return;
        }

        setFirstTouchBroadcastStatus({
          text: "Не удалось отправить рассылку. Проверь настройки Resend и таблицу.",
          tone: "error",
        });
        return;
      }

      const result = data.result;

      if (result) {
        setFirstTouchBroadcastStats({
          failed: result.failed,
          pending: result.pending,
          sent: result.sent,
          total: result.total,
        });
        setFirstTouchBroadcastStatus({
          text: `Рассылка обработана. Попыток: ${result.attempted}. Отправлено: ${result.sent}. Ошибок: ${result.failed}.`,
          tone: result.failed > 0 ? "info" : "success",
        });
      }
    } catch {
      setFirstTouchBroadcastStatus({
        text: "Ошибка сети при отправке рассылки.",
        tone: "error",
      });
    } finally {
      setIsSendingFirstTouchBroadcast(false);
    }
  }, [isFirstTouchBroadcastDisabled]);

  useEffect(() => {
    if (!isAuthorized) {
      setHasLoadedJournalOnce(false);
      setIsJournalLoading(false);
      journalLoadInFlightRef.current = false;
      setHasLoadedOnlineGroupData(false);
      setTelegramChats([]);
      setOnlineGroupCampaigns([]);
      setRenewalCampaigns([]);
      return;
    }

    void loadRecentLinksHistory();
  }, [isAuthorized, loadRecentLinksHistory]);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    if (
      !isOnlineGroupFeatureActive ||
      hasLoadedOnlineGroupData ||
      isLoadingOnlineGroupData
    ) {
      return;
    }

    void loadOnlineGroupAdminData();
  }, [
    hasLoadedOnlineGroupData,
    isAuthorized,
    isLoadingOnlineGroupData,
    isOnlineGroupFeatureActive,
    loadOnlineGroupAdminData,
  ]);

  useEffect(() => {
    if (!isAuthorized) {
      setHasLoadedMonthlySalesReportMonths(false);
      setIsLoadingMonthlySalesReportMonths(false);
      setMonthlyReportMonthOptions([]);
      setMonthlySalesReportMonth("");
      setMonthlySalesReportStatus(null);
      return;
    }

    if (
      !isReportsFeatureActive ||
      hasLoadedMonthlySalesReportMonths ||
      isLoadingMonthlySalesReportMonths
    ) {
      return;
    }

    void loadMonthlySalesReportMonths();
  }, [
    hasLoadedMonthlySalesReportMonths,
    isAuthorized,
    isLoadingMonthlySalesReportMonths,
    isReportsFeatureActive,
    loadMonthlySalesReportMonths,
  ]);

  useEffect(() => {
    if (!isAuthorized) {
      setHasLoadedFirstTouchBroadcastStats(false);
      setIsLoadingFirstTouchBroadcastStats(false);
      setFirstTouchBroadcastStats(null);
      setFirstTouchBroadcastStatus(null);
      return;
    }

    if (
      !isBroadcastsFeatureActive ||
      hasLoadedFirstTouchBroadcastStats ||
      isLoadingFirstTouchBroadcastStats
    ) {
      return;
    }

    void loadFirstTouchBroadcastStats();
  }, [
    hasLoadedFirstTouchBroadcastStats,
    isAuthorized,
    isBroadcastsFeatureActive,
    isLoadingFirstTouchBroadcastStats,
    loadFirstTouchBroadcastStats,
  ]);

  const checkAuthState = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setAuthStatus({
          text: "Проверяю сессию...",
          tone: "info",
        });
      }

      try {
        const response = await fetch(ADMIN_API_ENDPOINTS.auth, {
          method: "GET",
          cache: "no-store",
        });
        const data = (await response.json()) as AuthResponse;

        if (response.ok && data.authorized) {
          setAuthState("authorized");

          if (!silent) {
            setAuthStatus(null);
          }

          return;
        }

        setAuthState("locked");

        if (data.errorCode === "auth_not_configured") {
          setAuthStatus({
            text: "Не задан ADMIN_PASSWORD на сервере.",
            tone: "error",
          });
          return;
        }

        if (silent) {
          setAuthStatus({
            text: "Сессия завершена. Введи пароль снова.",
            tone: "info",
          });
          return;
        }

        setAuthStatus({
          text: "Введи пароль для доступа к админке.",
          tone: "info",
        });
      } catch {
        setAuthState("locked");
        setAuthStatus({
          text: "Не удалось проверить авторизацию. Попробуй обновить страницу.",
          tone: "error",
        });
      }
    },
    [],
  );

  useEffect(() => {
    void checkAuthState();

    const sessionHeartbeat = window.setInterval(() => {
      void checkAuthState({ silent: true });
    }, ADMIN_SESSION_HEARTBEAT_MS);

    return () => {
      window.clearInterval(sessionHeartbeat);
    };
  }, [checkAuthState]);

  const handleRefreshSession = async () => {
    if (isRefreshingSession) {
      return;
    }

    setIsRefreshingSession(true);

    try {
      await checkAuthState();
      await loadRecentLinksHistory();
    } finally {
      setIsRefreshingSession(false);
    }
  };

  const handleRefreshJournal = async () => {
    if (isJournalLoading) {
      return;
    }

    await loadRecentLinksHistory({
      forceRefresh: true,
    });
  };

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.auth, {
        method: "DELETE",
      });

      if (!response.ok) {
        setAuthStatus({
          text: "Не удалось завершить сессию. Попробуй снова.",
          tone: "error",
        });
        return;
      }

      setAuthState("locked");
      setAuthPassword("");
      setGeneratedLink("");
      setGeneratorStatus(null);
      setRecentLinks([]);
      setHasLoadedJournalOnce(false);
      setAuthStatus({
        text: "Сессия завершена.",
        tone: "info",
      });
    } catch {
      setAuthStatus({
        text: "Ошибка сети при завершении сессии.",
        tone: "error",
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleUnlockSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authPassword.trim() || isUnlocking) {
      return;
    }

    setIsUnlocking(true);
    setAuthStatus({
      text: "Проверяю пароль...",
      tone: "info",
    });

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.auth, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: authPassword,
        }),
      });
      const data = (await response.json()) as AuthResponse;

      if (response.ok && data.authorized) {
        setAuthState("authorized");
        setAuthPassword("");
        setAuthStatus(null);
        return;
      }

      if (data.errorCode === "invalid_password") {
        setAuthStatus({
          text: "Неверный пароль.",
          tone: "error",
        });
        return;
      }

      if (data.errorCode === "auth_not_configured") {
        setAuthStatus({
          text: "Не задан ADMIN_PASSWORD на сервере.",
          tone: "error",
        });
        return;
      }

      setAuthStatus({
        text: "Не удалось авторизоваться. Попробуй снова.",
        tone: "error",
      });
    } catch {
      setAuthStatus({
        text: "Ошибка сети при авторизации.",
        tone: "error",
      });
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleKindChange = (nextKind: GeneratorKind) => {
    setKind(nextKind);
    setGeneratedLink("");
    setGeneratorStatus(null);

    if (nextKind !== "choreo") {
      setSelectedChoreoKey("");
    }
  };

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isGenerateDisabled) {
      return;
    }

    setIsGenerating(true);
    setGeneratorStatus({
      text: "Генерирую invite-ссылку...",
      tone: "info",
    });
    setGeneratedLink("");

    const normalizedAdminLabel = adminLabel.trim();

    const body =
      kind === "choreo" && resolvedChoreoSelection
        ? {
            adminLabel: normalizedAdminLabel,
            kind,
            lessonLanguage: resolvedChoreoSelection.lessonLanguage,
            offerId: resolvedChoreoSelection.offerId,
            productId: resolvedChoreoSelection.productId,
          }
        : {
            adminLabel: normalizedAdminLabel,
            kind,
            lessonLanguage: "ru" satisfies LessonLanguage,
          };

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.inviteLinks, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as GenerateResponse;

      if (!response.ok || data.status !== "ready" || !data.accessUrl) {
        if (data.errorCode === "unauthorized") {
          setAuthState("locked");
          setAuthStatus({
            text: "Сессия истекла. Введи пароль снова.",
            tone: "error",
          });
          setGeneratorStatus(null);
          return;
        }

        setGeneratorStatus({
          text: resolveGeneratorErrorMessage(data.errorCode ?? "", data.reason ?? ""),
          tone: "error",
        });
        return;
      }

      const selectionLabel =
        kind === "choreo" && resolvedChoreoSelection
          ? resolvedChoreoSelection.label
          : "Первый курс (First Touch)";

      setGeneratedLink(data.accessUrl);
      setGeneratorStatus({
        text: "Ссылка готова. Можно копировать.",
        tone: "success",
      });
      setRecentLinks((previousLinks) => {
        return [
          {
            accessUrl: data.accessUrl ?? "",
            adminLabel: normalizedAdminLabel,
            createdAtIso: new Date().toISOString(),
            linkState: "active" satisfies LinkState,
            selectionLabel,
            tokenExpiresAt: data.tokenExpiresAt ?? "",
          },
          ...previousLinks.filter((entry) => entry.accessUrl !== data.accessUrl),
        ];
      });
      setAdminLabel("");
    } catch {
      setGeneratorStatus({
        text: "Ошибка сети при генерации ссылки.",
        tone: "error",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateRenewal = async (
    event?: FormEvent<HTMLFormElement>,
    regenerate = false,
  ) => {
    event?.preventDefault();

    if (isRenewalGenerateDisabled) {
      return;
    }

    setIsGeneratingRenewal(true);
    setGeneratedRenewalLink("");
    setRenewalStatus({
      text: regenerate
        ? "Перегенерирую checkout-ссылку продления..."
        : "Получаю checkout-ссылку продления...",
      tone: "info",
    });

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.renewalCampaigns, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offerId: renewalOfferId,
          regenerate,
          sourceChatIds: renewalSourceChatIds,
          title: renewalTitle,
        }),
      });
      const data = (await response.json()) as RenewalCampaignsResponse;

      if (!response.ok || data.status !== "ready" || !data.campaign?.checkoutUrl) {
        if (data.errorCode === "unauthorized") {
          setAuthState("locked");
          setAuthStatus({
            text: "Сессия истекла. Введи пароль снова.",
            tone: "error",
          });
          setRenewalStatus(null);
          return;
        }

        setRenewalStatus({
          text:
            data.errorCode === "same_source_and_target_chat"
              ? "Старый и новый чат должны отличаться."
              : data.errorCode === "telegram_chat_not_registered"
                ? "Один из чатов не зарегистрирован. Добавь бота в чат и отправь /register_chat."
                : data.errorCode === "renewal_offer_not_seeded"
                  ? "Скидочный offer не найден в БД. Запусти seed продуктов."
                  : "Не удалось создать ссылку продления.",
          tone: "error",
        });
        return;
      }

      setGeneratedRenewalLink(data.campaign.checkoutUrl);
      setRenewalStatus({
        text: data.reused
          ? "Активная checkout-ссылка уже была создана, можно копировать."
          : "Checkout-ссылка продления готова.",
        tone: "success",
      });
      setRenewalCampaigns((previousCampaigns) => {
        const nextCampaign: RenewalCampaignEntry = {
          checkoutUrl: data.campaign?.checkoutUrl ?? "",
          createdAt: data.campaign?.createdAt ?? new Date().toISOString(),
          id: data.campaign?.id ?? "",
          offerId: data.campaign?.offerId ?? renewalOfferId,
          slug: data.campaign?.slug ?? "",
          sourceChatId: renewalSourceChatIds[0] ?? "",
          sourceChatIds: data.campaign?.sourceChatIds ?? renewalSourceChatIds,
          sourceChatTitle:
            data.campaign?.sourceChatTitles?.[0] ?? renewalSourceChatIds[0] ?? "",
          sourceChatTitles: data.campaign?.sourceChatTitles ?? renewalSourceChatIds,
          status: "active",
          targetChatId: activeOnlineGroupCampaign?.mainChatId ?? "",
          title: data.campaign?.title ?? renewalTitle,
        };

        return [
          nextCampaign,
          ...previousCampaigns
            .filter(
              (campaign) =>
                campaign.id !== nextCampaign.id && campaign.slug !== nextCampaign.slug,
            )
            .map((campaign) =>
              campaign.offerId === nextCampaign.offerId &&
              campaign.targetChatId === nextCampaign.targetChatId
                ? { ...campaign, status: "archived" }
                : campaign,
            ),
        ];
      });
      setRenewalTitle("");
    } catch {
      setRenewalStatus({
        text: "Ошибка сети при создании ссылки продления.",
        tone: "error",
      });
    } finally {
      setIsGeneratingRenewal(false);
    }
  };

  const handleSaveOnlineGroupSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isOnlineGroupGenerateDisabled) {
      return;
    }

    setIsSavingOnlineGroupSettings(true);
    setOnlineGroupStatus({
      text: "Сохраняю настройки потока...",
      tone: "info",
    });

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.onlineGroupSettings, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspirationChatId: onlineGroupLibraryChatId,
          mainChatId: onlineGroupRegularChatId,
          startsAt: new Date(onlineGroupStartsAt).toISOString(),
          title: onlineGroupTitle,
        }),
      });
      const data = (await response.json()) as OnlineGroupCampaignsResponse;

      if (!response.ok || data.status !== "ready" || !data.campaign) {
        if (data.errorCode === "unauthorized") {
          setAuthState("locked");
          setAuthStatus({ text: "Сессия истекла. Введи пароль снова.", tone: "error" });
          return;
        }

        const errorText =
          data.errorCode === "same_main_and_inspiration_chat"
            ? "Основной чат и Inspiration Hub должны отличаться."
            : data.errorCode === "inspiration_chat_is_fixed"
              ? "Inspiration Hub уже закреплен и не может быть заменен."
              : data.errorCode === "telegram_chat_not_registered"
                ? "Один из чатов не зарегистрирован через /register_chat."
                : data.errorCode === "invalid_start_date"
                  ? "Укажи корректную дату старта потока."
                  : "Не удалось сохранить настройки Online Group.";

        setOnlineGroupStatus({ text: errorText, tone: "error" });
        return;
      }

      setOnlineGroupCampaigns((campaigns) => [
        data.campaign as OnlineGroupCampaignEntry,
        ...campaigns
          .filter((campaign) => campaign.id !== data.campaign?.id)
          .map((campaign) =>
            campaign.status === "active" ? { ...campaign, status: "archived" } : campaign,
          ),
      ]);
      setRenewalCampaigns((campaigns) =>
        campaigns.map((campaign) =>
          campaign.status === "active" &&
          campaign.targetChatId !== data.campaign?.mainChatId
            ? { ...campaign, status: "archived" }
            : campaign,
        ),
      );

      const generatedCampaign = renewalCampaigns.find(
        (campaign) => campaign.checkoutUrl === generatedRenewalLink,
      );

      if (
        generatedCampaign &&
        generatedCampaign.targetChatId !== data.campaign.mainChatId
      ) {
        setGeneratedRenewalLink("");
      }

      setOnlineGroupStatus({
        text: data.reused ? "Настройки уже актуальны." : "Новый поток активирован.",
        tone: "success",
      });
      setIsOnlineGroupFormOpen(false);
    } catch {
      setOnlineGroupStatus({
        text: "Ошибка сети при сохранении настроек Online Group.",
        tone: "error",
      });
    } finally {
      setIsSavingOnlineGroupSettings(false);
    }
  };

  const handleToggleRenewalStatus = async (slug: string, active: boolean) => {
    if (!slug || updatingRenewalSlug) {
      return;
    }

    const selectedCampaign = renewalCampaigns.find((campaign) => campaign.slug === slug);

    if (!selectedCampaign) {
      return;
    }

    setUpdatingRenewalSlug(slug);

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.renewalCampaigns, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active, slug }),
      });
      const data = (await response.json()) as { errorCode?: string };

      if (!response.ok) {
        setRenewalStatus({
          text:
            data.errorCode === "renewal_campaign_inactive"
              ? "Эта ссылка относится к старому потоку и не может быть включена."
              : data.errorCode === "renewal_campaign_not_found"
                ? "Ссылка продления не найдена."
                : "Не удалось изменить состояние ссылки.",
          tone: "error",
        });
        return;
      }

      setRenewalCampaigns((campaigns) =>
        campaigns.map((campaign) => {
          if (campaign.slug === slug) {
            return { ...campaign, status: active ? "active" : "archived" };
          }

          if (
            active &&
            campaign.offerId === selectedCampaign.offerId &&
            campaign.targetChatId === selectedCampaign.targetChatId
          ) {
            return { ...campaign, status: "archived" };
          }

          return campaign;
        }),
      );
      if (!active && selectedCampaign.checkoutUrl === generatedRenewalLink) {
        setGeneratedRenewalLink("");
      }
      setRenewalStatus({
        text: active ? "Ссылка продления включена." : "Ссылка продления выключена.",
        tone: "success",
      });
    } catch {
      setRenewalStatus({
        text: "Ошибка сети при изменении состояния ссылки.",
        tone: "error",
      });
    } finally {
      setUpdatingRenewalSlug("");
    }
  };

  const handleCopyLink = async (link: string) => {
    if (!link || copyingUrl) {
      return;
    }

    setCopyingUrl(link);

    try {
      await navigator.clipboard.writeText(link);
      setGeneratorStatus({
        text: "Ссылка скопирована.",
        tone: "success",
      });
    } catch {
      setGeneratorStatus({
        text: "Не удалось скопировать автоматически. Скопируй ссылку вручную.",
        tone: "error",
      });
    } finally {
      setCopyingUrl("");
    }
  };

  if (!isAuthorized) {
    return (
      <AdminLogin
        authPassword={authPassword}
        authStatus={authStatus}
        isChecking={isChecking}
        isUnlocking={isUnlocking}
        onPasswordChange={setAuthPassword}
        onSubmit={handleUnlockSubmit}
      />
    );
  }

  return (
    <AdminInvitePage>
      <AdminShell>
        <AdminSidebar
          activeFeatureId={activeFeature.id}
          isLoggingOut={isLoggingOut}
          isRefreshingSession={isRefreshingSession}
          onFeatureSelect={setActiveFeatureId}
          onLogout={handleLogout}
          onRefreshSession={handleRefreshSession}
        />

        <Card>
          <MainPanel>
            <AdminFeatureHeader feature={activeFeature} />

            {authStatus && (
              <StatusText $tone={authStatus.tone}>{authStatus.text}</StatusText>
            )}

            {isOnlineGroupFeatureActive ? (
              <OnlineGroupWorkspace>
                <ActiveOnlineGroupCard
                  activeCampaign={activeOnlineGroupCampaign}
                  activeMainChatTitle={activeMainChatTitle}
                  inspirationChatTitle={inspirationChatTitle}
                  isFormOpen={isOnlineGroupFormOpen}
                  isLoading={isLoadingOnlineGroupData}
                  isSaveDisabled={isOnlineGroupGenerateDisabled}
                  isSaving={isSavingOnlineGroupSettings}
                  libraryChatId={onlineGroupLibraryChatId}
                  mainChatId={onlineGroupRegularChatId}
                  onFormToggle={() =>
                    setIsOnlineGroupFormOpen((currentValue) => !currentValue)
                  }
                  onLibraryChatChange={(value) => {
                    setOnlineGroupLibraryChatId(value);
                    setOnlineGroupStatus(null);
                  }}
                  onMainChatChange={(value) => {
                    setOnlineGroupRegularChatId(value);
                    setOnlineGroupStatus(null);
                  }}
                  onRefresh={loadOnlineGroupAdminData}
                  onStartsAtChange={(value) => {
                    setOnlineGroupStartsAt(value);
                    setOnlineGroupStatus(null);
                  }}
                  onSubmit={handleSaveOnlineGroupSettings}
                  onTitleChange={setOnlineGroupTitle}
                  startsAt={onlineGroupStartsAt}
                  status={onlineGroupStatus}
                  telegramChatOptions={telegramChatSelectOptions}
                  title={onlineGroupTitle}
                />
                <RenewalGeneratorCard
                  chats={telegramChats}
                  copyingUrl={copyingUrl}
                  generatedLink={generatedRenewalLink}
                  isDisabled={isRenewalGenerateDisabled}
                  isGenerating={isGeneratingRenewal}
                  isLoading={isLoadingOnlineGroupData}
                  offerId={renewalOfferId}
                  offerOptions={renewalOfferSelectOptions}
                  onCopy={handleCopyLink}
                  onOfferChange={(value) => {
                    setRenewalOfferId(value);
                    setGeneratedRenewalLink("");
                    setRenewalStatus(null);
                  }}
                  onRegenerate={() => void handleGenerateRenewal(undefined, true)}
                  onSourceChatToggle={(chatId, checked) => {
                    setRenewalSourceChatIds((currentIds) =>
                      checked
                        ? [...new Set([...currentIds, chatId])]
                        : currentIds.filter((id) => id !== chatId),
                    );
                    setGeneratedRenewalLink("");
                    setRenewalStatus(null);
                  }}
                  onSubmit={handleGenerateRenewal}
                  onTitleChange={setRenewalTitle}
                  sourceChatIds={renewalSourceChatIds}
                  status={renewalStatus}
                  title={renewalTitle}
                />
                <RenewalCampaignsCard
                  campaigns={renewalCampaigns}
                  copyingUrl={copyingUrl}
                  onCopy={handleCopyLink}
                  onToggleStatus={handleToggleRenewalStatus}
                  updatingSlug={updatingRenewalSlug}
                />
              </OnlineGroupWorkspace>
            ) : isInviteLinksFeatureActive ? (
              <WorkspaceGrid>
                <WorkspacePrimary>
                  <InviteLinkGeneratorCard
                    adminLabel={adminLabel}
                    choreoSelectOptions={choreoSelectOptions}
                    copyingUrl={copyingUrl}
                    generatedLink={generatedLink}
                    generatorStatus={generatorStatus}
                    isGenerateDisabled={isGenerateDisabled}
                    isGenerating={isGenerating}
                    kind={kind}
                    kindSelectOptions={kindSelectOptions}
                    onAdminLabelChange={setAdminLabel}
                    onChoreoSelectionChange={(value) => {
                      setSelectedChoreoKey(value);
                      setGeneratedLink("");
                      setGeneratorStatus(null);
                    }}
                    onCopy={handleCopyLink}
                    onKindChange={handleKindChange}
                    onSubmit={handleGenerate}
                    resolvedChoreoSelection={resolvedChoreoSelection}
                    selectedChoreoKey={selectedChoreoKey}
                  />
                </WorkspacePrimary>

                <WorkspaceSecondary>
                  <InviteLinkPolicyCard accessPolicyLabel={accessPolicyLabel} />
                  <InviteLinkJournalCard
                    copyingUrl={copyingUrl}
                    isInitialLoading={isJournalInitialLoading}
                    isLoading={isJournalLoading}
                    links={recentLinks}
                    onCopy={handleCopyLink}
                    onRefresh={handleRefreshJournal}
                  />
                </WorkspaceSecondary>
              </WorkspaceGrid>
            ) : isBroadcastsFeatureActive ? (
              <BroadcastWorkspace
                isDisabled={isFirstTouchBroadcastDisabled}
                isLoadingStats={isLoadingFirstTouchBroadcastStats}
                isSending={isSendingFirstTouchBroadcast}
                onRefresh={loadFirstTouchBroadcastStats}
                onSend={handleSendFirstTouchBroadcast}
                pendingCount={firstTouchBroadcastPendingCount}
                stats={firstTouchBroadcastStats}
                status={firstTouchBroadcastStatus}
              />
            ) : isReportsFeatureActive ? (
              <ReportsWorkspace
                isDisabled={isMonthlySalesReportDisabled}
                isGenerating={isGeneratingMonthlySalesReport}
                isLoadingMonths={isLoadingMonthlySalesReportMonths}
                month={monthlySalesReportMonth}
                monthOptions={monthlyReportMonthOptions}
                onGenerate={handleGenerateMonthlySalesReport}
                onMonthChange={(value) => {
                  setMonthlySalesReportMonth(value);
                  setMonthlySalesReportStatus(null);
                }}
                status={monthlySalesReportStatus}
              />
            ) : (
              <UnavailableFeature feature={activeFeature} />
            )}
          </MainPanel>
        </Card>
      </AdminShell>
    </AdminInvitePage>
  );
}
