import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { retryCohortClosurePost } from "@/lib/online-group/cohort-admin";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2 * 1024;

/** "Повторить" for a closure post the bot could not publish (HUB-D29). */
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
    keyPrefix: "admin:online-group-cohort-post-retry",
    limit: 10,
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
    const { body, errorResponse } = await parseJsonBody<{ cohortId?: unknown }>(
      request,
      MAX_BODY_BYTES,
    );
    if (errorResponse) return errorResponse;

    const cohortId = typeof body?.cohortId === "string" ? body.cohortId.trim() : "";
    if (!cohortId) return jsonErrorNoStore("invalid_request_body", { status: 400 });

    return jsonNoStore(await retryCohortClosurePost(cohortId));
  } catch (error) {
    logSafeError("Failed to retry a cohort closure post", error);
    return jsonErrorNoStore("cohort_post_retry_failed", { status: 500 });
  }
}
