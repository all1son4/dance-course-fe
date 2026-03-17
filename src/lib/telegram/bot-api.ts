import { getTelegramBotToken } from "./config";

type TelegramApiResponse<T> = {
  description?: string;
  ok: boolean;
  result?: T;
};

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";

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

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = (await response.json()) as TelegramApiResponse<T>;

  if (!response.ok || !data.ok || !data.result) {
    throw new Error(
      `telegram_api_failed:${method}:${data.description ?? "unknown_error"}`,
    );
  }

  return data.result;
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
