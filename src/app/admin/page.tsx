"use client";

import { Ban, Check, CircleHelp, Copy, MailX, RefreshCw, X } from "lucide-react";
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

import {
  AdminInvitePage,
  AdminShell,
  BroadcastActionButton,
  BroadcastActionGroup,
  BroadcastAudienceEmail,
  BroadcastAudienceName,
  BroadcastAudienceTable,
  BroadcastAudienceTableWrap,
  BroadcastAudienceWorkspace,
  BroadcastStatusBadge,
  ButtonRow,
  Card,
  CheckboxList,
  CopyButton,
  FeatureHelp,
  FeatureHelpButton,
  FeatureHelpTooltip,
  Form,
  FormControl,
  FormGrid,
  HeaderInfo,
  HeaderRow,
  HeaderTitleRow,
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
  SidebarIconButton,
  SidebarItem,
  SidebarItemLabel,
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

type AdminFeatureId = "invite-links" | "online-group" | "broadcasts" | "reports";
type GeneratorKind = "choreo" | "first-touch";
type LessonLanguage = "en" | "ru";
type LinkState = "active" | "used";
type StatusTone = "error" | "info" | "success";
type AuthState = "authorized" | "checking" | "locked";
type AdminFeature = {
  id: AdminFeatureId;
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
type OnlineGroupAdminAccessMode = "plus" | "standard";
type OnlineGroupAdminAccessState =
  | "expired"
  | "failed"
  | "issued"
  | "left"
  | "pending"
  | "revoked"
  | "used";
type OnlineGroupAdminAccess = {
  accessExpiresAt: string;
  accessKey: "inspiration-hub" | "main-group";
  accessUrl: string;
  chatId: string;
  chatTitle: string;
  state: OnlineGroupAdminAccessState;
  tokenExpiresAt: string;
};
type OnlineGroupAdminGrant = {
  accessMode: OnlineGroupAdminAccessMode;
  accesses: OnlineGroupAdminAccess[];
  adminLabel: string;
  createdAtIso: string;
  offerLabel: string;
  paymentIntentId: string;
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
type OnlineGroupAdminLinksResponse = {
  errorCode?: string;
  grant?: OnlineGroupAdminGrant;
  grants?: OnlineGroupAdminGrant[];
  status?: "not_available" | "partial" | "ready";
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
  excluded: number;
  failed: number;
  pending: number;
  sent: number;
  total: number;
};
type BroadcastAudienceLead = {
  createdAt: string;
  email: string;
  fullName: string;
  leadId: string;
  locale: string;
  socialContact: string;
  status: "failed" | "pending";
};
type BroadcastExclusionScope = "campaign" | "global";
type FirstTouchBroadcastResponse = {
  audience?: BroadcastAudienceLead[];
  errorCode?: string;
  exclusion?: {
    leadId: string;
    scope: BroadcastExclusionScope;
  };
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
  onlineGroupInviteLinks: "/admin/api/online-group-invite-links",
  onlineGroupSettings: "/admin/api/online-group-settings",
  renewalCampaigns: "/admin/api/renewal-campaigns",
  telegramChats: "/admin/api/telegram/chats",
} as const;

const ADMIN_SESSION_HEARTBEAT_MS = 5 * 60_000;
const JOURNAL_SKELETON_COUNT = 3;

const ADMIN_FEATURES: AdminFeature[] = [
  {
    id: "invite-links",
    label: "Invite-ссылки",
  },
  {
    id: "online-group",
    label: "Online Group",
  },
  {
    id: "broadcasts",
    label: "Рассылки",
  },
  {
    id: "reports",
    label: "Отчеты",
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
  }
> = {
  broadcasts: {
    description:
      "Проверь количество получателей и запусти разовую рассылку. Повторный запуск не затронет адреса, на которые письмо уже ушло.",
  },
  "invite-links": {
    description:
      "Создай персональную одноразовую ссылку на курс и скопируй её из журнала для отправки участнику.",
  },
  "online-group": {
    description:
      "Настрой активный поток. После запуска здесь появятся ручная выдача доступа и управление продлениями.",
  },
  reports: {
    description:
      "Выбери месяц, сформируй отчет по подтвержденным продажам и отправь его на рабочую почту.",
  },
};

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

const resolveLinkStateLabel = (state: LinkState) =>
  state === "used" ? "Использована" : "Активна";

const resolveOnlineGroupAccessStateLabel = (state: OnlineGroupAdminAccessState) => {
  if (state === "issued") {
    return "Ссылка активна";
  }

  if (state === "used") {
    return "Использована";
  }

  if (state === "expired") {
    return "Истекла";
  }

  if (state === "revoked") {
    return "Отозвана";
  }

  if (state === "left") {
    return "Покинул(а) чат";
  }

  if (state === "failed") {
    return "Ошибка создания";
  }

  return "Подготавливается";
};

const resolveOnlineGroupAccessTitle = (accessKey: OnlineGroupAdminAccess["accessKey"]) =>
  accessKey === "inspiration-hub" ? "Inspiration Hub" : "Основной чат";

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
        <LockDescription>Управление курсами, потоками и приглашениями.</LockDescription>
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
      <SidebarTitle>Anna Strok</SidebarTitle>
      <SidebarNav>
        {ADMIN_FEATURES.map((feature) => (
          <SidebarItem
            key={feature.id}
            type="button"
            $active={feature.id === activeFeatureId}
            onClick={() => onFeatureSelect(feature.id)}
            aria-current={feature.id === activeFeatureId ? "page" : undefined}
          >
            <SidebarItemLabel>{feature.label}</SidebarItemLabel>
          </SidebarItem>
        ))}
      </SidebarNav>
    </SidebarTop>

    <SidebarFooter>
      <SidebarActionRow>
        <SidebarIconButton
          type="button"
          onClick={onRefreshSession}
          disabled={isRefreshingSession}
          $isLoading={isRefreshingSession}
          aria-label="Проверить сессию"
          title="Проверить сессию"
        >
          <RefreshCw aria-hidden />
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
        <HeaderTitleRow>
          <Title>{feature.label}</Title>
          <FeatureHelp>
            <FeatureHelpButton
              type="button"
              aria-label={`Что можно сделать в разделе «${feature.label}»`}
              aria-describedby={`admin-feature-help-${feature.id}`}
            >
              <CircleHelp aria-hidden />
            </FeatureHelpButton>
            <FeatureHelpTooltip id={`admin-feature-help-${feature.id}`} role="tooltip">
              {copy.description}
            </FeatureHelpTooltip>
          </FeatureHelp>
        </HeaderTitleRow>
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
        <Copy aria-hidden />
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
  <SurfaceCard $wide>
    <SurfaceHeaderRow>
      <SurfaceTitle>Активный поток</SurfaceTitle>
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
          <RefreshCw aria-hidden />
        </IconActionButton>
      </SurfaceHeaderActions>
    </SurfaceHeaderRow>
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

type OnlineGroupInviteLinksCardProps = {
  accessMode: OnlineGroupAdminAccessMode;
  adminLabel: string;
  copyingUrl: string;
  grants: OnlineGroupAdminGrant[];
  isDisabled: boolean;
  isGenerating: boolean;
  isLoading: boolean;
  onAccessModeChange: (value: OnlineGroupAdminAccessMode) => void;
  onAdminLabelChange: (value: string) => void;
  onCopy: (link: string) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  status: StatusMessage;
};

const OnlineGroupInviteLinksCard = ({
  accessMode,
  adminLabel,
  copyingUrl,
  grants,
  isDisabled,
  isGenerating,
  isLoading,
  onAccessModeChange,
  onAdminLabelChange,
  onCopy,
  onRefresh,
  onSubmit,
  status,
}: OnlineGroupInviteLinksCardProps) => (
  <SurfaceCard $wide>
    <SurfaceHeaderRow>
      <SurfaceTitle>Выдать доступ вручную</SurfaceTitle>
      <IconActionButton
        type="button"
        onClick={onRefresh}
        disabled={isLoading}
        $isLoading={isLoading}
        aria-label="Обновить журнал ручных доступов"
        title="Обновить журнал ручных доступов"
      >
        <RefreshCw aria-hidden />
      </IconActionButton>
    </SurfaceHeaderRow>
    <SurfaceDescription>
      Standard — основной чат. Plus — основной чат и Inspiration Hub.
    </SurfaceDescription>

    <Form onSubmit={onSubmit}>
      <FormGrid>
        <FormControl>
          <Input
            id="online-group-admin-access-mode"
            name="onlineGroupAdminAccessMode"
            label="Тариф доступа"
            value={accessMode}
            selectOptions={[
              { label: "Standard — только основной чат", value: "standard" },
              { label: "Plus — основной чат + Hub", value: "plus" },
            ]}
            onChange={(event) =>
              onAccessModeChange(event.target.value as OnlineGroupAdminAccessMode)
            }
            disabled={isLoading}
            width="100%"
          />
        </FormControl>
        <FormControl>
          <Input
            id="online-group-admin-label"
            name="onlineGroupAdminLabel"
            label="Идентификатор"
            value={adminLabel}
            placeholder="Например: Аня / подарок / спец-доступ"
            onChange={(event) => onAdminLabelChange(event.target.value)}
            disabled={isLoading}
            width="100%"
          />
        </FormControl>
      </FormGrid>
      <ButtonRow>
        <Button
          buttonText={isGenerating ? "Генерирую..." : "Создать ссылки доступа"}
          type="submit"
          disabled={isDisabled}
          isLoading={isGenerating}
          width="100%"
        />
      </ButtonRow>
      {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}
    </Form>

    <SectionHeading>Журнал выдач</SectionHeading>
    {isLoading && grants.length === 0 ? (
      <JournalSkeletonList>
        {Array.from({ length: 2 }, (_, index) => (
          <JournalSkeletonCard key={`online-group-grant-skeleton-${index}`}>
            <SkeletonLine $width="58%" />
            <SkeletonLine $width="36%" />
            <SkeletonLine $width="100%" $height="36px" />
          </JournalSkeletonCard>
        ))}
      </JournalSkeletonList>
    ) : grants.length === 0 ? (
      <JournalEmptyState>Ручных выдач для Online Group пока нет.</JournalEmptyState>
    ) : (
      <RecentLinksList>
        {grants.map((grant) => (
          <RecentLinkCard key={grant.paymentIntentId}>
            <RecentLinkHeader>
              <RecentLinkMeta>{grant.adminLabel}</RecentLinkMeta>
              <LinkStateBadge $state="active">
                {grant.accessMode === "plus" ? "Plus" : "Standard"}
              </LinkStateBadge>
            </RecentLinkHeader>
            <RecentLinkMeta>Создано: {formatDateTime(grant.createdAtIso)}</RecentLinkMeta>

            {grant.accesses.length === 0 ? (
              <StatusText $tone="error">Ссылки для этой выдачи не созданы.</StatusText>
            ) : (
              grant.accesses.map((access) => (
                <RecentLinkCard
                  key={`${grant.paymentIntentId}-${access.accessKey}-${access.chatId}`}
                >
                  <RecentLinkHeader>
                    <RecentLinkMeta>
                      {resolveOnlineGroupAccessTitle(access.accessKey)}
                    </RecentLinkMeta>
                    <LinkStateBadge
                      $state={access.state === "issued" ? "active" : "used"}
                    >
                      {resolveOnlineGroupAccessStateLabel(access.state)}
                    </LinkStateBadge>
                  </RecentLinkHeader>
                  <RecentLinkMeta>
                    Чат: {access.chatTitle || access.chatId || "не определён"}
                  </RecentLinkMeta>
                  <RecentLinkMeta>
                    Токен до:{" "}
                    {access.tokenExpiresAt
                      ? formatDateTime(access.tokenExpiresAt)
                      : "не определено"}
                    {access.accessExpiresAt
                      ? ` | Доступ до: ${formatDateTime(access.accessExpiresAt)}`
                      : ""}
                  </RecentLinkMeta>
                  {access.accessUrl ? (
                    <CopyableLink
                      isCopying={copyingUrl === access.accessUrl}
                      link={access.accessUrl}
                      onCopy={onCopy}
                    />
                  ) : (
                    <StatusText $tone={access.state === "failed" ? "error" : "info"}>
                      Активной ссылки для копирования нет.
                    </StatusText>
                  )}
                </RecentLinkCard>
              ))
            )}
          </RecentLinkCard>
        ))}
      </RecentLinksList>
    )}
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
    <SurfaceTitle>Создать ссылку продления</SurfaceTitle>
    <Form onSubmit={onSubmit}>
      <FormControl>
        <PolicyLabel>Участники из этих чатов смогут оплатить</PolicyLabel>
        {chats.length === 0 ? (
          <StatusText $tone="info">Доступных чатов пока нет.</StatusText>
        ) : (
          <CheckboxList>
            {chats.map((chat) => (
              <Checkbox
                key={chat.chatId}
                checked={sourceChatIds.includes(chat.chatId)}
                disabled={isLoading}
                name={`renewal-source-${chat.chatId}`}
                onChange={(event) =>
                  onSourceChatToggle(chat.chatId, event.target.checked)
                }
                placeholder={`${chat.title} (${chat.chatId})`}
              />
            ))}
          </CheckboxList>
        )}
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
    <SurfaceTitle>Ссылки продления</SurfaceTitle>
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
  selectedChoreoKey,
}: InviteLinkGeneratorCardProps) => (
  <SurfaceCard>
    <SurfaceTitle>Генератор доступа</SurfaceTitle>
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
        <RefreshCw aria-hidden />
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
  audience: BroadcastAudienceLead[];
  confirmingGlobalLeadId: string;
  isDisabled: boolean;
  isLoadingStats: boolean;
  isSending: boolean;
  isUpdatingLeadId: string;
  onExclude: (
    lead: BroadcastAudienceLead,
    scope: BroadcastExclusionScope,
  ) => void | Promise<void>;
  onGlobalExcludeCancel: () => void;
  onGlobalExcludeRequest: (leadId: string) => void;
  onRefresh: () => void | Promise<void>;
  onSend: () => void | Promise<void>;
  pendingCount: number;
  stats: BroadcastStats | null;
  status: StatusMessage;
};

const BroadcastWorkspace = ({
  audience,
  confirmingGlobalLeadId,
  isDisabled,
  isLoadingStats,
  isSending,
  isUpdatingLeadId,
  onExclude,
  onGlobalExcludeCancel,
  onGlobalExcludeRequest,
  onRefresh,
  onSend,
  pendingCount,
  stats,
  status,
}: BroadcastWorkspaceProps) => (
  <BroadcastAudienceWorkspace>
    <SurfaceCard>
      <SurfaceHeaderRow>
        <SurfaceTitle>First Touch: старт продаж</SurfaceTitle>
        <IconActionButton
          type="button"
          onClick={onRefresh}
          disabled={isLoadingStats}
          $isLoading={isLoadingStats}
          aria-label="Обновить данные рассылки"
          title="Обновить данные рассылки"
        >
          <RefreshCw aria-hidden />
        </IconActionButton>
      </SurfaceHeaderRow>
      <SurfaceDescription>Уже отправленные адреса не затрагиваются.</SurfaceDescription>
      <Form as="div">
        <SummaryGrid>
          <SummaryItem>
            <SummaryLabel>Всего заявок</SummaryLabel>
            <SummaryValue>{stats?.total ?? 0}</SummaryValue>
          </SummaryItem>
          <SummaryItem>
            <SummaryLabel>Ожидают</SummaryLabel>
            <SummaryValue>{stats?.pending ?? 0}</SummaryValue>
          </SummaryItem>
          <SummaryItem>
            <SummaryLabel>С ошибкой</SummaryLabel>
            <SummaryValue>{stats?.failed ?? 0}</SummaryValue>
          </SummaryItem>
          <SummaryItem>
            <SummaryLabel>Отправлено</SummaryLabel>
            <SummaryValue>{stats?.sent ?? 0}</SummaryValue>
          </SummaryItem>
          <SummaryItem>
            <SummaryLabel>Исключено</SummaryLabel>
            <SummaryValue>{stats?.excluded ?? 0}</SummaryValue>
          </SummaryItem>
        </SummaryGrid>
        <ButtonRow>
          <Button
            buttonText={
              isSending
                ? "Отправляю..."
                : isLoadingStats
                  ? "Загружаю данные..."
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
      </Form>
    </SurfaceCard>

    <SurfaceCard>
      <SurfaceTitle>Ожидают отправки</SurfaceTitle>
      <SurfaceDescription>
        Здесь только те, кому письмо еще не отправлено.
      </SurfaceDescription>

      {isLoadingStats && audience.length === 0 ? (
        <JournalSkeletonList>
          {Array.from({ length: 3 }, (_, index) => (
            <JournalSkeletonCard key={`broadcast-audience-skeleton-${index}`}>
              <SkeletonLine $width="42%" />
              <SkeletonLine $width="68%" />
              <SkeletonLine $height="32px" $width="100%" />
            </JournalSkeletonCard>
          ))}
        </JournalSkeletonList>
      ) : audience.length === 0 ? (
        <JournalEmptyState>Все готово — ожидающих отправки нет.</JournalEmptyState>
      ) : (
        <BroadcastAudienceTableWrap>
          <BroadcastAudienceTable aria-label="Пользователи, ожидающие рассылки">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Контакт</th>
                <th>Язык</th>
                <th>Заявка</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {audience.map((lead) => {
                const isUpdating = isUpdatingLeadId === lead.leadId;
                const isConfirmingGlobal = confirmingGlobalLeadId === lead.leadId;

                return (
                  <tr key={lead.leadId}>
                    <td data-label="Участник">
                      <span>
                        <BroadcastAudienceName>
                          {lead.fullName || "Без имени"}
                        </BroadcastAudienceName>
                        <BroadcastAudienceEmail>{lead.email}</BroadcastAudienceEmail>
                      </span>
                    </td>
                    <td data-label="Контакт">{lead.socialContact || "—"}</td>
                    <td data-label="Язык">{lead.locale.toUpperCase() || "—"}</td>
                    <td data-label="Заявка">{formatDateTime(lead.createdAt)}</td>
                    <td data-label="Статус">
                      <BroadcastStatusBadge $status={lead.status}>
                        {lead.status === "failed" ? "Ошибка — повторим" : "Ожидает"}
                      </BroadcastStatusBadge>
                    </td>
                    <td data-label="Действия">
                      <BroadcastActionGroup>
                        {isConfirmingGlobal ? (
                          <>
                            <BroadcastActionButton
                              type="button"
                              $danger
                              onClick={() => onExclude(lead, "global")}
                              disabled={isSending || Boolean(isUpdatingLeadId)}
                              title="Подтвердить исключение из будущих рассылок"
                            >
                              <Check aria-hidden />
                              {isUpdating ? "Сохраняю..." : "Подтвердить"}
                            </BroadcastActionButton>
                            <BroadcastActionButton
                              type="button"
                              onClick={onGlobalExcludeCancel}
                              disabled={Boolean(isUpdatingLeadId)}
                            >
                              <X aria-hidden />
                              Отмена
                            </BroadcastActionButton>
                          </>
                        ) : (
                          <>
                            <BroadcastActionButton
                              type="button"
                              onClick={() => onExclude(lead, "campaign")}
                              disabled={isSending || Boolean(isUpdatingLeadId)}
                              title="Не отправлять письмо в этой рассылке"
                            >
                              <MailX aria-hidden />
                              {isUpdating ? "Сохраняю..." : "Не отправлять"}
                            </BroadcastActionButton>
                            <BroadcastActionButton
                              type="button"
                              $danger
                              onClick={() => onGlobalExcludeRequest(lead.leadId)}
                              disabled={isSending || Boolean(isUpdatingLeadId)}
                              title="Не включать этот email в будущие рассылки"
                            >
                              <Ban aria-hidden />
                              Исключить везде
                            </BroadcastActionButton>
                          </>
                        )}
                      </BroadcastActionGroup>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </BroadcastAudienceTable>
        </BroadcastAudienceTableWrap>
      )}
    </SurfaceCard>
  </BroadcastAudienceWorkspace>
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
        <SurfaceDescription>Готовый отчет придет на рабочую почту.</SurfaceDescription>
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
  </WorkspaceGrid>
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
  const [onlineGroupAdminAccessMode, setOnlineGroupAdminAccessMode] =
    useState<OnlineGroupAdminAccessMode>("standard");
  const [onlineGroupAdminLabel, setOnlineGroupAdminLabel] = useState("");
  const [onlineGroupAdminGrants, setOnlineGroupAdminGrants] = useState<
    OnlineGroupAdminGrant[]
  >([]);
  const [onlineGroupAdminStatus, setOnlineGroupAdminStatus] =
    useState<StatusMessage>(null);
  const [isGeneratingOnlineGroupAdminAccess, setIsGeneratingOnlineGroupAdminAccess] =
    useState(false);
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
  const [firstTouchBroadcastAudience, setFirstTouchBroadcastAudience] = useState<
    BroadcastAudienceLead[]
  >([]);
  const [firstTouchBroadcastStatus, setFirstTouchBroadcastStatus] =
    useState<StatusMessage>(null);
  const [isLoadingFirstTouchBroadcastStats, setIsLoadingFirstTouchBroadcastStats] =
    useState(false);
  const [isSendingFirstTouchBroadcast, setIsSendingFirstTouchBroadcast] = useState(false);
  const [updatingFirstTouchBroadcastLeadId, setUpdatingFirstTouchBroadcastLeadId] =
    useState("");
  const [confirmingGlobalBroadcastLeadId, setConfirmingGlobalBroadcastLeadId] =
    useState("");
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
  const hasConfiguredOnlineGroup = Boolean(
    activeOnlineGroupCampaign?.mainChatId &&
    activeOnlineGroupCampaign.inspirationChatId &&
    activeOnlineGroupCampaign.startsAt &&
    telegramChats.some((chat) => chat.chatId === activeOnlineGroupCampaign.mainChatId) &&
    telegramChats.some(
      (chat) => chat.chatId === activeOnlineGroupCampaign.inspirationChatId,
    ),
  );
  const isOnlineGroupAdminGenerateDisabled =
    isGeneratingOnlineGroupAdminAccess ||
    isLoadingOnlineGroupData ||
    !hasConfiguredOnlineGroup ||
    !onlineGroupAdminLabel.trim();
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
      const [chatsResponse, campaignsResponse, onlineGroupResponse, adminLinksResponse] =
        await Promise.all([
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
          fetch(ADMIN_API_ENDPOINTS.onlineGroupInviteLinks, {
            method: "GET",
            cache: "no-store",
          }),
        ]);
      const chatsData = (await chatsResponse.json()) as TelegramChatsResponse;
      const campaignsData = (await campaignsResponse.json()) as RenewalCampaignsResponse;
      const onlineGroupData =
        (await onlineGroupResponse.json()) as OnlineGroupCampaignsResponse;
      const adminLinksData =
        (await adminLinksResponse.json()) as OnlineGroupAdminLinksResponse;

      if (adminLinksData.errorCode === "unauthorized") {
        setAuthState("locked");
        setAuthStatus({
          text: "Сессия истекла. Введи пароль снова.",
          tone: "error",
        });
        return;
      }

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
      if (adminLinksResponse.ok) {
        setOnlineGroupAdminGrants(
          Array.isArray(adminLinksData.grants) ? adminLinksData.grants : [],
        );
      } else {
        setOnlineGroupAdminStatus({
          text: "Не удалось загрузить журнал ручных доступов.",
          tone: "error",
        });
      }
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
      setOnlineGroupAdminStatus({
        text: "Ошибка сети при загрузке ручных доступов.",
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
      setFirstTouchBroadcastAudience(data.audience ?? []);
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
        setFirstTouchBroadcastStats(data.stats ?? result);
        setFirstTouchBroadcastAudience(data.audience ?? []);
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

  const handleExcludeFirstTouchBroadcastLead = useCallback(
    async (lead: BroadcastAudienceLead, scope: BroadcastExclusionScope) => {
      if (isSendingFirstTouchBroadcast || updatingFirstTouchBroadcastLeadId) {
        return;
      }

      setUpdatingFirstTouchBroadcastLeadId(lead.leadId);
      setFirstTouchBroadcastStatus({
        text:
          scope === "global"
            ? `Исключаю ${lead.email} из будущих рассылок...`
            : `Убираю ${lead.email} из текущей рассылки...`,
        tone: "info",
      });

      try {
        const response = await fetch(ADMIN_API_ENDPOINTS.firstTouchBroadcast, {
          method: "PATCH",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: lead.leadId, scope }),
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
            text:
              data.errorCode === "broadcast_in_progress"
                ? "Сейчас идет отправка. Дождись завершения и попробуй снова."
                : data.errorCode === "lead_not_actionable"
                  ? "Статус пользователя уже изменился. Обнови список."
                  : "Не удалось изменить участие в рассылке.",
            tone: "error",
          });
          return;
        }

        setFirstTouchBroadcastStats(data.stats ?? null);
        setFirstTouchBroadcastAudience(data.audience ?? []);
        setConfirmingGlobalBroadcastLeadId("");
        setFirstTouchBroadcastStatus({
          text:
            scope === "global"
              ? `${lead.email} больше не будет включаться в будущие рассылки.`
              : `${lead.email} исключен из этой рассылки.`,
          tone: "success",
        });
      } catch {
        setFirstTouchBroadcastStatus({
          text: "Ошибка сети при изменении участия в рассылке.",
          tone: "error",
        });
      } finally {
        setUpdatingFirstTouchBroadcastLeadId("");
      }
    },
    [isSendingFirstTouchBroadcast, updatingFirstTouchBroadcastLeadId],
  );

  useEffect(() => {
    if (!isAuthorized) {
      setHasLoadedJournalOnce(false);
      setIsJournalLoading(false);
      journalLoadInFlightRef.current = false;
      setHasLoadedOnlineGroupData(false);
      setTelegramChats([]);
      setOnlineGroupCampaigns([]);
      setOnlineGroupAdminGrants([]);
      setOnlineGroupAdminStatus(null);
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
      setFirstTouchBroadcastAudience([]);
      setFirstTouchBroadcastStatus(null);
      setUpdatingFirstTouchBroadcastLeadId("");
      setConfirmingGlobalBroadcastLeadId("");
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
      setOnlineGroupAdminGrants([]);
      setOnlineGroupAdminStatus(null);
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

  const handleGenerateOnlineGroupAdminAccess = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (isOnlineGroupAdminGenerateDisabled) {
      return;
    }

    setIsGeneratingOnlineGroupAdminAccess(true);
    setOnlineGroupAdminStatus({
      text: "Генерирую персональные invite-ссылки...",
      tone: "info",
    });

    const normalizedAdminLabel = onlineGroupAdminLabel.trim();

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.onlineGroupInviteLinks, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessMode: onlineGroupAdminAccessMode,
          adminLabel: normalizedAdminLabel,
        }),
      });
      const data = (await response.json()) as OnlineGroupAdminLinksResponse;

      if (data.errorCode === "unauthorized") {
        setAuthState("locked");
        setAuthStatus({
          text: "Сессия истекла. Введи пароль снова.",
          tone: "error",
        });
        setOnlineGroupAdminStatus(null);
        return;
      }

      if (!response.ok || !data.grant) {
        const errorText =
          data.errorCode === "online_group_settings_not_configured"
            ? "Сначала настрой и активируй поток с основным чатом и Inspiration Hub."
            : data.errorCode === "rate_limited"
              ? "Слишком много запросов. Подожди немного и попробуй снова."
              : data.errorCode === "missing_admin_label"
                ? "Добавь идентификатор получателя."
                : "Не удалось создать ссылки доступа.";

        setOnlineGroupAdminStatus({ text: errorText, tone: "error" });
        return;
      }

      const grant = {
        ...data.grant,
        accesses: data.grant.accesses.map((access) => ({
          ...access,
          chatTitle:
            access.chatTitle ||
            telegramChats.find((chat) => chat.chatId === access.chatId)?.title ||
            access.chatId,
        })),
      } satisfies OnlineGroupAdminGrant;

      setOnlineGroupAdminGrants((grants) => [
        grant,
        ...grants.filter(
          (existingGrant) => existingGrant.paymentIntentId !== grant.paymentIntentId,
        ),
      ]);
      setOnlineGroupAdminLabel("");
      setOnlineGroupAdminStatus(
        data.status === "ready"
          ? {
              text:
                grant.accessMode === "plus"
                  ? "Ссылки в основной чат и Inspiration Hub готовы."
                  : "Ссылка в основной чат готова.",
              tone: "success",
            }
          : data.status === "partial"
            ? {
                text: "Создана только часть ссылок. Проверь статусы ниже.",
                tone: "info",
              }
            : {
                text: "Telegram не смог создать ссылки. Проверь статусы ниже.",
                tone: "error",
              },
      );
    } catch {
      setOnlineGroupAdminStatus({
        text: "Ошибка сети при генерации ссылок доступа.",
        tone: "error",
      });
    } finally {
      setIsGeneratingOnlineGroupAdminAccess(false);
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
                {hasConfiguredOnlineGroup && (
                  <OnlineGroupInviteLinksCard
                    accessMode={onlineGroupAdminAccessMode}
                    adminLabel={onlineGroupAdminLabel}
                    copyingUrl={copyingUrl}
                    grants={onlineGroupAdminGrants}
                    isDisabled={isOnlineGroupAdminGenerateDisabled}
                    isGenerating={isGeneratingOnlineGroupAdminAccess}
                    isLoading={isLoadingOnlineGroupData}
                    onAccessModeChange={(value) => {
                      setOnlineGroupAdminAccessMode(value);
                      setOnlineGroupAdminStatus(null);
                    }}
                    onAdminLabelChange={(value) => {
                      setOnlineGroupAdminLabel(value);
                      setOnlineGroupAdminStatus(null);
                    }}
                    onCopy={handleCopyLink}
                    onRefresh={loadOnlineGroupAdminData}
                    onSubmit={handleGenerateOnlineGroupAdminAccess}
                    status={onlineGroupAdminStatus}
                  />
                )}
                {activeOnlineGroupCampaign && (
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
                )}
                {(activeOnlineGroupCampaign || renewalCampaigns.length > 0) && (
                  <RenewalCampaignsCard
                    campaigns={renewalCampaigns}
                    copyingUrl={copyingUrl}
                    onCopy={handleCopyLink}
                    onToggleStatus={handleToggleRenewalStatus}
                    updatingSlug={updatingRenewalSlug}
                  />
                )}
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
                    selectedChoreoKey={selectedChoreoKey}
                  />
                </WorkspacePrimary>

                <WorkspaceSecondary>
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
                audience={firstTouchBroadcastAudience}
                confirmingGlobalLeadId={confirmingGlobalBroadcastLeadId}
                isDisabled={isFirstTouchBroadcastDisabled}
                isLoadingStats={isLoadingFirstTouchBroadcastStats}
                isSending={isSendingFirstTouchBroadcast}
                isUpdatingLeadId={updatingFirstTouchBroadcastLeadId}
                onExclude={handleExcludeFirstTouchBroadcastLead}
                onGlobalExcludeCancel={() => setConfirmingGlobalBroadcastLeadId("")}
                onGlobalExcludeRequest={setConfirmingGlobalBroadcastLeadId}
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
            ) : null}
          </MainPanel>
        </Card>
      </AdminShell>
    </AdminInvitePage>
  );
}
