import { getActiveOnlineGroupCampaign } from "@/db/online-group-campaigns";
import {
  findRenewalCustomerProfile,
  findValidRenewalVerification,
  getActiveRenewalCampaignBySlug,
  upsertRenewalVerification,
} from "@/db/renewal-campaigns";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { getTelegramChatMember, type TelegramChatMember } from "@/lib/telegram/bot-api";
import {
  getTelegramLoginClientId,
  getTelegramUserIdFromClaims,
  isTelegramLoginConfigured,
  verifyTelegramLoginIdToken,
} from "@/lib/telegram/login";

export const runtime = "nodejs";

const MAX_RENEWAL_VERIFY_BODY_BYTES = 16 * 1024;

type RenewalVerifyBody = {
  checkoutSessionId?: string;
  claimedUsername?: string;
  idToken?: string;
  slug?: string;
};

const normalizeCheckoutSessionId = (value: string | null | undefined) =>
  (value ?? "").trim().slice(0, 160);

const normalizeSlug = (value: string | null | undefined) =>
  (value ?? "").trim().slice(0, 80);

const normalizeUsername = (value: string | null | undefined) =>
  (value ?? "").trim().replace(/^@/, "").toLowerCase().slice(0, 32);

const isActiveTelegramMember = (member: TelegramChatMember | undefined) => {
  const status = member?.status?.trim() ?? "";

  if (status === "member" || status === "administrator" || status === "creator") {
    return true;
  }

  if (status === "restricted") {
    return member?.is_member === true;
  }

  return false;
};

const getRenewalCampaignResponse = async ({
  checkoutSessionId,
  slug,
}: {
  checkoutSessionId: string;
  slug: string;
}) => {
  const campaign = await getActiveRenewalCampaignBySlug(slug);

  if (!campaign) {
    return jsonErrorNoStore("renewal_campaign_not_found", { status: 404 });
  }

  const onlineGroupCampaign = await getActiveOnlineGroupCampaign();

  if (
    !onlineGroupCampaign ||
    onlineGroupCampaign.regularChatId !== campaign.targetChatId
  ) {
    return jsonErrorNoStore("renewal_campaign_inactive", { status: 409 });
  }

  const verification = checkoutSessionId
    ? await findValidRenewalVerification({
        checkoutSessionId,
        slug,
      })
    : null;

  return jsonNoStore({
    campaign: {
      offerId: campaign.offerExternalId,
      productId: campaign.productExternalId,
      slug: campaign.slug,
      sourceChatTitles: campaign.sourceChatTitles,
      sourceChatTitle: campaign.sourceChatTitle,
      targetChatTitle: campaign.targetChatTitle,
      title: campaign.title,
    },
    clientId: getTelegramLoginClientId(),
    status: "ready",
    telegramUser: verification
      ? {
          id: verification.verification.telegramUserId,
          name: verification.verification.telegramName ?? "",
          username: verification.verification.telegramUsername ?? "",
        }
      : null,
    verified: Boolean(verification),
  });
};

export async function GET(request: Request) {
  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "telegram:renewal:get",
    limit: 120,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonErrorNoStore("rate_limited", {
      headers: {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
      status: 429,
    });
  }

  if (!isTelegramLoginConfigured()) {
    return jsonErrorNoStore("telegram_login_not_configured", { status: 500 });
  }

  const url = new URL(request.url);
  const slug = normalizeSlug(url.searchParams.get("slug"));
  const checkoutSessionId = normalizeCheckoutSessionId(
    url.searchParams.get("checkoutSessionId"),
  );

  if (!slug) {
    return jsonErrorNoStore("missing_renewal_slug", { status: 400 });
  }

  return getRenewalCampaignResponse({
    checkoutSessionId,
    slug,
  });
}

export async function POST(request: Request) {
  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_RENEWAL_VERIFY_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "telegram:renewal:verify",
    limit: 60,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonErrorNoStore("rate_limited", {
      headers: {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
      status: 429,
    });
  }

  if (!isTelegramLoginConfigured()) {
    return jsonErrorNoStore("telegram_login_not_configured", { status: 500 });
  }

  try {
    const body = await parseJsonBody<RenewalVerifyBody>(request);

    if (!body) {
      return jsonErrorNoStore("invalid_request_body", { status: 400 });
    }

    const slug = normalizeSlug(body.slug);
    const checkoutSessionId = normalizeCheckoutSessionId(body.checkoutSessionId);
    const claimedUsername = normalizeUsername(body.claimedUsername);
    const idToken = body.idToken?.trim() ?? "";

    if (!slug) {
      return jsonErrorNoStore("missing_renewal_slug", { status: 400 });
    }

    if (!checkoutSessionId) {
      return jsonErrorNoStore("missing_checkout_session_id", { status: 400 });
    }

    if (!idToken) {
      return jsonErrorNoStore("missing_telegram_id_token", { status: 400 });
    }

    if (!claimedUsername) {
      return jsonErrorNoStore("missing_telegram_username", { status: 400 });
    }

    const campaign = await getActiveRenewalCampaignBySlug(slug);

    if (!campaign) {
      return jsonErrorNoStore("renewal_campaign_not_found", { status: 404 });
    }

    const onlineGroupCampaign = await getActiveOnlineGroupCampaign();

    if (
      !onlineGroupCampaign ||
      onlineGroupCampaign.regularChatId !== campaign.targetChatId
    ) {
      return jsonErrorNoStore("renewal_campaign_inactive", { status: 409 });
    }

    const claims = await verifyTelegramLoginIdToken(idToken);
    const telegramUserId = getTelegramUserIdFromClaims(claims);
    const telegramUsername = claims.preferred_username ?? "";

    if (normalizeUsername(telegramUsername) !== claimedUsername) {
      return jsonErrorNoStore("telegram_username_mismatch", { status: 403 });
    }
    const memberships = await Promise.all(
      campaign.sourceChatIds.map(async (chatId) => {
        try {
          const member = await getTelegramChatMember({
            chatId,
            userId: telegramUserId,
          });

          return {
            chatId,
            checkFailed: false,
            isMember: isActiveTelegramMember(member),
          };
        } catch (error) {
          console.error("Failed to check renewal source chat membership", {
            chatId,
            error,
            telegramUserId,
          });

          return { chatId, checkFailed: true, isMember: false };
        }
      }),
    );
    const matchedMembership = memberships.find((membership) => membership.isMember);
    const isMember = Boolean(matchedMembership);
    const membershipCheckFailed = memberships.some(
      (membership) => membership.checkFailed,
    );

    if (!isMember && membershipCheckFailed) {
      await upsertRenewalVerification({
        campaign,
        checkoutSessionId,
        lastError: "telegram_membership_check_failed",
        status: "failed",
        telegramName: claims.name,
        telegramUserId,
        telegramUsername,
      });

      return jsonErrorNoStore("telegram_membership_check_failed", {
        status: 502,
      });
    }

    await upsertRenewalVerification({
      campaign,
      checkoutSessionId,
      lastError: isMember ? null : "telegram_user_not_in_source_chat",
      sourceChatId: matchedMembership?.chatId,
      status: isMember ? "verified" : "not_member",
      telegramName: claims.name,
      telegramUserId,
      telegramUsername,
    });

    if (!isMember) {
      return jsonNoStore(
        {
          errorCode: "telegram_user_not_in_source_chat",
          status: "not_member",
        },
        { status: 403 },
      );
    }

    let customerProfile = null;

    try {
      customerProfile = await findRenewalCustomerProfile({
        sourceChatId: matchedMembership?.chatId ?? campaign.sourceChatId,
        telegramUserId,
      });
    } catch (error) {
      console.error("Failed to load renewal customer profile", error);
    }

    return jsonNoStore({
      customerProfile,
      status: "verified",
      telegramUser: {
        id: telegramUserId,
        name: claims.name ?? "",
        username: telegramUsername,
      },
    });
  } catch (error) {
    console.error("Failed to verify Telegram renewal access", error);

    return jsonErrorNoStore("telegram_renewal_verification_failed", {
      status: 500,
    });
  }
}
