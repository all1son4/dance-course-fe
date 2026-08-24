import { findPaymentRecordByIntentIdFromDatabase } from "@/db/payment-records";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  getBrowserJsonRequestErrorResponse,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import {
  ensureTelegramAccessLinkForPayment,
  isOfferEligibleForTelegramAccessLink,
} from "@/lib/telegram/access";
import {
  ensureOnlineGroupAccessForPayment,
  type OnlineGroupAccessKey,
} from "@/lib/telegram/online-group-access";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4 * 1024;

type ReissueAccessBody = {
  paymentIntentId?: unknown;
};

// Keyed by the domain union so adding an access key fails typecheck here
// until it gets a display name.
const ONLINE_GROUP_ACCESS_LABELS: Record<OnlineGroupAccessKey, string> = {
  "inspiration-hub": "Inspiration Hub",
  "main-group": "Основной чат",
};

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
    keyPrefix: "admin:reissue-access",
    limit: 10,
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
    const body = await parseJsonBody<ReissueAccessBody>(request);
    const paymentIntentId =
      typeof body?.paymentIntentId === "string" ? body.paymentIntentId.trim() : "";

    if (!paymentIntentId) {
      return jsonNoStore({ errorCode: "invalid_request_body" }, { status: 400 });
    }

    const paymentRecord = await findPaymentRecordByIntentIdFromDatabase(paymentIntentId);

    if (!paymentRecord) {
      return jsonNoStore({ errorCode: "purchase_not_found" }, { status: 404 });
    }

    // The ensure helpers return an empty result for unpaid purchases; refusing
    // here keeps the admin from reading that as a Telegram failure.
    if (paymentRecord.outcome !== "succeeded") {
      return jsonNoStore({ errorCode: "purchase_not_succeeded" }, { status: 409 });
    }

    const onlineGroupAccess = await ensureOnlineGroupAccessForPayment(paymentRecord);

    if (onlineGroupAccess) {
      const links = onlineGroupAccess
        .filter((access) => access.accessUrl)
        .map((access) => ({
          accessKey: access.accessKey,
          accessUrl: access.accessUrl,
          label: ONLINE_GROUP_ACCESS_LABELS[access.accessKey] ?? access.accessKey,
          tokenExpiresAt: access.tokenExpiresAt,
        }));
      const status =
        links.length === 0
          ? "no_links"
          : links.length < onlineGroupAccess.length
            ? "partial"
            : "ready";

      return jsonNoStore({ links, status });
    }

    if (
      paymentRecord.access_workflow.trim() === "manual-admin" ||
      !isOfferEligibleForTelegramAccessLink(paymentRecord.offer_id)
    ) {
      return jsonNoStore({ links: [], status: "not_applicable" });
    }

    const accessLink = await ensureTelegramAccessLinkForPayment(paymentRecord);

    if (accessLink.status !== "ready") {
      return jsonNoStore({ links: [], status: "no_links" });
    }

    return jsonNoStore({
      links: [
        {
          accessKey: "primary",
          accessUrl: accessLink.accessUrl,
          label: "Ссылка на доступ",
          tokenExpiresAt: accessLink.tokenExpiresAt,
        },
      ],
      status: "ready",
    });
  } catch (error) {
    console.error("Failed to reissue access links from admin", error);
    return jsonNoStore({ errorCode: "reissue_access_failed" }, { status: 500 });
  }
}
