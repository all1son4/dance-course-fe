import {
  getLocalizedOfferMetadataByOfferId,
  resolveSellableProductsLocale,
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
  chatId: string;
  lessonLanguage: TelegramLessonLanguage | null;
  offerId: string;
};

const getEnvValue = (name: string) => process.env[name]?.trim() ?? "";

const normalizeTelegramUsername = (value: string) => value.replace(/^@/u, "").trim();
let lessonSourcesCache: Map<string, ParsedTelegramLessonSource> | null = null;
let channelTargetsCache: Map<string, ParsedTelegramChannelTarget> | null = null;
const getLessonSourceKey = (
  offerId: string,
  lessonLanguage: TelegramLessonLanguage | null,
) => `${offerId}:${lessonLanguage ?? "default"}`;
const getChannelTargetKey = (
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

  return `${offerMetadata.productTitle} — ${offerMetadata.offerLabel}`;
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

const parseLessonSources = () => {
  if (lessonSourcesCache) {
    return lessonSourcesCache;
  }

  const rawValue = getEnvValue("TELEGRAM_LESSON_SOURCES_JSON");

  if (!rawValue) {
    lessonSourcesCache = new Map<string, ParsedTelegramLessonSource>();
    return lessonSourcesCache;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;
    const lessonSources = new Map<string, ParsedTelegramLessonSource>();

    if (Array.isArray(parsedValue)) {
      parsedValue.forEach((entry) => {
        const lessonSource = parseLessonSource(entry, "", null);

        if (lessonSource) {
          lessonSources.set(
            getLessonSourceKey(lessonSource.offerId, lessonSource.lessonLanguage),
            lessonSource,
          );
        }
      });

      lessonSourcesCache = lessonSources;
      return lessonSources;
    }

    if (parsedValue && typeof parsedValue === "object") {
      Object.entries(parsedValue as Record<string, unknown>).forEach(
        ([offerId, entry]) => {
          const lessonSource = parseLessonSource(entry, offerId, null);

          if (lessonSource) {
            lessonSources.set(
              getLessonSourceKey(lessonSource.offerId, lessonSource.lessonLanguage),
              lessonSource,
            );
            return;
          }

          if (!entry || typeof entry !== "object") {
            return;
          }

          Object.entries(entry as Record<string, unknown>).forEach(
            ([languageKey, languageEntry]) => {
              const lessonLanguage = resolveTelegramLessonLanguage(languageKey);

              if (!lessonLanguage) {
                return;
              }

              const lessonSourceByLanguage = parseLessonSource(
                languageEntry,
                offerId,
                lessonLanguage,
              );

              if (lessonSourceByLanguage) {
                lessonSources.set(
                  getLessonSourceKey(
                    lessonSourceByLanguage.offerId,
                    lessonSourceByLanguage.lessonLanguage,
                  ),
                  lessonSourceByLanguage,
                );
              }
            },
          );
        },
      );
    }

    lessonSourcesCache = lessonSources;
    return lessonSources;
  } catch {
    lessonSourcesCache = new Map<string, ParsedTelegramLessonSource>();
    return lessonSourcesCache;
  }
};
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

  return {
    chatId,
    lessonLanguage,
    offerId,
  } satisfies ParsedTelegramChannelTarget;
};

const parseChannelTargets = () => {
  if (channelTargetsCache) {
    return channelTargetsCache;
  }

  const rawValue = getEnvValue("TELEGRAM_CHANNEL_TARGETS_JSON");

  if (!rawValue) {
    channelTargetsCache = new Map<string, ParsedTelegramChannelTarget>();
    return channelTargetsCache;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;
    const channelTargets = new Map<string, ParsedTelegramChannelTarget>();

    if (Array.isArray(parsedValue)) {
      parsedValue.forEach((entry) => {
        const channelTarget = parseChannelTarget(entry, "", null);

        if (channelTarget) {
          channelTargets.set(
            getChannelTargetKey(channelTarget.offerId, channelTarget.lessonLanguage),
            channelTarget,
          );
        }
      });

      channelTargetsCache = channelTargets;
      return channelTargets;
    }

    if (parsedValue && typeof parsedValue === "object") {
      Object.entries(parsedValue as Record<string, unknown>).forEach(
        ([offerId, entry]) => {
          const channelTarget = parseChannelTarget(entry, offerId, null);

          if (channelTarget) {
            channelTargets.set(
              getChannelTargetKey(channelTarget.offerId, channelTarget.lessonLanguage),
              channelTarget,
            );
            return;
          }

          if (!entry || typeof entry !== "object") {
            return;
          }

          Object.entries(entry as Record<string, unknown>).forEach(
            ([languageKey, languageEntry]) => {
              const lessonLanguage = resolveTelegramLessonLanguage(languageKey);

              if (!lessonLanguage) {
                return;
              }

              const channelTargetByLanguage = parseChannelTarget(
                languageEntry,
                offerId,
                lessonLanguage,
              );

              if (channelTargetByLanguage) {
                channelTargets.set(
                  getChannelTargetKey(
                    channelTargetByLanguage.offerId,
                    channelTargetByLanguage.lessonLanguage,
                  ),
                  channelTargetByLanguage,
                );
              }
            },
          );
        },
      );
    }

    channelTargetsCache = channelTargets;
    return channelTargets;
  } catch {
    channelTargetsCache = new Map<string, ParsedTelegramChannelTarget>();
    return channelTargetsCache;
  }
};

export const getTelegramBotToken = () => getEnvValue("TELEGRAM_BOT_TOKEN");

export const getTelegramAlertsBotToken = () => {
  const alertsBotToken = getEnvValue("TELEGRAM_ALERT_BOT_TOKEN");

  return alertsBotToken || getTelegramBotToken();
};

export const getTelegramBotUsername = () =>
  normalizeTelegramUsername(getEnvValue("TELEGRAM_BOT_USERNAME"));

export const getTelegramWebhookSecret = () => getEnvValue("TELEGRAM_WEBHOOK_SECRET");

export const getTelegramAlertsChatId = () => getEnvValue("TELEGRAM_ALERT_CHAT_ID");

export const isTelegramAlertsConfigured = () =>
  Boolean(getTelegramAlertsBotToken() && getTelegramAlertsChatId());

export const getTelegramStartTokenTtlHours = () => {
  const parsedValue = Number.parseInt(getEnvValue("TELEGRAM_START_TOKEN_TTL_HOURS"), 10);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return 24 * 30;
  }

  return parsedValue;
};

export const isTelegramBotConfigured = () => Boolean(getTelegramBotToken());

export const buildTelegramBotStartLink = (startToken: string) => {
  const username = getTelegramBotUsername();

  if (!username || !startToken) {
    return null;
  }

  return `https://t.me/${username}?start=${encodeURIComponent(startToken)}`;
};

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
    ? parsedLessonSources.get(getLessonSourceKey(offerId, resolvedLessonLanguage))
    : null;
  const lessonSourceByDefault = parsedLessonSources.get(
    getLessonSourceKey(offerId, null),
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
    ? parsedChannelTargets.get(getChannelTargetKey(offerId, resolvedLessonLanguage))
    : null;
  const targetByDefault = parsedChannelTargets.get(getChannelTargetKey(offerId, null));
  const target = targetByLanguage ?? targetByDefault;

  if (!target) {
    return null;
  }

  return {
    chatId: target.chatId,
    lessonLanguage: target.lessonLanguage ?? resolvedLessonLanguage ?? null,
    offerId: target.offerId,
  } satisfies TelegramChannelTarget;
};
