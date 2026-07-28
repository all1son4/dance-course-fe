import { getTelegramBotToken } from "./config";

type TelegramApiResponse<T> = {
  description?: string;
  error_code?: number;
  ok: boolean;
  parameters?: {
    retry_after?: number;
  };
  result?: T;
};

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const TELEGRAM_API_TIMEOUT_MS = 10_000;
const TELEGRAM_API_MAX_ATTEMPTS = 3;
const TELEGRAM_API_RETRY_BASE_DELAY_MS = 350;
const TELEGRAM_API_RETRY_MAX_DELAY_MS = 2_500;

const wait = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

const isRetryableTelegramHttpError = (
  status: number,
  data: TelegramApiResponse<unknown> | null,
) => status === 429 || status >= 500 || data?.error_code === 429;

const isRetryableTelegramNetworkError = (error: unknown) =>
  error instanceof TypeError || isAbortError(error);

const getRetryDelayMs = ({
  attempt,
  retryAfterSeconds,
}: {
  attempt: number;
  retryAfterSeconds?: number;
}) => {
  if (Number.isFinite(retryAfterSeconds) && (retryAfterSeconds ?? 0) > 0) {
    return Math.ceil((retryAfterSeconds ?? 0) * 1000);
  }

  const baseDelay = Math.min(
    TELEGRAM_API_RETRY_BASE_DELAY_MS * 2 ** attempt,
    TELEGRAM_API_RETRY_MAX_DELAY_MS,
  );
  const jitter = Math.floor(Math.random() * 180);

  return baseDelay + jitter;
};

const getTelegramApiUrl = ({
  botToken,
  method,
}: {
  botToken?: string;
  method: string;
}) => {
  const resolvedBotToken = botToken?.trim() || getTelegramBotToken();

  if (!resolvedBotToken) {
    return "";
  }

  return `${TELEGRAM_API_BASE_URL}/bot${resolvedBotToken}/${method}`;
};

const callTelegramApi = async <T>(
  method: string,
  payload: Record<string, unknown>,
  options?: {
    botToken?: string;
  },
): Promise<T> => {
  const apiUrl = getTelegramApiUrl({
    botToken: options?.botToken,
    method,
  });

  if (!apiUrl) {
    throw new Error("telegram_bot_not_configured");
  }

  for (let attempt = 0; attempt < TELEGRAM_API_MAX_ATTEMPTS; attempt += 1) {
    const requestController = new AbortController();
    const timeoutId = setTimeout(() => {
      requestController.abort();
    }, TELEGRAM_API_TIMEOUT_MS);

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: requestController.signal,
      });
      const data = (await response
        .json()
        .catch(() => null)) as TelegramApiResponse<T> | null;
      const hasResult = Boolean(data && "result" in data);

      if (response.ok && data?.ok && hasResult) {
        return data.result as T;
      }

      const description = data?.description ?? "unknown_error";
      const shouldRetry =
        attempt < TELEGRAM_API_MAX_ATTEMPTS - 1 &&
        isRetryableTelegramHttpError(response.status, data);

      if (shouldRetry) {
        const retryAfterFromBody = data?.parameters?.retry_after;
        const retryAfterFromHeader = Number(response.headers.get("retry-after") ?? "");
        const retryAfterSeconds = Number.isFinite(retryAfterFromBody)
          ? retryAfterFromBody
          : Number.isFinite(retryAfterFromHeader)
            ? retryAfterFromHeader
            : undefined;

        await wait(
          getRetryDelayMs({
            attempt,
            retryAfterSeconds,
          }),
        );
        continue;
      }

      throw new Error(`telegram_api_failed:${method}:${description}`);
    } catch (error) {
      const shouldRetry =
        attempt < TELEGRAM_API_MAX_ATTEMPTS - 1 && isRetryableTelegramNetworkError(error);

      if (shouldRetry) {
        await wait(
          getRetryDelayMs({
            attempt,
          }),
        );
        continue;
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(`telegram_api_failed:${method}:unknown_error`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(`telegram_api_failed:${method}:unknown_error`);
};

export const sendTelegramMessage = async ({
  botToken,
  chatId,
  disableWebPagePreview,
  parseMode,
  text,
}: {
  botToken?: string;
  chatId: number | string;
  disableWebPagePreview?: boolean;
  parseMode?: "HTML" | "MarkdownV2";
  text: string;
}) =>
  callTelegramApi(
    "sendMessage",
    {
      chat_id: chatId,
      disable_web_page_preview: disableWebPagePreview,
      parse_mode: parseMode,
      text,
    },
    {
      botToken,
    },
  );

export const copyTelegramMessage = async ({
  botToken,
  protectContent = true,
  sourceChatId,
  sourceMessageId,
  targetChatId,
}: {
  botToken?: string;
  protectContent?: boolean;
  sourceChatId: string;
  sourceMessageId: number;
  targetChatId: number | string;
}) =>
  callTelegramApi(
    "copyMessage",
    {
      chat_id: targetChatId,
      from_chat_id: sourceChatId,
      message_id: sourceMessageId,
      protect_content: protectContent,
    },
    {
      botToken,
    },
  );

type TelegramInviteLink = {
  expire_date?: number;
  invite_link: string;
  member_limit?: number;
  name?: string;
};

export type TelegramChatMember = {
  is_member?: boolean;
  status?: string;
  user?: {
    first_name?: string;
    id?: number;
    last_name?: string;
    username?: string;
  };
};

export const createTelegramChatInviteLink = async ({
  botToken,
  chatId,
  expireDateUnix,
  memberLimit = 1,
  name,
}: {
  botToken?: string;
  chatId: number | string;
  expireDateUnix?: number;
  memberLimit?: number;
  name?: string;
}) =>
  callTelegramApi<TelegramInviteLink>(
    "createChatInviteLink",
    {
      chat_id: chatId,
      member_limit: memberLimit,
      ...(Number.isFinite(expireDateUnix) && expireDateUnix
        ? { expire_date: expireDateUnix }
        : {}),
      ...(name ? { name } : {}),
    },
    {
      botToken,
    },
  );

export const revokeTelegramChatInviteLink = async ({
  botToken,
  chatId,
  inviteLink,
}: {
  botToken?: string;
  chatId: number | string;
  inviteLink: string;
}) =>
  callTelegramApi<TelegramInviteLink>(
    "revokeChatInviteLink",
    {
      chat_id: chatId,
      invite_link: inviteLink,
    },
    {
      botToken,
    },
  );

export const banTelegramChatMember = async ({
  botToken,
  chatId,
  revokeMessages = false,
  untilDateUnix,
  userId,
}: {
  botToken?: string;
  chatId: number | string;
  revokeMessages?: boolean;
  untilDateUnix?: number;
  userId: number | string;
}) =>
  callTelegramApi<boolean>(
    "banChatMember",
    {
      chat_id: chatId,
      revoke_messages: revokeMessages,
      ...(untilDateUnix ? { until_date: untilDateUnix } : {}),
      user_id: userId,
    },
    {
      botToken,
    },
  );

export const unbanTelegramChatMember = async ({
  botToken,
  chatId,
  onlyIfBanned = true,
  userId,
}: {
  botToken?: string;
  chatId: number | string;
  onlyIfBanned?: boolean;
  userId: number | string;
}) =>
  callTelegramApi<boolean>(
    "unbanChatMember",
    {
      chat_id: chatId,
      only_if_banned: onlyIfBanned,
      user_id: userId,
    },
    {
      botToken,
    },
  );

export const getTelegramChatMember = async ({
  botToken,
  chatId,
  userId,
}: {
  botToken?: string;
  chatId: number | string;
  userId: number | string;
}) =>
  callTelegramApi<TelegramChatMember>(
    "getChatMember",
    {
      chat_id: chatId,
      user_id: userId,
    },
    {
      botToken,
    },
  );
