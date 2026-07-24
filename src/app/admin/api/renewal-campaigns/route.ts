import { getActiveOnlineGroupCampaign } from "@/db/online-group-campaigns";
import {
  createRenewalCampaign,
  getRenewalCampaignBySlug,
  listRecentRenewalCampaigns,
  setRenewalCampaignStatus,
} from "@/db/renewal-campaigns";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  getBrowserJsonRequestErrorResponse,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_RENEWAL_CAMPAIGN_BODY_BYTES = 8 * 1024;

type CreateRenewalCampaignBody = {
  offerId?: string;
  regenerate?: boolean;
  sourceChatId?: string;
  sourceChatIds?: string[];
  title?: string;
};

const normalizeChatId = (value: string | null | undefined) =>
  (value ?? "").trim().slice(0, 80);

const normalizeTitle = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim().slice(0, 140);

const normalizeOfferId = (value: string | null | undefined) =>
  (value ?? "").trim().slice(0, 100);

const getSiteOrigin = (request: Request) => {
  const configuredSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim() || "";

  if (configuredSiteUrl) {
    try {
      return new URL(configuredSiteUrl).origin;
    } catch {
      // Fall through to request URL.
    }
  }

  return new URL(request.url).origin;
};

const buildRenewalCheckoutUrl = ({
  offerId,
  productId,
  request,
  slug,
}: {
  offerId: string;
  productId: string;
  request: Request;
  slug: string;
}) => {
  const checkoutUrl = new URL("/en/payment", getSiteOrigin(request));

  checkoutUrl.searchParams.set("product", productId);
  checkoutUrl.searchParams.set("offer", offerId);
  checkoutUrl.searchParams.set("renewal", slug);

  return checkoutUrl.toString();
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

  try {
    const campaigns = await listRecentRenewalCampaigns();

    return jsonNoStore({
      campaigns: campaigns.map((campaign) => ({
        checkoutUrl: buildRenewalCheckoutUrl({
          offerId: campaign.offerExternalId,
          productId: campaign.productExternalId,
          request,
          slug: campaign.slug,
        }),
        createdAt: campaign.createdAt.toISOString(),
        id: campaign.id,
        offerId: campaign.offerExternalId,
        slug: campaign.slug,
        sourceChatId: campaign.sourceChatId,
        sourceChatIds: campaign.sourceChatIds,
        sourceChatTitle: campaign.sourceChatTitles[0] ?? campaign.sourceChatId,
        sourceChatTitles: campaign.sourceChatTitles,
        status: campaign.status,
        targetChatId: campaign.targetChatId,
        title: campaign.title,
      })),
    });
  } catch (error) {
    console.error("Failed to list renewal campaigns", error);

    return jsonNoStore(
      {
        errorCode: "renewal_campaigns_unavailable",
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

  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_RENEWAL_CAMPAIGN_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:renewal-campaigns",
    limit: 30,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonNoStore(
      {
        errorCode: "rate_limited",
      },
      {
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
        status: 429,
      },
    );
  }

  try {
    const body = await parseJsonBody<CreateRenewalCampaignBody>(request);

    if (!body) {
      return jsonNoStore(
        {
          errorCode: "invalid_request_body",
        },
        { status: 400 },
      );
    }

    const sourceChatIds = [
      ...(Array.isArray(body.sourceChatIds) ? body.sourceChatIds : []),
      body.sourceChatId ?? "",
    ]
      .map(normalizeChatId)
      .filter(Boolean);
    const onlineGroupSettings = await getActiveOnlineGroupCampaign();
    const targetChatId = normalizeChatId(onlineGroupSettings?.regularChatId);

    if (!sourceChatIds.length || !onlineGroupSettings || !targetChatId) {
      return jsonNoStore(
        {
          errorCode: onlineGroupSettings
            ? "missing_chat_selection"
            : "online_group_settings_not_configured",
        },
        { status: 400 },
      );
    }

    const { campaign, isReused, sourceChats, targetChat } = await createRenewalCampaign({
      offerExternalId: normalizeOfferId(body.offerId) || undefined,
      regenerate: body.regenerate === true,
      sourceChatIds,
      targetChatId,
      title: normalizeTitle(body.title),
    });
    const checkoutUrl = buildRenewalCheckoutUrl({
      offerId: campaign.offerExternalId,
      productId: campaign.productExternalId,
      request,
      slug: campaign.slug,
    });

    return jsonNoStore({
      campaign: {
        checkoutUrl,
        createdAt: campaign.createdAt.toISOString(),
        id: campaign.id,
        offerId: campaign.offerExternalId,
        productId: campaign.productExternalId,
        slug: campaign.slug,
        sourceChatIds: sourceChats.map((chat) => chat.chatId),
        sourceChatTitles: sourceChats.map((chat) => chat.title),
        targetChatTitle: targetChat.title,
        title: campaign.title,
      },
      reused: isReused,
      status: "ready",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "";

    if (
      errorMessage === "renewal_offer_not_seeded" ||
      errorMessage === "telegram_chat_not_registered" ||
      errorMessage === "same_source_and_target_chat"
    ) {
      return jsonNoStore(
        {
          errorCode: errorMessage,
        },
        { status: 400 },
      );
    }

    console.error("Failed to create renewal campaign", error);

    return jsonNoStore(
      {
        errorCode: "renewal_campaign_failed",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore({ errorCode: "unauthorized" }, { status: 401 });
  }

  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_RENEWAL_CAMPAIGN_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:renewal-campaigns:archive",
    limit: 30,
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

  const body = await parseJsonBody<{ slug?: string }>(request);
  const campaign = body?.slug
    ? await setRenewalCampaignStatus({
        slug: body.slug,
        status: "archived",
      })
    : null;

  if (!campaign) {
    return jsonNoStore({ errorCode: "renewal_campaign_not_found" }, { status: 404 });
  }

  return jsonNoStore({
    slug: campaign.slug,
    status: "archived",
  });
}

export async function PATCH(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore({ errorCode: "unauthorized" }, { status: 401 });
  }

  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_RENEWAL_CAMPAIGN_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:renewal-campaigns:status",
    limit: 30,
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

  const body = await parseJsonBody<{ active?: boolean; slug?: string }>(request);

  if (!body?.slug || typeof body.active !== "boolean") {
    return jsonNoStore({ errorCode: "invalid_request_body" }, { status: 400 });
  }

  if (body.active) {
    const onlineGroupCampaign = await getActiveOnlineGroupCampaign();
    const campaign = await getRenewalCampaignBySlug(body.slug);

    if (
      !campaign ||
      !onlineGroupCampaign ||
      campaign.targetChatId !== onlineGroupCampaign.regularChatId
    ) {
      return jsonNoStore({ errorCode: "renewal_campaign_inactive" }, { status: 409 });
    }
  }

  const campaign = await setRenewalCampaignStatus({
    slug: body.slug,
    status: body.active ? "active" : "archived",
  });

  if (!campaign) {
    return jsonNoStore({ errorCode: "renewal_campaign_not_found" }, { status: 404 });
  }

  return jsonNoStore({
    slug: campaign.slug,
    status: campaign.status,
  });
}
