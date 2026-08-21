"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
  ONLINE_GROUP_RENEWAL_OFFER_ID,
} from "@/constants/sellable-products";

import { AdminFeatureHeader, AdminLogin, AdminSidebar } from "./components/admin-shell";
import { BroadcastWorkspace } from "./components/broadcast-workspace";
import {
  InviteLinkGeneratorCard,
  InviteLinkJournalCard,
} from "./components/invite-links-workspace";
import {
  ActiveOnlineGroupCard,
  OnlineGroupInviteLinksCard,
  RenewalCampaignsCard,
  RenewalGeneratorCard,
} from "./components/online-group-workspace";
import { OperationsWorkspace } from "./components/operations-workspace";
import { PurchasesWorkspace } from "./components/purchases-workspace";
import { SalesWorkspace } from "./components/sales-workspace";
import { useBroadcastAdmin } from "./hooks/use-broadcast-admin";
import { useOperationsAdmin } from "./hooks/use-operations-admin";
import { usePurchasesAdmin } from "./hooks/use-purchases-admin";
import { useSalesAdmin } from "./hooks/use-sales-admin";
import {
  ADMIN_API_ENDPOINTS,
  ADMIN_FEATURES,
  ADMIN_SESSION_HEARTBEAT_MS,
  KIND_OPTIONS,
} from "./lib/admin.constants";
import type {
  AdminFeatureId,
  AuthResponse,
  AuthState,
  GeneratedLinkEntry,
  GenerateResponse,
  GeneratorKind,
  HistoryResponse,
  LessonLanguage,
  LinkState,
  OnlineGroupAdminAccessMode,
  OnlineGroupAdminGrant,
  OnlineGroupAdminLinksResponse,
  OnlineGroupCampaignEntry,
  OnlineGroupCampaignsResponse,
  RenewalCampaignEntry,
  RenewalCampaignsResponse,
  SelectOption,
  StatusMessage,
  TelegramChatOption,
  TelegramChatsResponse,
} from "./lib/admin.types";
import {
  formatDateTimeInput,
  getChoreoSelections,
  resolveGeneratorErrorMessage,
} from "./lib/admin.utils";
import {
  AdminInvitePage,
  AdminShell,
  Card,
  MainPanel,
  OnlineGroupWorkspace,
  StatusText,
  WorkspaceGrid,
  WorkspacePrimary,
  WorkspaceSecondary,
} from "./page.styles";

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
  const isOperationsFeatureActive = activeFeature.id === "operations";
  const isPurchasesFeatureActive = activeFeature.id === "purchases";
  const isSalesFeatureActive = activeFeature.id === "sales";
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

  const handleSessionExpired = useCallback(() => {
    setAuthState("locked");
    setAuthStatus({
      text: "Сессия истекла. Введи пароль снова.",
      tone: "error",
    });
  }, []);

  const {
    audience: firstTouchBroadcastAudience,
    confirmingGlobalLeadId: confirmingGlobalBroadcastLeadId,
    exclude: handleExcludeFirstTouchBroadcastLead,
    isDisabled: isFirstTouchBroadcastDisabled,
    isLoading: isLoadingFirstTouchBroadcastStats,
    isSending: isSendingFirstTouchBroadcast,
    load: loadFirstTouchBroadcastStats,
    pendingCount: firstTouchBroadcastPendingCount,
    send: handleSendFirstTouchBroadcast,
    setConfirmingGlobalLeadId: setConfirmingGlobalBroadcastLeadId,
    stats: firstTouchBroadcastStats,
    status: firstTouchBroadcastStatus,
    updatingLeadId: updatingFirstTouchBroadcastLeadId,
  } = useBroadcastAdmin({
    isActive: isBroadcastsFeatureActive,
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });
  const purchasesAdmin = usePurchasesAdmin({
    isActive: isPurchasesFeatureActive,
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });
  const operationsAdmin = useOperationsAdmin({
    isActive: isOperationsFeatureActive,
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });
  const {
    activeCampaignTitle: salesActiveCampaignTitle,
    isLoading: isLoadingSalesState,
    load: loadSalesState,
    products: salesProducts,
    status: salesStatus,
    toggle: handleToggleProductSales,
    updatingProductId: updatingSalesProductId,
  } = useSalesAdmin({
    isActive: isSalesFeatureActive,
    isAuthorized,
    onUnauthorized: handleSessionExpired,
  });

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

            {isSalesFeatureActive ? (
              <SalesWorkspace
                activeCampaignTitle={salesActiveCampaignTitle}
                isLoading={isLoadingSalesState}
                onRefresh={loadSalesState}
                onToggle={handleToggleProductSales}
                products={salesProducts}
                status={salesStatus}
                updatingProductId={updatingSalesProductId}
              />
            ) : isOnlineGroupFeatureActive ? (
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
            ) : isPurchasesFeatureActive ? (
              <PurchasesWorkspace
                appliedSearch={purchasesAdmin.appliedSearch}
                isDownloadingReport={purchasesAdmin.isDownloadingReport}
                isLoading={purchasesAdmin.isLoading}
                isSendingReport={purchasesAdmin.isSendingReport}
                monthValue={purchasesAdmin.monthValue}
                months={purchasesAdmin.months}
                onClearSearch={purchasesAdmin.clearSearch}
                onDownloadReport={purchasesAdmin.downloadReport}
                onMonthChange={purchasesAdmin.selectMonth}
                onRefresh={purchasesAdmin.refresh}
                onResendEmail={purchasesAdmin.resendEmail}
                onSearchInputChange={purchasesAdmin.setSearchInput}
                onSendReport={purchasesAdmin.sendReport}
                onSubmitSearch={purchasesAdmin.submitSearch}
                previousSummary={purchasesAdmin.previousSummary}
                products={purchasesAdmin.products}
                purchases={purchasesAdmin.purchases}
                reportStatus={purchasesAdmin.reportStatus}
                resendingPaymentIntentId={purchasesAdmin.resendingPaymentIntentId}
                searchInput={purchasesAdmin.searchInput}
                status={purchasesAdmin.status}
                summary={purchasesAdmin.summary}
              />
            ) : isOperationsFeatureActive ? (
              <OperationsWorkspace
                copyingUrl={copyingUrl}
                isLoading={operationsAdmin.isLoading}
                onCopy={handleCopyLink}
                onRefresh={operationsAdmin.refresh}
                onReissueAccess={operationsAdmin.reissueAccess}
                onReplay={operationsAdmin.replay}
                reissuedLinks={operationsAdmin.reissuedLinks}
                reissuingPaymentIntentId={operationsAdmin.reissuingPaymentIntentId}
                replayingKey={operationsAdmin.replayingKey}
                snapshot={operationsAdmin.snapshot}
                status={operationsAdmin.status}
              />
            ) : null}
          </MainPanel>
        </Card>
      </AdminShell>
    </AdminInvitePage>
  );
}
