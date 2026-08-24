import { useCallback, useEffect, useState } from "react";

import {
  ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
  ONLINE_GROUP_RENEWAL_OFFER_ID,
} from "@/constants/sellable-products";

import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import type {
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
} from "../lib/admin.types";
import { formatDateTimeInput } from "../lib/admin.utils";

type UseOnlineGroupAdminOptions = {
  isActive: boolean;
  isAuthorized: boolean;
  onUnauthorized: () => void;
};

export const useOnlineGroupAdmin = ({
  isActive,
  isAuthorized,
  onUnauthorized,
}: UseOnlineGroupAdminOptions) => {
  const [telegramChats, setTelegramChats] = useState<TelegramChatOption[]>([]);
  const [campaigns, setCampaigns] = useState<OnlineGroupCampaignEntry[]>([]);
  const [mainChatId, setMainChatId] = useState("");
  const [libraryChatId, setLibraryChatId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<StatusMessage>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [adminAccessMode, setAdminAccessMode] =
    useState<OnlineGroupAdminAccessMode>("standard");
  const [adminLabel, setAdminLabel] = useState("");
  const [adminGrants, setAdminGrants] = useState<OnlineGroupAdminGrant[]>([]);
  const [adminStatus, setAdminStatus] = useState<StatusMessage>(null);
  const [isGeneratingAdminAccess, setIsGeneratingAdminAccess] = useState(false);
  const [renewalCampaigns, setRenewalCampaigns] = useState<RenewalCampaignEntry[]>([]);
  const [renewalSourceChatIds, setRenewalSourceChatIds] = useState<string[]>([]);
  const [renewalOfferId, setRenewalOfferId] = useState(ONLINE_GROUP_RENEWAL_OFFER_ID);
  const [renewalTitle, setRenewalTitle] = useState("");
  const [generatedRenewalLink, setGeneratedRenewalLink] = useState("");
  const [renewalStatus, setRenewalStatus] = useState<StatusMessage>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isGeneratingRenewal, setIsGeneratingRenewal] = useState(false);
  const [updatingRenewalSlug, setUpdatingRenewalSlug] = useState("");

  const telegramChatSelectOptions: SelectOption[] = telegramChats.map((chat) => ({
    label: `${chat.title} (${chat.chatId})`,
    value: chat.chatId,
  }));
  const activeCampaign = campaigns.find((campaign) => campaign.status === "active");
  const activeMainChatTitle = activeCampaign
    ? (telegramChats.find((chat) => chat.chatId === activeCampaign.mainChatId)?.title ??
      activeCampaign.mainChatId)
    : "";
  const inspirationChatTitle = activeCampaign
    ? (telegramChats.find((chat) => chat.chatId === activeCampaign.inspirationChatId)
        ?.title ?? activeCampaign.inspirationChatId)
    : "";
  const hasConfiguredCampaign = Boolean(
    activeCampaign?.mainChatId &&
    activeCampaign.inspirationChatId &&
    activeCampaign.startsAt &&
    telegramChats.some((chat) => chat.chatId === activeCampaign.mainChatId) &&
    telegramChats.some((chat) => chat.chatId === activeCampaign.inspirationChatId),
  );
  const isAdminGenerateDisabled =
    isGeneratingAdminAccess || isLoading || !hasConfiguredCampaign || !adminLabel.trim();
  const isRenewalGenerateDisabled =
    isGeneratingRenewal ||
    renewalSourceChatIds.length === 0 ||
    !activeCampaign ||
    renewalSourceChatIds.includes(activeCampaign.mainChatId);
  const isSaveDisabled =
    isSaving ||
    !mainChatId ||
    !libraryChatId ||
    !startsAt ||
    mainChatId === libraryChatId;
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

  const load = useCallback(async () => {
    setIsLoading(true);

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
        onUnauthorized();
        return;
      }

      if (!chatsResponse.ok || !campaignsResponse.ok || !onlineGroupResponse.ok) {
        if (
          chatsData.errorCode === "unauthorized" ||
          campaignsData.errorCode === "unauthorized" ||
          onlineGroupData.errorCode === "unauthorized"
        ) {
          onUnauthorized();
          return;
        }

        setStatus({
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
      const renewalCampaignEntries = Array.isArray(campaignsData.campaigns)
        ? campaignsData.campaigns
        : [];

      setTelegramChats(chats);
      setRenewalCampaigns(renewalCampaignEntries);
      setCampaigns(
        Array.isArray(onlineGroupData.campaigns) ? onlineGroupData.campaigns : [],
      );
      if (adminLinksResponse.ok) {
        setAdminGrants(Array.isArray(adminLinksData.grants) ? adminLinksData.grants : []);
      } else {
        setAdminStatus({
          text: "Не удалось загрузить журнал ручных доступов.",
          tone: "error",
        });
      }
      const loadedActiveCampaign = onlineGroupData.campaigns?.find(
        (campaign) => campaign.status === "active",
      );
      setMainChatId(loadedActiveCampaign?.mainChatId ?? chats[0]?.chatId ?? "");
      setLibraryChatId(
        loadedActiveCampaign?.inspirationChatId ??
          chats[1]?.chatId ??
          chats[0]?.chatId ??
          "",
      );
      setStartsAt(
        loadedActiveCampaign?.startsAt
          ? formatDateTimeInput(loadedActiveCampaign.startsAt)
          : "",
      );
      setTitle(loadedActiveCampaign?.title ?? "");
      setIsFormOpen(!loadedActiveCampaign);
      setRenewalSourceChatIds((currentValue) => {
        const validValues = currentValue.filter((chatId) =>
          chats.some((chat) => chat.chatId === chatId),
        );

        return validValues.length ? validValues : chats[0] ? [chats[0].chatId] : [];
      });
    } catch {
      setStatus({
        text: "Ошибка сети при загрузке настроек Online Group.",
        tone: "error",
      });
      setRenewalStatus({
        text: "Ошибка сети при загрузке продлений.",
        tone: "error",
      });
      setAdminStatus({
        text: "Ошибка сети при загрузке ручных доступов.",
        tone: "error",
      });
    } finally {
      setHasLoaded(true);
      setIsLoading(false);
    }
  }, [onUnauthorized]);

  const toggleForm = useCallback(() => {
    setIsFormOpen((currentValue) => !currentValue);
  }, []);

  const changeMainChat = useCallback((value: string) => {
    setMainChatId(value);
    setStatus(null);
  }, []);

  const changeLibraryChat = useCallback((value: string) => {
    setLibraryChatId(value);
    setStatus(null);
  }, []);

  const changeStartsAt = useCallback((value: string) => {
    setStartsAt(value);
    setStatus(null);
  }, []);

  const changeAdminAccessMode = useCallback((value: OnlineGroupAdminAccessMode) => {
    setAdminAccessMode(value);
    setAdminStatus(null);
  }, []);

  const changeAdminLabel = useCallback((value: string) => {
    setAdminLabel(value);
    setAdminStatus(null);
  }, []);

  const changeRenewalOffer = useCallback((value: string) => {
    setRenewalOfferId(value);
    setGeneratedRenewalLink("");
    setRenewalStatus(null);
  }, []);

  const toggleRenewalSourceChat = useCallback((chatId: string, checked: boolean) => {
    setRenewalSourceChatIds((currentIds) =>
      checked
        ? [...new Set([...currentIds, chatId])]
        : currentIds.filter((id) => id !== chatId),
    );
    setGeneratedRenewalLink("");
    setRenewalStatus(null);
  }, []);

  const generateAdminAccess = useCallback(async () => {
    if (isAdminGenerateDisabled) {
      return;
    }

    setIsGeneratingAdminAccess(true);
    setAdminStatus({
      text: "Генерирую персональные invite-ссылки...",
      tone: "info",
    });

    const normalizedAdminLabel = adminLabel.trim();

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.onlineGroupInviteLinks, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessMode: adminAccessMode,
          adminLabel: normalizedAdminLabel,
        }),
      });
      const data = (await response.json()) as OnlineGroupAdminLinksResponse;

      if (data.errorCode === "unauthorized") {
        onUnauthorized();
        setAdminStatus(null);
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

        setAdminStatus({ text: errorText, tone: "error" });
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

      setAdminGrants((grants) => [
        grant,
        ...grants.filter(
          (existingGrant) => existingGrant.paymentIntentId !== grant.paymentIntentId,
        ),
      ]);
      setAdminLabel("");
      setAdminStatus(
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
      setAdminStatus({
        text: "Ошибка сети при генерации ссылок доступа.",
        tone: "error",
      });
    } finally {
      setIsGeneratingAdminAccess(false);
    }
  }, [
    adminAccessMode,
    adminLabel,
    isAdminGenerateDisabled,
    onUnauthorized,
    telegramChats,
  ]);

  const generateRenewal = useCallback(
    async (regenerate = false) => {
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
            onUnauthorized();
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
            targetChatId: activeCampaign?.mainChatId ?? "",
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
    },
    [
      activeCampaign,
      isRenewalGenerateDisabled,
      onUnauthorized,
      renewalOfferId,
      renewalSourceChatIds,
      renewalTitle,
    ],
  );

  const saveSettings = useCallback(async () => {
    if (isSaveDisabled) {
      return;
    }

    setIsSaving(true);
    setStatus({
      text: "Сохраняю настройки потока...",
      tone: "info",
    });

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.onlineGroupSettings, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspirationChatId: libraryChatId,
          mainChatId,
          startsAt: new Date(startsAt).toISOString(),
          title,
        }),
      });
      const data = (await response.json()) as OnlineGroupCampaignsResponse;

      if (!response.ok || data.status !== "ready" || !data.campaign) {
        if (data.errorCode === "unauthorized") {
          onUnauthorized();
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

        setStatus({ text: errorText, tone: "error" });
        return;
      }

      setCampaigns((currentCampaigns) => [
        data.campaign as OnlineGroupCampaignEntry,
        ...currentCampaigns
          .filter((campaign) => campaign.id !== data.campaign?.id)
          .map((campaign) =>
            campaign.status === "active" ? { ...campaign, status: "archived" } : campaign,
          ),
      ]);
      setRenewalCampaigns((currentCampaigns) =>
        currentCampaigns.map((campaign) =>
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

      setStatus({
        text: data.reused ? "Настройки уже актуальны." : "Новый поток активирован.",
        tone: "success",
      });
      setIsFormOpen(false);
    } catch {
      setStatus({
        text: "Ошибка сети при сохранении настроек Online Group.",
        tone: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    generatedRenewalLink,
    isSaveDisabled,
    libraryChatId,
    mainChatId,
    onUnauthorized,
    renewalCampaigns,
    startsAt,
    title,
  ]);

  const toggleRenewalStatus = useCallback(
    async (slug: string, active: boolean) => {
      if (!slug || updatingRenewalSlug) {
        return;
      }

      const selectedCampaign = renewalCampaigns.find(
        (campaign) => campaign.slug === slug,
      );

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

        setRenewalCampaigns((currentCampaigns) =>
          currentCampaigns.map((campaign) => {
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
    },
    [generatedRenewalLink, renewalCampaigns, updatingRenewalSlug],
  );

  useEffect(() => {
    if (!isAuthorized) {
      setHasLoaded(false);
      setTelegramChats([]);
      setCampaigns([]);
      setAdminGrants([]);
      setAdminStatus(null);
      setRenewalCampaigns([]);
      return;
    }

    if (!isActive || hasLoaded || isLoading) {
      return;
    }

    void load();
  }, [hasLoaded, isActive, isAuthorized, isLoading, load]);

  return {
    activeCampaign,
    activeMainChatTitle,
    adminAccessMode,
    adminGrants,
    adminLabel,
    adminStatus,
    changeAdminAccessMode,
    changeAdminLabel,
    changeLibraryChat,
    changeMainChat,
    changeRenewalOffer,
    changeStartsAt,
    generateAdminAccess,
    generatedRenewalLink,
    generateRenewal,
    hasConfiguredCampaign,
    inspirationChatTitle,
    isAdminGenerateDisabled,
    isFormOpen,
    isGeneratingAdminAccess,
    isGeneratingRenewal,
    isLoading,
    isRenewalGenerateDisabled,
    isSaveDisabled,
    isSaving,
    libraryChatId,
    load,
    mainChatId,
    renewalCampaigns,
    renewalOfferId,
    renewalOfferSelectOptions,
    renewalSourceChatIds,
    renewalStatus,
    renewalTitle,
    saveSettings,
    setRenewalTitle,
    setTitle,
    startsAt,
    status,
    telegramChats,
    telegramChatSelectOptions,
    title,
    toggleForm,
    toggleRenewalSourceChat,
    toggleRenewalStatus,
    updatingRenewalSlug,
  };
};
