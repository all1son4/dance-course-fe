import {
  formatPurchaseLine,
  getBuyerPurchaseLine,
  getLocalizedOfferMetadataByOfferId,
  resolveSellableProductsLocale,
  shouldShowOfferToBuyerByOfferId,
} from "@/lib/sellable-products-localization";

import { getOfferMetadataById } from "./offer-access";

export type TelegramLessonLanguage = "ru" | "en";

export type TelegramLessonSource = {
  lessonTitle: string;
  offerId: string;
  sourceChatId: string;
  sourceMessageId: number;
};
export type TelegramChannelTarget = {
  materialsUrl?: string;
  chatId: string;
  lessonLanguage: TelegramLessonLanguage | null;
  offerId: string;
};

type ParsedTelegramLessonSource = {
  lessonTitle?: string;
  lessonLanguage: TelegramLessonLanguage | null;
  offerId: string;
  sourceChatId: string;
  sourceMessageId: number;
};
type ParsedTelegramChannelTarget = {
  materialsUrl?: string;
  chatId: string;
  lessonLanguage: TelegramLessonLanguage | null;
  offerId: string;
};

const getEnvValue = (name: string) => process.env[name]?.trim() ?? "";

let lessonSourcesCache: Map<string, ParsedTelegramLessonSource> | null = null;
let channelTargetsCache: Map<string, ParsedTelegramChannelTarget> | null = null;
const getOfferLanguageKey = (
  offerId: string,
  lessonLanguage: TelegramLessonLanguage | null,
) => `${offerId}:${lessonLanguage ?? "default"}`;

const resolveTelegramLessonLanguage = (
  lessonLanguage: string | null | undefined,
): TelegramLessonLanguage | null => {
  const normalizedValue = (lessonLanguage ?? "").trim().toLowerCase();

  if (normalizedValue.startsWith("en")) {
    return "en";
  }

  if (normalizedValue.startsWith("ru")) {
    return "ru";
  }

  return null;
};

const getLessonTitleFallback = (offerId: string, locale: string | null | undefined) => {
  const resolvedLocale = resolveSellableProductsLocale(locale);
  const offerMetadata =
    getLocalizedOfferMetadataByOfferId(offerId, resolvedLocale) ??
    getOfferMetadataById(offerId);

  if (!offerMetadata) {
    if (resolvedLocale === "en") {
      return "Dance lesson";
    }

    if (resolvedLocale === "pl") {
      return "Lekcja tańca";
    }

    return "Урок танца";
  }

  return (
    getBuyerPurchaseLine({
      locale: resolvedLocale,
      offerId,
      showOfferLabel: shouldShowOfferToBuyerByOfferId(offerId),
    }) ?? formatPurchaseLine(offerMetadata.productTitle, offerMetadata.offerLabel)
  );
};

/**
 * An offer → entry map from a JSON setting: an array of entries that name their offer,
 * or an object keyed by offer id whose value is one entry or one per lesson language.
 * Unparsable JSON gives an empty map.
 */
const parseOfferLanguageMap = <
  T extends { lessonLanguage: TelegramLessonLanguage | null; offerId: string },
>(
  envName: string,
  parseEntry: (
    value: unknown,
    fallbackOfferId: string,
    fallbackLessonLanguage: TelegramLessonLanguage | null,
  ) => T | null,
): Map<string, T> => {
  const rawValue = getEnvValue(envName);
  const entries = new Map<string, T>();

  if (!rawValue) {
    return entries;
  }

  const add = (entry: T | null) => {
    if (entry)
      entries.set(getOfferLanguageKey(entry.offerId, entry.lessonLanguage), entry);
    return entry !== null;
  };

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;

    if (Array.isArray(parsedValue)) {
      parsedValue.forEach((entry) => add(parseEntry(entry, "", null)));
      return entries;
    }

    if (parsedValue && typeof parsedValue === "object") {
      Object.entries(parsedValue as Record<string, unknown>).forEach(
        ([offerId, entry]) => {
          if (add(parseEntry(entry, offerId, null))) return;
          if (!entry || typeof entry !== "object") return;

          Object.entries(entry as Record<string, unknown>).forEach(
            ([languageKey, languageEntry]) => {
              const lessonLanguage = resolveTelegramLessonLanguage(languageKey);
              if (lessonLanguage) add(parseEntry(languageEntry, offerId, lessonLanguage));
            },
          );
        },
      );
    }

    return entries;
  } catch {
    return new Map<string, T>();
  }
};

const parseLessonSource = (
  value: unknown,
  fallbackOfferId: string,
  fallbackLessonLanguage: TelegramLessonLanguage | null,
) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    lessonTitle?: unknown;
    lessonLanguage?: unknown;
    offerId?: unknown;
    sourceChatId?: unknown;
    sourceMessageId?: unknown;
  };
  const offerId =
    typeof candidate.offerId === "string" && candidate.offerId.trim()
      ? candidate.offerId.trim()
      : fallbackOfferId;
  const sourceChatId =
    typeof candidate.sourceChatId === "string" ? candidate.sourceChatId.trim() : "";
  const sourceMessageId = Number.parseInt(String(candidate.sourceMessageId ?? ""), 10);
  const lessonTitle =
    typeof candidate.lessonTitle === "string" && candidate.lessonTitle.trim()
      ? candidate.lessonTitle.trim()
      : undefined;
  const lessonLanguage =
    resolveTelegramLessonLanguage(
      typeof candidate.lessonLanguage === "string" ? candidate.lessonLanguage : null,
    ) ?? fallbackLessonLanguage;

  if (
    !offerId ||
    !sourceChatId ||
    !Number.isFinite(sourceMessageId) ||
    sourceMessageId <= 0
  ) {
    return null;
  }

  return {
    lessonTitle,
    lessonLanguage,
    offerId,
    sourceChatId,
    sourceMessageId,
  } satisfies ParsedTelegramLessonSource;
};

const parseLessonSources = () =>
  (lessonSourcesCache ??= parseOfferLanguageMap(
    "TELEGRAM_LESSON_SOURCES_JSON",
    parseLessonSource,
  ));
const parseChannelTarget = (
  value: unknown,
  fallbackOfferId: string,
  fallbackLessonLanguage: TelegramLessonLanguage | null,
) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    chatId?: unknown;
    materialsUrl?: unknown;
    lessonLanguage?: unknown;
    offerId?: unknown;
  };
  const offerId =
    typeof candidate.offerId === "string" && candidate.offerId.trim()
      ? candidate.offerId.trim()
      : fallbackOfferId;
  const chatId =
    typeof candidate.chatId === "string" || typeof candidate.chatId === "number"
      ? String(candidate.chatId).trim()
      : "";
  const lessonLanguage =
    resolveTelegramLessonLanguage(
      typeof candidate.lessonLanguage === "string" ? candidate.lessonLanguage : null,
    ) ?? fallbackLessonLanguage;

  if (!offerId || !chatId) {
    return null;
  }

  let materialsUrl: string | undefined;
  if (typeof candidate.materialsUrl === "string") {
    try {
      const url = new URL(candidate.materialsUrl);
      const match = url.pathname.match(/^\/c\/(\d+)\/([1-9]\d*)$/u);
      if (
        url.protocol === "https:" &&
        url.hostname === "t.me" &&
        match &&
        `-100${match[1]}` === chatId
      ) {
        materialsUrl = url.toString();
      }
    } catch {
      /* Invalid optional links never change the access target. */
    }
  }
  return {
    ...(materialsUrl ? { materialsUrl } : {}),
    chatId,
    lessonLanguage,
    offerId,
  } satisfies ParsedTelegramChannelTarget;
};

const parseChannelTargets = () =>
  (channelTargetsCache ??= parseOfferLanguageMap(
    "TELEGRAM_CHANNEL_TARGETS_JSON",
    parseChannelTarget,
  ));

export const getTelegramBotToken = () => getEnvValue("TELEGRAM_BOT_TOKEN");

export const getTelegramAlertsBotToken = () => {
  const alertsBotToken = getEnvValue("TELEGRAM_ALERT_BOT_TOKEN");

  return alertsBotToken || getTelegramBotToken();
};

export const getTelegramWebhookSecret = () => getEnvValue("TELEGRAM_WEBHOOK_SECRET");

export const getTelegramAlertsChatId = () => getEnvValue("TELEGRAM_ALERT_CHAT_ID");

export const isTelegramAlertsConfigured = () =>
  Boolean(getTelegramAlertsBotToken() && getTelegramAlertsChatId());

export const isTelegramBotConfigured = () => Boolean(getTelegramBotToken());

export const getTelegramLessonSourceByOfferId = ({
  lessonLanguage,
  locale,
  offerId,
}: {
  lessonLanguage?: string | null;
  locale?: string | null;
  offerId: string;
}) => {
  const resolvedLessonLanguage = resolveTelegramLessonLanguage(lessonLanguage);
  const parsedLessonSources = parseLessonSources();
  const lessonSourceByLanguage = resolvedLessonLanguage
    ? parsedLessonSources.get(getOfferLanguageKey(offerId, resolvedLessonLanguage))
    : null;
  const lessonSourceByDefault = parsedLessonSources.get(
    getOfferLanguageKey(offerId, null),
  );
  const lessonSource =
    lessonSourceByLanguage ??
    (resolvedLessonLanguage === "en" ? null : lessonSourceByDefault);

  if (!lessonSource) {
    return null;
  }

  return {
    lessonTitle:
      lessonSource.lessonTitle ||
      getLessonTitleFallback(offerId, lessonSource.lessonLanguage ?? locale),
    offerId: lessonSource.offerId,
    sourceChatId: lessonSource.sourceChatId,
    sourceMessageId: lessonSource.sourceMessageId,
  } satisfies TelegramLessonSource;
};

export const getTelegramChannelTargetByOfferId = ({
  lessonLanguage,
  offerId,
}: {
  lessonLanguage?: string | null;
  offerId: string;
}) => {
  const resolvedLessonLanguage = resolveTelegramLessonLanguage(lessonLanguage);
  const parsedChannelTargets = parseChannelTargets();
  const targetByLanguage = resolvedLessonLanguage
    ? parsedChannelTargets.get(getOfferLanguageKey(offerId, resolvedLessonLanguage))
    : null;
  const targetByDefault = parsedChannelTargets.get(getOfferLanguageKey(offerId, null));
  const target = targetByLanguage ?? targetByDefault;

  if (!target) {
    return null;
  }

  return {
    ...(target.materialsUrl ? { materialsUrl: target.materialsUrl } : {}),
    chatId: target.chatId,
    lessonLanguage: target.lessonLanguage ?? resolvedLessonLanguage ?? null,
    offerId: target.offerId,
  } satisfies TelegramChannelTarget;
};
