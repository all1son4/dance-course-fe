import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";

import { LESSON_LANGUAGE_LABELS, OFFER_TYPE_LABELS } from "./admin.constants";
import type {
  ChoreoSelection,
  LessonLanguage,
  LinkState,
  OnlineGroupAdminAccess,
  OnlineGroupAdminAccessState,
} from "./admin.types";

export const formatDateTime = (value: string, timeZone = "UTC") => {
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
    timeZone,
    timeZoneName: "short",
    year: "numeric",
  }).format(date);
};

export const formatDateTimeInput = (value: string) => {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

export const resolveLinkStateLabel = (state: LinkState) =>
  state === "used" ? "Использована" : "Активна";

export const resolveOnlineGroupAccessStateLabel = (
  state: OnlineGroupAdminAccessState,
) => {
  if (state === "issued") return "Ссылка активна";
  if (state === "used") return "Использована";
  if (state === "expired") return "Истекла";
  if (state === "revoked") return "Отозвана";
  if (state === "left") return "Покинул(а) чат";
  if (state === "failed") return "Ошибка создания";
  return "Подготавливается";
};

export const resolveOnlineGroupAccessTitle = (
  accessKey: OnlineGroupAdminAccess["accessKey"],
) => (accessKey === "inspiration-hub" ? "Inspiration Hub" : "Основной чат");

export const getChoreoSelections = () =>
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

export const resolveGeneratorErrorMessage = (errorCode: string, reason: string) => {
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
