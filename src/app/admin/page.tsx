"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";
import { getOfferAccessDurationDaysByOfferId } from "@/lib/telegram/offer-access";

import {
  AdminInvitePage,
  AdminShell,
  ButtonRow,
  Card,
  CopyButton,
  Description,
  FeaturePlaceholder,
  Form,
  FormControl,
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
  PolicyLabel,
  PolicyList,
  PolicyRow,
  PolicyValue,
  RecentLinkCard,
  RecentLinkHeader,
  RecentLinkMeta,
  RecentLinksList,
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
  SurfaceCard,
  SurfaceDescription,
  SurfaceHeaderRow,
  SurfaceTitle,
  Title,
  WorkspaceGrid,
  WorkspacePrimary,
  WorkspaceSecondary,
} from "./page.styles";

type AdminFeatureId = "invite-links" | "access-control" | "broadcasts" | "reports";
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

const ADMIN_FEATURES: AdminFeature[] = [
  {
    id: "invite-links",
    isAvailable: true,
    label: "Invite-ссылки",
    description: "Ручная выдача доступов без покупки",
  },
  {
    id: "access-control",
    isAvailable: false,
    label: "Управление доступом",
    description: "История, отзыв, продление (скоро)",
  },
  {
    id: "broadcasts",
    isAvailable: false,
    label: "Рассылки",
    description: "Сервисные уведомления (скоро)",
  },
  {
    id: "reports",
    isAvailable: false,
    label: "Отчеты",
    description: "Срезы по активациям (скоро)",
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

export default function AdminPage() {
  const choreoSelections = useMemo(getChoreoSelections, []);
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
  const [copyingUrl, setCopyingUrl] = useState("");
  const [hasLoadedJournalOnce, setHasLoadedJournalOnce] = useState(false);
  const [isJournalLoading, setIsJournalLoading] = useState(false);
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
        ? "/admin/api/invite-links/history?refresh=1"
        : "/admin/api/invite-links/history";

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

  const isJournalInitialLoading = isJournalLoading && !hasLoadedJournalOnce;

  useEffect(() => {
    if (!isAuthorized) {
      setHasLoadedJournalOnce(false);
      setIsJournalLoading(false);
      journalLoadInFlightRef.current = false;
      return;
    }

    void loadRecentLinksHistory();
  }, [isAuthorized, loadRecentLinksHistory]);

  const checkAuthState = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setAuthStatus({
          text: "Проверяю сессию...",
          tone: "info",
        });
      }

      try {
        const response = await fetch("/admin/auth", {
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
    }, 5 * 60_000);

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
      const response = await fetch("/admin/auth", {
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
      const response = await fetch("/admin/auth", {
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
      const response = await fetch("/admin/api/invite-links", {
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
      <AdminInvitePage>
        <LockViewport>
          <LockCard>
            <LockTitle>Вход в админ-панель</LockTitle>
            <LockDescription>
              Пароль открывает доступ ко всей админ-панели
            </LockDescription>
            <Form onSubmit={handleUnlockSubmit}>
              <FormControl>
                <Input
                  id="admin-password"
                  name="adminPassword"
                  type="password"
                  label="Пароль"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
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
  }

  return (
    <AdminInvitePage>
      <AdminShell>
        <Sidebar>
          <SidebarTop>
            <SidebarTitle>Admin</SidebarTitle>
            <SidebarHint>Выбери нужный раздел слева.</SidebarHint>
            <SidebarNav>
              {ADMIN_FEATURES.map((feature) => (
                <SidebarItem
                  key={feature.id}
                  type="button"
                  $active={feature.id === activeFeature.id}
                  $available={feature.isAvailable}
                  onClick={() => feature.isAvailable && setActiveFeatureId(feature.id)}
                  disabled={!feature.isAvailable}
                  aria-current={feature.id === activeFeature.id ? "page" : undefined}
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
                onClick={handleRefreshSession}
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
                onClick={handleLogout}
                disabled={isLoggingOut}
                isLoading={isLoggingOut}
                size="sm"
                variant="secondary"
                width="100%"
              />
            </SidebarActionRow>
          </SidebarFooter>
        </Sidebar>

        <Card>
          <MainPanel>
            <HeaderRow>
              <HeaderInfo>
                <Title>{activeFeature.label}</Title>
                <Description>
                  {isInviteLinksFeatureActive
                    ? "Генерация одноразовых Telegram invite-ссылок с той же бизнес-логикой, что и в боевом платежном потоке."
                    : "Раздел в подготовке. Ниже можно размещать таблицы, фильтры и операционные действия."}
                </Description>
                <HeaderMeta>
                  Для каждого invite добавляй идентификатор, чтобы журнал был понятным.
                </HeaderMeta>
              </HeaderInfo>
            </HeaderRow>

            {authStatus && (
              <StatusText $tone={authStatus.tone}>{authStatus.text}</StatusText>
            )}

            {isInviteLinksFeatureActive ? (
              <WorkspaceGrid>
                <WorkspacePrimary>
                  <SurfaceCard>
                    <SurfaceTitle>Генератор доступа</SurfaceTitle>
                    <SurfaceDescription>
                      Выбери тип продукта, добавь идентификатор и сгенерируй одноразовую
                      ссылку доступа в канал.
                    </SurfaceDescription>
                    <Form onSubmit={handleGenerate}>
                      <FormControl>
                        <Input
                          id="generator-kind"
                          name="generatorKind"
                          label="Что генерируем"
                          value={kind}
                          onChange={(event) =>
                            handleKindChange(event.target.value as GeneratorKind)
                          }
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
                            onChange={(event) => {
                              setSelectedChoreoKey(event.target.value);
                              setGeneratedLink("");
                              setGeneratorStatus(null);
                            }}
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
                          onChange={(event) => setAdminLabel(event.target.value)}
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
                          Добавь идентификатор, чтобы потом было понятно, кому или для
                          чего выдавалась ссылка.
                        </StatusText>
                      )}

                      <ButtonRow>
                        <Button
                          buttonText={
                            isGenerating ? "Генерирую..." : "Сгенерировать ссылку"
                          }
                          type="submit"
                          disabled={isGenerateDisabled}
                          isLoading={isGenerating}
                          width="100%"
                        />
                      </ButtonRow>

                      {generatorStatus && (
                        <StatusText $tone={generatorStatus.tone}>
                          {generatorStatus.text}
                        </StatusText>
                      )}

                      {generatedLink && (
                        <ResultBox>
                          <ResultValue>{generatedLink}</ResultValue>
                          <CopyButton>
                            <IconActionButton
                              type="button"
                              onClick={() => handleCopyLink(generatedLink)}
                              disabled={copyingUrl === generatedLink}
                              $isLoading={copyingUrl === generatedLink}
                              aria-label="Копировать ссылку"
                              title="Копировать ссылку"
                            >
                              <CopyIcon />
                            </IconActionButton>
                          </CopyButton>
                        </ResultBox>
                      )}
                    </Form>
                  </SurfaceCard>
                </WorkspacePrimary>

                <WorkspaceSecondary>
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
                        <PolicyValue>Google Sheets + Telegram workflow</PolicyValue>
                      </PolicyRow>
                      <PolicyRow>
                        <PolicyLabel>Защита API</PolicyLabel>
                        <PolicyValue>Origin check + rate limiting</PolicyValue>
                      </PolicyRow>
                    </PolicyList>
                  </SurfaceCard>

                  <SurfaceCard>
                    <SurfaceHeaderRow>
                      <SurfaceTitle>Журнал последних ссылок</SurfaceTitle>
                      <IconActionButton
                        type="button"
                        onClick={handleRefreshJournal}
                        disabled={isJournalLoading}
                        $isLoading={isJournalLoading}
                        aria-label="Обновить журнал"
                        title="Обновить журнал"
                      >
                        <RefreshIcon />
                      </IconActionButton>
                    </SurfaceHeaderRow>
                    {isJournalInitialLoading ? (
                      <JournalSkeletonList>
                        {Array.from({ length: 3 }, (_, index) => (
                          <JournalSkeletonCard key={`journal-skeleton-${index}`}>
                            <SkeletonLine $width="58%" />
                            <SkeletonLine $width="36%" />
                            <SkeletonLine $width="100%" $height="36px" />
                          </JournalSkeletonCard>
                        ))}
                      </JournalSkeletonList>
                    ) : recentLinks.length === 0 ? (
                      <JournalEmptyState>
                        Созданных администратором ссылок нет.
                      </JournalEmptyState>
                    ) : (
                      <RecentLinksList>
                        {recentLinks.map((entry) => {
                          const isEntryCopying = copyingUrl === entry.accessUrl;

                          return (
                            <RecentLinkCard
                              key={`${entry.accessUrl}-${entry.createdAtIso}`}
                            >
                              <RecentLinkHeader>
                                <RecentLinkMeta>{entry.selectionLabel}</RecentLinkMeta>
                                <LinkStateBadge $state={entry.linkState}>
                                  {resolveLinkStateLabel(entry.linkState)}
                                </LinkStateBadge>
                              </RecentLinkHeader>

                              <RecentLinkMeta>
                                Идентификатор: {entry.adminLabel || "-"}
                              </RecentLinkMeta>
                              <RecentLinkMeta>
                                Создано: {formatDateTime(entry.createdAtIso)} | Токен до:{" "}
                                {entry.tokenExpiresAt
                                  ? formatDateTime(entry.tokenExpiresAt)
                                  : "не определено"}
                              </RecentLinkMeta>

                              <ResultBox>
                                <ResultValue>{entry.accessUrl}</ResultValue>
                                <CopyButton>
                                  <IconActionButton
                                    type="button"
                                    onClick={() => handleCopyLink(entry.accessUrl)}
                                    disabled={isEntryCopying}
                                    $isLoading={isEntryCopying}
                                    aria-label="Копировать ссылку"
                                    title="Копировать ссылку"
                                  >
                                    <CopyIcon />
                                  </IconActionButton>
                                </CopyButton>
                              </ResultBox>
                            </RecentLinkCard>
                          );
                        })}
                      </RecentLinksList>
                    )}
                  </SurfaceCard>
                </WorkspaceSecondary>
              </WorkspaceGrid>
            ) : (
              <FeaturePlaceholder>
                Раздел <strong>{activeFeature.label}</strong> пока не реализован. Дальше
                можно добавить здесь таблицы, фильтры и действия для ручного управления.
              </FeaturePlaceholder>
            )}

            {!isInviteLinksFeatureActive && (
              <SectionHeading>Скоро здесь появятся инструменты управления</SectionHeading>
            )}
          </MainPanel>
        </Card>
      </AdminShell>
    </AdminInvitePage>
  );
}
