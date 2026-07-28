import { listActiveTelegramChats } from "@/db/renewal-campaigns";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import { jsonNoStore } from "@/lib/http-security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore(
      {
        errorCode: "unauthorized",
      },
      { status: 401 },
    );
  }

  try {
    const chats = await listActiveTelegramChats();

    return jsonNoStore({
      chats: chats.map((chat) => ({
        chatId: chat.chatId,
        title: chat.title,
        type: chat.type,
        updatedAt: chat.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Failed to list Telegram chats", error);

    return jsonNoStore(
      {
        errorCode: "telegram_chats_unavailable",
      },
      { status: 500 },
    );
  }
}
