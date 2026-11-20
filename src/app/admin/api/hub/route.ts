import { getHubAdminOverview, readHubChatMembers } from "@/lib/admin/hub-admin";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import { jsonErrorNoStore, jsonNoStore } from "@/lib/http-security";
import { logSafeError } from "@/lib/safe-error-log";

export const runtime = "nodejs";

const MAX_PREVIEW_DAYS = 120;

/**
 * The Inspiration Hub tab. `?previewAt=<ISO>` shows whom the cron would remove at
 * another moment; the preview never writes and never calls Telegram.
 */
export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  const previewParam = new URL(request.url).searchParams.get("previewAt");
  const previewAt = previewParam ? new Date(previewParam) : undefined;
  const now = new Date();

  if (
    previewAt &&
    (!Number.isFinite(previewAt.getTime()) ||
      Math.abs(previewAt.getTime() - now.getTime()) > MAX_PREVIEW_DAYS * 24 * 3600_000)
  ) {
    return jsonErrorNoStore("invalid_preview_date", { status: 400 });
  }

  try {
    const overview = await getHubAdminOverview({ now, previewAt });
    // Live from Telegram only for the tab itself, never for the overview tiles.
    const members = overview.chat ? await readHubChatMembers(overview.chat.chatId) : null;
    return jsonNoStore({ ...overview, members });
  } catch (error) {
    logSafeError("Failed to load the Inspiration Hub tab", error);
    return jsonErrorNoStore("hub_unavailable", { status: 500 });
  }
}
