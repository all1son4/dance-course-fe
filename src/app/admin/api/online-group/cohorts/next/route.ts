import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
  rateLimitErrorResponse,
} from "@/lib/http-security";
import { createNextCohortFromAdmin } from "@/lib/online-group/cohort-admin";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";

export const runtime = "nodejs";

// Refusals the «Завести следующий поток» form explains to the admin.
const CLIENT_ERRORS = new Set([
  "cohort_duration_invalid",
  "cohort_not_found",
  "next_cohort_chat_is_library",
  "next_cohort_chat_taken",
  "next_cohort_exists",
  "next_cohort_incomplete",
  "next_cohort_starts_too_early",
  "telegram_chat_not_registered",
]);

/** «Завести следующий поток»: records the cohort that follows a running one. */
export async function POST(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  const requestErrorResponse = getBrowserJsonRequestErrorResponse(request, 2048);
  if (requestErrorResponse) return requestErrorResponse;

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:online-group-next-cohort",
    limit: 10,
    onBackendUnavailable: "deny",
    request,
    windowMs: 60_000,
  });
  const rateLimitError = rateLimitErrorResponse(rateLimit);
  if (rateLimitError) return rateLimitError;

  try {
    const { body, errorResponse } = await parseJsonBody<{
      durationWeeks?: unknown;
      mainChatId?: unknown;
      previousCohortId?: unknown;
      startsAt?: unknown;
      title?: unknown;
    }>(request, 2048);
    if (errorResponse) return errorResponse;

    if (
      typeof body?.previousCohortId !== "string" ||
      typeof body.mainChatId !== "string" ||
      typeof body.title !== "string" ||
      typeof body.startsAt !== "string" ||
      typeof body.durationWeeks !== "number"
    ) {
      return jsonErrorNoStore("invalid_request_body", { status: 400 });
    }

    const cohort = await createNextCohortFromAdmin({
      durationWeeks: body.durationWeeks,
      mainChatId: body.mainChatId,
      previousCohortId: body.previousCohortId,
      startsAt: new Date(body.startsAt),
      title: body.title,
    });
    return jsonNoStore({ cohort, status: "created" });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "";
    if (CLIENT_ERRORS.has(errorCode)) {
      return jsonErrorNoStore(errorCode, { status: 409 });
    }
    logSafeError("Failed to create the next cohort", error);
    return jsonErrorNoStore("next_cohort_create_failed", { status: 500 });
  }
}
