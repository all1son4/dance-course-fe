import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  deliverFirstTouchSalesStartCampaign,
  FIRST_TOUCH_SALES_START_CAMPAIGN_KEY,
  getEmailCampaignStats,
} from "@/lib/email-campaigns";
import { isTrustedBrowserOrigin, jsonNoStore } from "@/lib/http-security";

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
    const stats = await getEmailCampaignStats(FIRST_TOUCH_SALES_START_CAMPAIGN_KEY);

    return jsonNoStore({
      stats,
    });
  } catch (error) {
    console.error("Failed to load First Touch broadcast stats", error);

    return jsonNoStore(
      {
        errorCode: "first_touch_broadcast_stats_failed",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore(
      {
        errorCode: "unauthorized",
      },
      { status: 401 },
    );
  }

  if (!isTrustedBrowserOrigin(request)) {
    return jsonNoStore(
      {
        errorCode: "invalid_origin",
      },
      { status: 403 },
    );
  }

  try {
    const result = await deliverFirstTouchSalesStartCampaign();

    return jsonNoStore({
      result,
    });
  } catch (error) {
    console.error("Failed to deliver First Touch broadcast", error);

    return jsonNoStore(
      {
        errorCode: "first_touch_broadcast_failed",
      },
      { status: 500 },
    );
  }
}
