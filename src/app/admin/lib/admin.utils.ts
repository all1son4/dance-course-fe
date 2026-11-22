import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";

import {
  LESSON_LANGUAGE_LABELS,
  OFFER_TYPE_LABELS,
  RATE_LIMITED_STATUS_TEXT,
} from "./admin.constants";
import type { ChoreoSelection, LessonLanguage, LinkState } from "./admin.types";

// Anna works from Warsaw: every time in the admin is Warsaw time.
export const formatDateTime = (value: string, timeZone = "Europe/Warsaw") => {
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
    year: "numeric",
  }).format(date);
};

/** «19 ноября» in Warsaw time. */
export const formatDayMonth = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Warsaw",
  }).format(new Date(value));

/** «19 ноября, 14:35» in Warsaw time, like every admin time. */
export const formatDayMonthTime = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    timeZone: "Europe/Warsaw",
  }).format(new Date(value));

/** Russian plural by the last one and two digits: 1 письмо, 2 письма, 5 писем. */
export const plural = (count: number, one: string, few: string, many: string) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/** The Warsaw wall-clock parts of a moment, whatever the device's time zone. */
const warsawParts = (date: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone: "Europe/Warsaw",
      year: "numeric",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  ) as Record<"day" | "hour" | "minute" | "month" | "year", string>;

const warsawWallClockMs = (date: Date) => {
  const parts = warsawParts(date);
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
};

/** A `datetime-local` value shown in Warsaw time ("По Варшаве"), not the device's. */
export const formatDateTimeInput = (value: string) => {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const parts = warsawParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

/**
 * The moment a `datetime-local` value means when read as Warsaw time: "2026-11-23T18:00"
 * is 17:00 UTC in winter on every device. Two passes settle the offset across DST.
 */
export const parseWarsawDateTimeInput = (value: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(value);
  if (!match) return "";

  const [, year, month, day, hour, minute] = match.map(Number);
  const wanted = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  let instant = wanted;
  for (let pass = 0; pass < 2; pass += 1) {
    instant += wanted - warsawWallClockMs(new Date(instant));
  }

  return new Date(instant).toISOString();
};

export const resolveLinkStateLabel = (state: LinkState) =>
  state === "used"
    ? "Использована"
    : state === "expired"
      ? "Истекла"
      : "Ещё не использована";

export const getChoreoSelections = () =>
  SELLABLE_PRODUCTS_LIST.filter((product) => product.type === "choreo")
    .flatMap((product) =>
      product.offers.flatMap((offer) =>
        (["ru", "en"] as LessonLanguage[]).map((lessonLanguage) => {
          const offerTypeLabel = OFFER_TYPE_LABELS[offer.code] ?? offer.label;

          return {
            key: `${product.id}::${offer.id}::${lessonLanguage}`,
            // Same order as the history and the alerts: product · tariff · language.
            label: `${product.shortTitle} · ${offerTypeLabel} · ${LESSON_LANGUAGE_LABELS[lessonLanguage]}`,
            lessonLanguage,
            offerId: offer.id,
            productId: product.id,
          } satisfies ChoreoSelection;
        }),
      ),
    )
    .sort((left, right) => left.label.localeCompare(right.label, "ru"));

const GENERATOR_ERROR_MESSAGES: Record<string, string> = {
  invalid_offer_selection: "Такой вариант выдать нельзя. Обнови страницу и выбери снова.",
  invalid_origin: "Открой админку заново по обычному адресу и повтори.",
  network_error: "Нет связи с сервером — ссылка не создана. Проверь интернет и повтори.",
  rate_limited: RATE_LIMITED_STATUS_TEXT,
  unauthorized: "Сессия закончилась. Введи пароль ещё раз.",
};

const GENERATOR_REASON_MESSAGES: Record<string, string> = {
  channel_not_configured:
    "У этого курса или разбора не подключён Telegram-канал. Напиши разработчику.",
  offer_not_supported:
    "Для этого варианта бесплатный доступ не выдаётся. Напиши разработчику.",
};

export const resolveGeneratorErrorMessage = (errorCode: string, reason: string) =>
  GENERATOR_ERROR_MESSAGES[errorCode] ??
  GENERATOR_REASON_MESSAGES[reason] ??
  "Ссылка не создалась. Попробуй ещё раз; если повторится — напиши разработчику.";
