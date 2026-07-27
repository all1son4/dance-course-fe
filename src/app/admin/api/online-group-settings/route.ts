import {
  listRecentOnlineGroupCampaigns,
  saveOnlineGroupSettings,
} from "@/db/online-group-campaigns";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  getBrowserJsonRequestErrorResponse,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;

type SaveSettingsBody = {
  inspirationChatId?: string;
  mainChatId?: string;
  startsAt?: string;
  title?: string;
};

const normalizeText = (value: string | null | undefined, maxLength: number) =>
  (value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const serializeCampaign = (campaign: {
  createdAt: Date;
  id: string;
  libraryChatId: string;
  regularChatId: string;
  startsAt: Date;
  status: string;
  title: string;
}) => ({
  createdAt: campaign.createdAt.toISOString(),
  id: campaign.id,
  inspirationChatId: campaign.libraryChatId,
  mainChatId: campaign.regularChatId,
  startsAt: campaign.startsAt.toISOString(),
  status: campaign.status,
  title: campaign.title,
});

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore({ errorCode: "unauthorized" }, { status: 401 });
  }

  try {
    const campaigns = await listRecentOnlineGroupCampaigns();

    return jsonNoStore({
      campaigns: campaigns.map(serializeCampaign),
    });
  } catch (error) {
    console.error("Failed to load Online Group settings", error);
    return jsonNoStore(
      { errorCode: "online_group_settings_unavailable" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore({ errorCode: "unauthorized" }, { status: 401 });
  }

  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:online-group-settings",
    limit: 20,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonNoStore(
      { errorCode: "rate_limited" },
      {
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        status: 429,
      },
    );
  }

  try {
    const body = await parseJsonBody<SaveSettingsBody>(request);

    if (!body) {
      return jsonNoStore({ errorCode: "invalid_request_body" }, { status: 400 });
    }

    const { campaign, inspirationChat, isReused, mainChat } =
      await saveOnlineGroupSettings({
        inspirationChatId: normalizeText(body.inspirationChatId, 80),
        mainChatId: normalizeText(body.mainChatId, 80),
        startsAt: body.startsAt ?? "",
        title: normalizeText(body.title, 140),
      });

    return jsonNoStore({
      campaign: {
        ...serializeCampaign(campaign),
        inspirationChatTitle: inspirationChat.title,
        mainChatTitle: mainChat.title,
      },
      reused: isReused,
      status: "ready",
    });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "";
    const clientErrors = new Set([
      "invalid_start_date",
      "inspiration_chat_is_fixed",
      "missing_chat_selection",
      "same_main_and_inspiration_chat",
      "telegram_chat_not_registered",
    ]);

    if (clientErrors.has(errorCode)) {
      return jsonNoStore({ errorCode }, { status: 400 });
    }

    console.error("Failed to save Online Group settings", error);
    return jsonNoStore({ errorCode: "online_group_settings_failed" }, { status: 500 });
  }
}
