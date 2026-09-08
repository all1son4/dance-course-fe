import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";

import {
  LESSON_LANGUAGE_LABELS,
  OFFER_TYPE_LABELS,
  RATE_LIMITED_STATUS_TEXT,
} from "./admin.constants";
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

const GENERATOR_ERROR_MESSAGES: Record<string, string> = {
  invalid_offer_selection:
    "Выбранные параметры невалидны. Проверь параметры и попробуй снова.",
  invalid_origin: "Запрос отклонен по Origin. Открой страницу напрямую и попробуй снова.",
  network_error: "Ошибка сети при генерации ссылки.",
  rate_limited: RATE_LIMITED_STATUS_TEXT,
  unauthorized: "Сессия истекла. Введи пароль еще раз.",
};

const GENERATOR_REASON_MESSAGES: Record<string, string> = {
  channel_not_configured: "Для выбранного оффера не настроен Telegram-канал.",
  offer_not_supported: "Этот оффер сейчас не поддерживает выдачу invite-ссылки.",
};

export const resolveGeneratorErrorMessage = (errorCode: string, reason: string) =>
  GENERATOR_ERROR_MESSAGES[errorCode] ??
  GENERATOR_REASON_MESSAGES[reason] ??
  "Не удалось сгенерировать ссылку. Проверь настройки и попробуй снова.";
