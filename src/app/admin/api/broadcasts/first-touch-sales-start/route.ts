import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  deliverFirstTouchSalesStartCampaign,
  excludeEmailCampaignLead,
  FIRST_TOUCH_SALES_START_CAMPAIGN_KEY,
  getEmailCampaignAdminSnapshot,
} from "@/lib/email-campaigns";
import {
  getBrowserJsonRequestErrorResponse,
  isTrustedBrowserOrigin,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { getProductSaleState } from "@/lib/sales-availability";

const FIRST_TOUCH_PRODUCT = SELLABLE_PRODUCTS["first-touch"];

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4 * 1024;

const getRateLimitResponse = async ({
  keyPrefix,
  limit,
  request,
}: {
  keyPrefix: string;
  limit: number;
  request: Request;
}) => {
  const rateLimit = await consumeRequestRateLimit({
    keyPrefix,
    limit,
    request,
    windowMs: 60_000,
  });

  if (!rateLimit.limited) {
    return null;
  }

  return jsonNoStore(
    { errorCode: "rate_limited" },
    {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      status: 429,
    },
  );
};

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore(
      {
        errorCode: "unauthorized",
      },
      { status: 401 },
    );
  }

  const rateLimitResponse = await getRateLimitResponse({
    keyPrefix: "admin:first-touch-broadcast:read",
    limit: 60,
    request,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const snapshot = await getEmailCampaignAdminSnapshot(
      FIRST_TOUCH_SALES_START_CAMPAIGN_KEY,
    );

    return jsonNoStore({
      ...snapshot,
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
    return jsonNoStore({ errorCode: "invalid_origin" }, { status: 403 });
  }

  const rateLimitResponse = await getRateLimitResponse({
    keyPrefix: "admin:first-touch-broadcast:send",
    limit: 10,
    request,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // The campaign email carries a checkout link. Sending it for a product whose
    // sales are closed would hand out a link that only ends in an error.
    const saleState = await getProductSaleState(FIRST_TOUCH_PRODUCT.id);

    if (saleState === "unavailable") {
      return jsonNoStore({ errorCode: "sales_state_unavailable" }, { status: 503 });
    }

    if (saleState === "closed") {
      return jsonNoStore({ errorCode: "product_sales_closed" }, { status: 409 });
    }

    const result = await deliverFirstTouchSalesStartCampaign();
    const snapshot = await getEmailCampaignAdminSnapshot(
      FIRST_TOUCH_SALES_START_CAMPAIGN_KEY,
    );

    return jsonNoStore({
      audience: snapshot.audience,
      result,
      stats: snapshot.stats,
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

export async function PATCH(request: Request) {
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

  const rateLimitResponse = await getRateLimitResponse({
    keyPrefix: "admin:first-touch-broadcast:exclude",
    limit: 40,
    request,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const body = await parseJsonBody<{ leadId?: string; scope?: string }>(request);
  const leadId = body?.leadId?.trim() ?? "";
  const scope =
    body?.scope === "global" ? "global" : body?.scope === "campaign" ? "campaign" : null;

  if (!body || !leadId || !scope) {
    return jsonNoStore({ errorCode: "invalid_request_body" }, { status: 400 });
  }

  try {
    const result = await excludeEmailCampaignLead({
      campaignKey: FIRST_TOUCH_SALES_START_CAMPAIGN_KEY,
      leadId,
      scope,
    });

    if (result.status === "not_found") {
      return jsonNoStore({ errorCode: "lead_not_found" }, { status: 404 });
    }

    if (result.status === "delivery_in_progress") {
      return jsonNoStore({ errorCode: "broadcast_in_progress" }, { status: 409 });
    }

    if (result.status === "not_actionable") {
      return jsonNoStore({ errorCode: "lead_not_actionable" }, { status: 409 });
    }

    return jsonNoStore({
      audience: result.snapshot.audience,
      exclusion: { leadId, scope: result.scope },
      stats: result.snapshot.stats,
    });
  } catch (error) {
    console.error("Failed to exclude First Touch broadcast lead", error);

    return jsonNoStore(
      { errorCode: "first_touch_broadcast_exclusion_failed" },
      { status: 500 },
    );
  }
}
