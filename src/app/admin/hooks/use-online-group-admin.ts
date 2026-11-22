import { useCallback, useEffect, useState } from "react";

import {
  ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
  ONLINE_GROUP_RENEWAL_OFFER_ID,
} from "@/constants/sellable-products";

import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import type {
  OnlineGroupCampaignEntry,
  OnlineGroupCampaignsResponse,
  RenewalCampaignEntry,
  RenewalCampaignsResponse,
  SelectOption,
  StatusMessage,
  TelegramChatOption,
  TelegramChatsResponse,
} from "../lib/admin.types";
import { formatDateTimeInput, parseWarsawDateTimeInput } from "../lib/admin.utils";
import { ADMIN_NETWORK_ERROR_CODE, requestAdminJson } from "../lib/admin-request";

type UseOnlineGroupAdminOptions = {
  isActive: boolean;
  isAuthorized: boolean;
  onUnauthorized: () => void;
};

const RENEWAL_ERROR_MESSAGES: Record<string, string> = {
  network_error: "Нет связи с сайтом. Проверь интернет и попробуй ещё раз.",
  renewal_campaign_sources_changed:
    "Ссылка на этот тариф уже есть — для других чатов. Скопируй её из списка ниже. Если чаты правда нужно поменять, нажми «Заменить ссылку новой».",
  renewal_offer_not_seeded: "Тариф продления не найден. Напиши разработчику.",
  same_source_and_target_chat:
    "Чат, в который ведёт ссылка, не может быть среди источников: сними его галочку.",
  telegram_chat_not_registered:
    "Один из чатов не зарегистрирован. Добавь бота в чат и отправь /register_chat.",
};

const SETTINGS_ERROR_MESSAGES: Record<string, string> = {
  inspiration_chat_is_fixed: "Telegram-группа библиотеки уже выбрана и не меняется.",
  invalid_start_date: "Укажи дату и время старта.",
  missing_chat_selection: "Выбери чат потока.",
  network_error: "Нет связи с сайтом. Проверь интернет и попробуй ещё раз.",
  online_group_cohort_closed: "Этот поток уже закрыт — его дату менять нельзя.",
  online_group_cohort_main_chat_fixed:
    "Чат потока меняется сам, когда закрываешь поток в «Потоках». Ссылки продления на следующий поток — там же, в «Настроить переход».",
  online_group_cohort_start_has_continuations:
    "С этой даты уже начинаются оплаченные периоды библиотеки. Перенести дату может только разработчик.",
  same_main_and_inspiration_chat: "Чат потока и группа библиотеки должны отличаться.",
  telegram_chat_not_registered:
    "Бот не знает этот чат. Добавь бота администратором, отправь в чате /register_chat и обнови страницу.",
};

const RENEWAL_TOGGLE_ERROR_MESSAGES: Record<string, string> = {
  network_error: "Нет связи с сайтом. Проверь интернет и попробуй ещё раз.",
  renewal_campaign_inactive: "Эта ссылка ведёт в прошлый поток — включить её нельзя.",
  renewal_campaign_not_found: "Ссылка продления не найдена.",
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
    // The title is what the admin knows the chat by; the id says nothing to her.
    label: chat.title,
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
  const isRenewalGenerateDisabled =
    isGeneratingRenewal || renewalSourceChatIds.length === 0 || !activeCampaign;
  // The title is typed again to confirm the closure, so it is never left to a fallback.
  const isSaveDisabled =
    isSaving ||
    !mainChatId ||
    !libraryChatId ||
    !startsAt ||
    !title.trim() ||
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

    const [chatsResult, campaignsResult, onlineGroupResult] = await Promise.all([
      requestAdminJson<TelegramChatsResponse>(ADMIN_API_ENDPOINTS.telegramChats),
      requestAdminJson<RenewalCampaignsResponse>(ADMIN_API_ENDPOINTS.renewalCampaigns),
      requestAdminJson<OnlineGroupCampaignsResponse>(
        ADMIN_API_ENDPOINTS.onlineGroupSettings,
      ),
    ]);
    // The workspace is one screen fed by three endpoints, so a single unreachable
    // endpoint reports network failure for the whole screen rather than part of it.
    const hasNetworkError = [chatsResult, campaignsResult, onlineGroupResult].some(
      (result) => result.errorCode === ADMIN_NETWORK_ERROR_CODE,
    );

    if (hasNetworkError) {
      setStatus({
        text: "Ошибка сети при загрузке настроек Online Group.",
        tone: "error",
      });
      setRenewalStatus({
        text: "Ошибка сети при загрузке продлений.",
        tone: "error",
      });
    } else if (
      (!chatsResult.ok || !campaignsResult.ok || !onlineGroupResult.ok) &&
      (chatsResult.unauthorized ||
        campaignsResult.unauthorized ||
        onlineGroupResult.unauthorized)
    ) {
      onUnauthorized();
    } else if (!chatsResult.ok || !campaignsResult.ok || !onlineGroupResult.ok) {
      setStatus({
        text: "Не удалось загрузить настройки Online Group.",
        tone: "error",
      });
      setRenewalStatus({
        text: "Не удалось загрузить чаты или историю продлений.",
        tone: "error",
      });
    } else {
      const chats = Array.isArray(chatsResult.data.chats) ? chatsResult.data.chats : [];
      const renewalCampaignEntries = Array.isArray(campaignsResult.data.campaigns)
        ? campaignsResult.data.campaigns
        : [];
      const onlineGroupCampaigns = onlineGroupResult.data.campaigns;

      setTelegramChats(chats);
      setRenewalCampaigns(renewalCampaignEntries);
      setCampaigns(Array.isArray(onlineGroupCampaigns) ? onlineGroupCampaigns : []);

      const loadedActiveCampaign = onlineGroupCampaigns?.find(
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

        // Nothing is ticked in advance: a wrong source set would replace a sent link.
        return validValues;
      });
    }

    setHasLoaded(true);
    setIsLoading(false);
  }, [onUnauthorized]);

  // «Отменить» drops the edits: a later «Изменить» starts from the saved stream again.
  const toggleForm = useCallback(() => {
    if (isFormOpen && activeCampaign) {
      setMainChatId(activeCampaign.mainChatId);
      setLibraryChatId(activeCampaign.inspirationChatId);
      setStartsAt(formatDateTimeInput(activeCampaign.startsAt));
      setTitle(activeCampaign.title);
      setStatus(null);
    }
    setIsFormOpen(!isFormOpen);
  }, [activeCampaign, isFormOpen]);

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

  const generateRenewal = useCallback(
    async (regenerate = false) => {
      if (isRenewalGenerateDisabled) {
        return;
      }

      setIsGeneratingRenewal(true);
      setGeneratedRenewalLink("");
      setRenewalStatus({
        text: regenerate
          ? "Создаю новую ссылку вместо старой…"
          : "Готовлю ссылку продления…",
        tone: "progress",
      });

      const result = await requestAdminJson<RenewalCampaignsResponse>(
        ADMIN_API_ENDPOINTS.renewalCampaigns,
        {
          body: {
            offerId: renewalOfferId,
            regenerate,
            sourceChatIds: renewalSourceChatIds,
            title: renewalTitle,
          },
          method: "POST",
        },
      );
      const { campaign, reused, status: renewalResultStatus } = result.data;

      if (result.unauthorized) {
        onUnauthorized();
        setRenewalStatus(null);
      } else if (
        !result.ok ||
        renewalResultStatus !== "ready" ||
        !campaign?.checkoutUrl
      ) {
        setRenewalStatus({
          text:
            RENEWAL_ERROR_MESSAGES[result.errorCode] ??
            "Не удалось создать ссылку продления.",
          tone: "error",
        });
      } else {
        setGeneratedRenewalLink(campaign.checkoutUrl);
        setRenewalStatus({
          text: reused
            ? "Такая ссылка уже есть — можно копировать."
            : "Ссылка продления готова.",
          tone: "success",
        });
        // Which links a new one replaced is the server's call; read the list back.
        const refreshed = await requestAdminJson<RenewalCampaignsResponse>(
          ADMIN_API_ENDPOINTS.renewalCampaigns,
        );
        if (refreshed.ok && Array.isArray(refreshed.data.campaigns)) {
          setRenewalCampaigns(refreshed.data.campaigns);
        }
        setRenewalTitle("");
      }

      setIsGeneratingRenewal(false);
    },
    [
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
      tone: "progress",
    });

    const result = await requestAdminJson<OnlineGroupCampaignsResponse>(
      ADMIN_API_ENDPOINTS.onlineGroupSettings,
      {
        body: {
          inspirationChatId: libraryChatId,
          mainChatId,
          startsAt: parseWarsawDateTimeInput(startsAt),
          title,
        },
        method: "POST",
      },
    );
    const { campaign: savedCampaign, reused, status: saveResultStatus } = result.data;

    if (result.unauthorized) {
      onUnauthorized();
    } else if (!result.ok || saveResultStatus !== "ready" || !savedCampaign) {
      setStatus({
        text:
          SETTINGS_ERROR_MESSAGES[result.errorCode] ??
          "Не удалось сохранить настройки Online Group.",
        tone: "error",
      });
    } else {
      setCampaigns((currentCampaigns) => [
        savedCampaign,
        ...currentCampaigns
          .filter((campaign) => campaign.id !== savedCampaign.id)
          .map((campaign) =>
            campaign.status === "active" ? { ...campaign, status: "archived" } : campaign,
          ),
      ]);
      // The server decides which renewal links stay on (the current cohort's and its
      // successor's); the list is read back instead of guessed here.
      const refreshedRenewals = await requestAdminJson<RenewalCampaignsResponse>(
        ADMIN_API_ENDPOINTS.renewalCampaigns,
      );
      if (refreshedRenewals.ok && Array.isArray(refreshedRenewals.data.campaigns)) {
        setRenewalCampaigns(refreshedRenewals.data.campaigns);
      }

      const generatedCampaign = renewalCampaigns.find(
        (campaign) => campaign.checkoutUrl === generatedRenewalLink,
      );

      if (
        generatedCampaign &&
        generatedCampaign.targetChatId !== savedCampaign.mainChatId
      ) {
        setGeneratedRenewalLink("");
      }

      setStatus({
        text: reused
          ? "Настройки уже актуальны."
          : activeCampaign
            ? "Изменения сохранены."
            : "Поток открыт.",
        tone: "success",
      });
      setIsFormOpen(false);
    }

    setIsSaving(false);
  }, [
    activeCampaign,
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

      const result = await requestAdminJson(ADMIN_API_ENDPOINTS.renewalCampaigns, {
        body: { active, slug },
        method: "PATCH",
      });

      if (result.unauthorized) {
        onUnauthorized();
        setRenewalStatus(null);
      } else if (!result.ok) {
        setRenewalStatus({
          text:
            RENEWAL_TOGGLE_ERROR_MESSAGES[result.errorCode] ??
            "Не удалось изменить состояние ссылки.",
          tone: "error",
        });
      } else {
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
      }

      setUpdatingRenewalSlug("");
    },
    [generatedRenewalLink, onUnauthorized, renewalCampaigns, updatingRenewalSlug],
  );

  useEffect(() => {
    if (!isAuthorized) {
      setHasLoaded(false);
      setTelegramChats([]);
      setCampaigns([]);
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
    changeLibraryChat,
    changeMainChat,
    changeRenewalOffer,
    changeStartsAt,
    generatedRenewalLink,
    generateRenewal,
    inspirationChatTitle,
    isFormOpen,
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
