import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import {
  closeCohortFromAdmin,
  getCohortsOverview,
} from "@/lib/online-group/cohort-admin";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";

export const runtime = "nodejs";

// The post text is the largest field: a few hundred characters of Telegram text.
const MAX_BODY_BYTES = 16 * 1024;
const MAX_POST_LENGTH = 4096;

type CloseCohortBody = {
  cohortId?: unknown;
  confirmationTitle?: unknown;
  lessonsCleared?: unknown;
  openNextCohortSales?: unknown;
  post?: { pin?: unknown; text?: unknown } | null;
};

// Rule refusals of the closure service the window explains to the admin.
const CLIENT_ERRORS = new Set([
  "cohort_closure_before_start",
  "cohort_closure_lessons_not_cleared",
  "cohort_closure_next_cohort_missing",
  "cohort_closure_not_found",
  "cohort_closure_title_mismatch",
]);

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  try {
    return jsonNoStore({ cohorts: await getCohortsOverview() });
  } catch (error) {
    logSafeError("Failed to load Online Group cohorts", error);
    return jsonErrorNoStore("cohorts_unavailable", { status: 500 });
  }
}

/** The "Закрыть поток" window (section 6.2, HUB-D19, D20, D27, D29). */
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
    keyPrefix: "admin:online-group-cohort-close",
    limit: 5,
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
    const { body, errorResponse } = await parseJsonBody<CloseCohortBody>(
      request,
      MAX_BODY_BYTES,
    );
    if (errorResponse) return errorResponse;

    const cohortId = typeof body?.cohortId === "string" ? body.cohortId.trim() : "";
    const confirmationTitle =
      typeof body?.confirmationTitle === "string" ? body.confirmationTitle : "";
    const postText = typeof body?.post?.text === "string" ? body.post.text.trim() : "";

    if (
      !cohortId ||
      typeof body?.lessonsCleared !== "boolean" ||
      typeof body?.openNextCohortSales !== "boolean" ||
      postText.length > MAX_POST_LENGTH
    ) {
      return jsonErrorNoStore("invalid_request_body", { status: 400 });
    }

    const result = await closeCohortFromAdmin({
      cohortId,
      confirmationTitle,
      lessonsCleared: body.lessonsCleared,
      openNextCohortSales: body.openNextCohortSales,
      post: postText ? { pin: body.post?.pin === true, text: postText } : null,
    });

    return jsonNoStore({ result, status: "closed" });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "";
    if (CLIENT_ERRORS.has(errorCode)) {
      return jsonNoStore({ errorCode }, { status: 409 });
    }
    logSafeError("Failed to close an Online Group cohort", error);
    return jsonErrorNoStore("cohort_close_failed", { status: 500 });
  }
}
