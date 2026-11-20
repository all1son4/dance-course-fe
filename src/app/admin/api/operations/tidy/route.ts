import { dismissDeadLetter } from "@/db/admin-operations";
import { archiveOperationalEventGroup } from "@/db/operational-events";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4 * 1024;

type TidyBody = {
  action?: unknown;
  area?: unknown;
  code?: unknown;
  event?: unknown;
  key?: unknown;
  queue?: unknown;
};

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : null;

/**
 * Tidying «Система»: «Убрать» hides an event group of the journal until it happens
 * again; «Решено» takes a dead letter out of the alerts. Nothing is deleted.
 */
export async function POST(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  const requestError = getBrowserJsonRequestErrorResponse(request, MAX_BODY_BYTES);
  if (requestError) return requestError;

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:operations-tidy",
    limit: 30,
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
    const { body, errorResponse } = await parseJsonBody<TidyBody>(
      request,
      MAX_BODY_BYTES,
    );
    if (errorResponse) return errorResponse;

    if (body?.action === "archive_event") {
      const area = text(body.area, 20);
      const event = text(body.event, 200);
      const code = text(body.code, 120);
      if (!area || !event || code === null) {
        return jsonErrorNoStore("invalid_request_body", { status: 400 });
      }
      const archived = await archiveOperationalEventGroup({ area, code, event });
      return jsonNoStore({ status: archived > 0 ? "archived" : "not_found" });
    }

    if (body?.action === "dismiss_dead_letter") {
      const queue = body.queue === "inbox" || body.queue === "outbox" ? body.queue : null;
      const key = text(body.key, 300)?.trim();
      if (!queue || !key)
        return jsonErrorNoStore("invalid_request_body", { status: 400 });
      const dismissed = await dismissDeadLetter({ key, queue });
      return jsonNoStore({ status: dismissed ? "dismissed" : "not_found" });
    }

    return jsonErrorNoStore("invalid_action", { status: 400 });
  } catch (error) {
    logSafeError("Failed to tidy the system journal", error);
    return jsonErrorNoStore("operations_tidy_failed", { status: 500 });
  }
}
