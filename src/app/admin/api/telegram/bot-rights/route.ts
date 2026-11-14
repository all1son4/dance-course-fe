import { eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { telegramChats } from "@/db/schema";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";
import { getTelegramChatMember } from "@/lib/telegram/bot-api";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2 * 1024;

type BotMember = {
  status?: string;
  can_invite_users?: boolean;
  can_restrict_members?: boolean;
  can_pin_messages?: boolean;
  can_delete_messages?: boolean;
};

/**
 * "Проверить права бота": what the bot may do in a registered chat. The Hub and the
 * cohort chats need inviting and banning; the closure post needs pinning (HUB-D29).
 * Read-only: one getChatMember call about the bot itself.
 */
export async function POST(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_BODY_BYTES,
  );
  if (requestErrorResponse) return requestErrorResponse;

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:telegram-bot-rights",
    limit: 20,
    onBackendUnavailable: "deny",
    request,
    windowMs: 60_000,
  });
  if (rateLimit.backendUnavailable) {
    return jsonErrorNoStore("rate_limit_unavailable", { status: 503 });
  }
  if (rateLimit.limited) {
    return jsonErrorNoStore("rate_limited", {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      status: 429,
    });
  }

  try {
    const { body, errorResponse } = await parseJsonBody<{ chatId?: unknown }>(
      request,
      MAX_BODY_BYTES,
    );
    if (errorResponse) return errorResponse;
    const chatId = typeof body?.chatId === "string" ? body.chatId.trim() : "";
    if (!chatId) return jsonErrorNoStore("invalid_request_body", { status: 400 });

    // Only chats the bot registered are checked; the admin never probes others.
    const [chat] = await getDatabase()
      .select({ chatId: telegramChats.chatId })
      .from(telegramChats)
      .where(eq(telegramChats.chatId, chatId));
    if (!chat) return jsonErrorNoStore("telegram_chat_not_registered", { status: 404 });

    const botId = (process.env.TELEGRAM_BOT_TOKEN ?? "").split(":")[0]?.trim();
    if (!botId) return jsonErrorNoStore("telegram_bot_not_configured", { status: 500 });

    const member = (await getTelegramChatMember({ chatId, userId: botId })) as BotMember;
    const isAdmin = member.status === "administrator" || member.status === "creator";

    return jsonNoStore({
      chatId,
      status: member.status ?? "unknown",
      isAdmin,
      canInvite: isAdmin && member.can_invite_users !== false,
      canBan: isAdmin && member.can_restrict_members !== false,
      canPin: isAdmin && member.can_pin_messages !== false,
    });
  } catch (error) {
    logSafeError("Failed to check the bot's rights in a chat", error);
    return jsonErrorNoStore("telegram_check_failed", { status: 502 });
  }
}
