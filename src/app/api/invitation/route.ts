import {
  confirmAccessInvitation,
  retryInvitationLinks,
} from "@/lib/access-invitations/service";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";
import { isTelegramLoginConfigured } from "@/lib/telegram/login";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 16 * 1024;

type InvitationConfirmBody = {
  /** "links": the retry of a failed or expired link after the check. */
  action?: string;
  idToken?: string;
  nonce?: string;
  token?: string;
};

const ERROR_STATUS = {
  expired: 410,
  invalid: 404,
  invalid_telegram_login_nonce: 403,
  needs_telegram: 409,
  other_account: 409,
  revoked: 410,
  telegram_login_failed: 403,
} as const;

/**
 * The Telegram check of a renewal invitation (the page `/invitation`): the same
 * limits as the renewal check of the payment page.
 */
export async function POST(request: Request) {
  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "invitation:confirm",
    limit: 60,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonErrorNoStore("rate_limited", {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      status: 429,
    });
  }

  if (!isTelegramLoginConfigured()) {
    return jsonErrorNoStore("telegram_login_not_configured", { status: 500 });
  }

  try {
    const { body, errorResponse } = await parseJsonBody<InvitationConfirmBody>(
      request,
      MAX_BODY_BYTES,
    );

    if (errorResponse) {
      return errorResponse;
    }

    const token = body?.token?.trim().slice(0, 300) ?? "";
    const idToken = body?.idToken?.trim() ?? "";

    if (body?.action === "links") {
      const retry = await retryInvitationLinks(token);
      return retry.status === "error"
        ? jsonErrorNoStore(retry.errorCode, { status: ERROR_STATUS[retry.errorCode] })
        : jsonNoStore(retry);
    }
    const nonce = body?.nonce?.trim().slice(0, 160) ?? "";

    if (!token || !idToken) {
      return jsonErrorNoStore("invalid_request_body", { status: 400 });
    }

    const result = await confirmAccessInvitation({ idToken, nonce, token });

    if (result.status === "error") {
      return jsonErrorNoStore(result.errorCode, {
        status: ERROR_STATUS[result.errorCode],
      });
    }

    return jsonNoStore(result);
  } catch (error) {
    logSafeError("Failed to confirm an access invitation", error);

    return jsonErrorNoStore("invitation_confirm_failed", { status: 500 });
  }
}
