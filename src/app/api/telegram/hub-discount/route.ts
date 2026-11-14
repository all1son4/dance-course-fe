import {
  INSPIRATION_HUB_DISCOUNT_SLUG,
  INSPIRATION_HUB_RENEWAL_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { getDatabase } from "@/db/client";
import {
  findValidHubDiscountVerification,
  hasActiveStandaloneHub,
  type HubDiscountBasis,
  listHubDiscountCohorts,
  recordHubDiscountVerification,
} from "@/db/hub-discount";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";
import { getTelegramChatMember } from "@/lib/telegram/bot-api";
import { isActiveTelegramMember } from "@/lib/telegram/chat-membership";
import {
  createTelegramLoginNonce,
  getTelegramLoginClientId,
  getTelegramUserIdFromClaims,
  isTelegramLoginConfigured,
  verifyTelegramLoginIdToken,
  verifyTelegramLoginNonce,
} from "@/lib/telegram/login";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 16 * 1024;
const SLUG = INSPIRATION_HUB_DISCOUNT_SLUG;

type HubDiscountVerifyBody = {
  checkoutSessionId?: string;
  idToken?: string;
  nonce?: string;
};

type MembershipCheck = { cohortId: string; checkFailed: boolean; isMember: boolean };

const normalizeCheckoutSessionId = (value: string | null | undefined) =>
  (value ?? "").trim().slice(0, 160);

const rateLimited = (retryAfterSeconds: number) =>
  jsonErrorNoStore("rate_limited", {
    headers: { "Retry-After": String(retryAfterSeconds) },
    status: 429,
  });

const checkCohortMembership = async (
  cohort: { id: string; mainChatId: string },
  telegramUserId: string,
): Promise<MembershipCheck> => {
  try {
    const member = await getTelegramChatMember({
      chatId: cohort.mainChatId,
      userId: telegramUserId,
    });
    return {
      cohortId: cohort.id,
      checkFailed: false,
      isMember: isActiveTelegramMember(member),
    };
  } catch (error) {
    logSafeError("Failed to check Hub discount cohort membership", error);
    return { cohortId: cohort.id, checkFailed: true, isMember: false };
  }
};

/**
 * HUB-D17/D36 in their order: an active paid Hub of this account, then the chat of
 * the latest started cohort, then chats of cohorts that ended at most 7 days ago.
 * A Telegram failure is not an absence: without a confirmed basis it fails the check.
 */
const resolveHubDiscountBasis = async (
  telegramUserId: string,
  checkedAt: Date,
): Promise<{ basis: HubDiscountBasis | null; checkFailed: boolean }> => {
  const database = getDatabase();

  if (await hasActiveStandaloneHub(database, { checkedAt, telegramUserId })) {
    return { basis: { basis: "active_hub", cohortId: null }, checkFailed: false };
  }

  const cohorts = await listHubDiscountCohorts(database, checkedAt);
  const checks = await Promise.all(
    cohorts.map((cohort) => checkCohortMembership(cohort, telegramUserId)),
  );
  const matched = checks.find((check) => check.isMember);

  return {
    basis: matched ? { basis: "cohort_chat", cohortId: matched.cohortId } : null,
    checkFailed: !matched && checks.some((check) => check.checkFailed),
  };
};

const verifyHubDiscount = async (body: HubDiscountVerifyBody) => {
  const checkoutSessionId = normalizeCheckoutSessionId(body.checkoutSessionId);
  const idToken = body.idToken?.trim() ?? "";
  const nonce = body.nonce?.trim().slice(0, 160) ?? "";

  if (!checkoutSessionId) {
    return jsonErrorNoStore("missing_checkout_session_id", { status: 400 });
  }
  if (!idToken) {
    return jsonErrorNoStore("missing_telegram_id_token", { status: 400 });
  }
  if (!nonce || !verifyTelegramLoginNonce({ checkoutSessionId, nonce, slug: SLUG })) {
    return jsonErrorNoStore("invalid_telegram_login_nonce", { status: 403 });
  }

  // The Telegram ID from the login is enough; no @username is required (handoff §7).
  const claims = await verifyTelegramLoginIdToken(idToken, nonce);
  const telegramUserId = getTelegramUserIdFromClaims(claims);
  const telegramUsername = claims.preferred_username ?? "";
  const { basis, checkFailed } = await resolveHubDiscountBasis(
    telegramUserId,
    new Date(),
  );
  const status = basis ? "verified" : checkFailed ? "failed" : "not_member";

  await recordHubDiscountVerification({
    basis,
    checkoutSessionId,
    lastError:
      status === "failed"
        ? "telegram_membership_check_failed"
        : status === "not_member"
          ? "telegram_user_not_eligible_for_hub_discount"
          : null,
    status,
    telegramUserId,
    telegramUsername,
  });

  if (status === "failed") {
    return jsonErrorNoStore("telegram_membership_check_failed", { status: 502 });
  }
  if (status === "not_member") {
    return jsonNoStore(
      { errorCode: "telegram_user_not_in_source_chat", status: "not_member" },
      { status: 403 },
    );
  }

  return jsonNoStore({
    customerProfile: null,
    status: "verified",
    telegramUser: {
      id: telegramUserId,
      name: claims.name ?? "",
      username: telegramUsername,
    },
  });
};

/** Same shape as the Online renewal campaign, so the payment page reuses its form. */
export async function GET(request: Request) {
  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "telegram:hub-discount:get",
    limit: 120,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) return rateLimited(rateLimit.retryAfterSeconds);
  if (!isTelegramLoginConfigured()) {
    return jsonErrorNoStore("telegram_login_not_configured", { status: 500 });
  }

  const checkoutSessionId = normalizeCheckoutSessionId(
    new URL(request.url).searchParams.get("checkoutSessionId"),
  );

  if (!checkoutSessionId) {
    return jsonErrorNoStore("missing_checkout_session_id", { status: 400 });
  }

  try {
    const verification = await findValidHubDiscountVerification(checkoutSessionId);
    const product = SELLABLE_PRODUCTS["inspiration-hub"];

    return jsonNoStore({
      campaign: {
        offerId: INSPIRATION_HUB_RENEWAL_OFFER_ID,
        productId: product.id,
        slug: SLUG,
        sourceChatTitle: "",
        targetChatTitle: product.title,
        title: product.title,
      },
      clientId: getTelegramLoginClientId(),
      nonce: createTelegramLoginNonce({ checkoutSessionId, slug: SLUG }),
      status: "ready",
      telegramUser: verification
        ? {
            id: verification.telegramUserId,
            name: "",
            username: verification.telegramUsername ?? "",
          }
        : null,
      verified: Boolean(verification),
    });
  } catch (error) {
    logSafeError("Failed to load the Hub discount check", error);
    return jsonErrorNoStore("hub_discount_unavailable", { status: 503 });
  }
}

export async function POST(request: Request) {
  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_BODY_BYTES,
  );
  if (requestErrorResponse) return requestErrorResponse;

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "telegram:hub-discount:verify",
    limit: 60,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) return rateLimited(rateLimit.retryAfterSeconds);
  if (!isTelegramLoginConfigured()) {
    return jsonErrorNoStore("telegram_login_not_configured", { status: 500 });
  }

  try {
    const { body, errorResponse } = await parseJsonBody<HubDiscountVerifyBody>(
      request,
      MAX_BODY_BYTES,
    );

    if (errorResponse) return errorResponse;
    if (!body) return jsonErrorNoStore("invalid_request_body", { status: 400 });

    return await verifyHubDiscount(body);
  } catch (error) {
    logSafeError("Failed to verify the Hub discount", error);
    return jsonErrorNoStore("telegram_renewal_verification_failed", { status: 500 });
  }
}
