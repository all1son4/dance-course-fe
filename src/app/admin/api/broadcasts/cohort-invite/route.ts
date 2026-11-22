import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  checkCohortInviteList,
  excludeCohortInviteAddress,
  getCohortInviteAdminSnapshot,
  sendCohortInviteBatch,
  sendCohortInviteList,
  sendCohortInviteTest,
} from "@/lib/cohort-invite-broadcast";
import { isValidEmailCampaignEmail } from "@/lib/email-campaigns";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
  rateLimitErrorResponse,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";

/*
 * «Приглашение в поток» in the «Рассылки» tab: GET reads the live audience,
 * POST sends a batch, a test or a typed list (or only checks the list), PATCH
 * excludes one address.
 */

export const runtime = "nodejs";
// A batch of 15 with a pause between sends takes about 15 seconds.
export const maxDuration = 60;

// Room for a typed list of up to 50 addresses.
const MAX_BODY_BYTES = 16 * 1024;

const rateLimited = async ({
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
    onBackendUnavailable: "deny",
    request,
    windowMs: 60_000,
  });

  return rateLimitErrorResponse(rateLimit);
};

const BATCH_ERROR_STATUS: Record<string, number> = {
  batch_in_progress: 409,
  batch_size_invalid: 400,
  daily_limit_reached: 409,
  no_cohort_on_sale: 409,
  no_recipients: 409,
  over_limit: 409,
  sales_closed: 409,
  sales_state_unavailable: 503,
  too_many_addresses: 400,
  unsubscribe_not_configured: 503,
};

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  const limited = await rateLimited({
    keyPrefix: "admin:cohort-invite:read",
    limit: 60,
    request,
  });
  if (limited) return limited;

  try {
    return jsonNoStore({ snapshot: await getCohortInviteAdminSnapshot() });
  } catch (error) {
    logSafeError("Failed to load the cohort invite broadcast", error);
    return jsonErrorNoStore("cohort_invite_load_failed", { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  const requestError = getBrowserJsonRequestErrorResponse(request, MAX_BODY_BYTES);
  if (requestError) return requestError;

  const limited = await rateLimited({
    keyPrefix: "admin:cohort-invite:send",
    limit: 10,
    request,
  });
  if (limited) return limited;

  const { body, errorResponse } = await parseJsonBody<{
    action?: string;
    addresses?: string;
    email?: string;
    links?: string;
    locale?: string;
    size?: unknown;
  }>(request, MAX_BODY_BYTES);
  if (errorResponse) return errorResponse;

  try {
    if (body?.action === "batch") {
      const outcome = await sendCohortInviteBatch(body.size);

      return outcome.ok
        ? jsonNoStore({ result: outcome.result, snapshot: outcome.snapshot })
        : jsonErrorNoStore(outcome.error, {
            status: BATCH_ERROR_STATUS[outcome.error] ?? 409,
          });
    }

    if (body?.action === "check" || body?.action === "list") {
      const addresses = typeof body.addresses === "string" ? body.addresses : "";
      const outcome =
        body.action === "check"
          ? await checkCohortInviteList(addresses)
          : await sendCohortInviteList(addresses);

      return outcome.ok
        ? jsonNoStore(outcome)
        : jsonErrorNoStore(outcome.error, {
            status: BATCH_ERROR_STATUS[outcome.error] ?? 409,
          });
    }

    if (body?.action === "test") {
      const email = body.email?.trim() ?? "";
      const locale = body.locale === "ru" || body.locale === "pl" ? body.locale : "en";
      const links = body.links === "renewal" ? "renewal" : "pages";

      if (!isValidEmailCampaignEmail(email)) {
        return jsonErrorNoStore("invalid_email", { status: 400 });
      }

      const outcome = await sendCohortInviteTest({ email, links, locale });

      return outcome.ok
        ? jsonNoStore({ test: { email, locale } })
        : jsonErrorNoStore(outcome.error, { status: 409 });
    }

    return jsonErrorNoStore("invalid_request_body", { status: 400 });
  } catch (error) {
    logSafeError("Failed to send the cohort invite broadcast", error);
    return jsonErrorNoStore("cohort_invite_send_failed", { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  const requestError = getBrowserJsonRequestErrorResponse(request, MAX_BODY_BYTES);
  if (requestError) return requestError;

  const limited = await rateLimited({
    keyPrefix: "admin:cohort-invite:exclude",
    limit: 40,
    request,
  });
  if (limited) return limited;

  const { body, errorResponse } = await parseJsonBody<{ email?: string; scope?: string }>(
    request,
    MAX_BODY_BYTES,
  );
  if (errorResponse) return errorResponse;

  const email = body?.email?.trim() ?? "";
  const scope =
    body?.scope === "global" ? "global" : body?.scope === "campaign" ? "campaign" : null;

  if (!scope || !isValidEmailCampaignEmail(email)) {
    return jsonErrorNoStore("invalid_request_body", { status: 400 });
  }

  try {
    const result = await excludeCohortInviteAddress({ email, scope });

    if (result.status !== "held") {
      return jsonErrorNoStore(result.status, { status: 409 });
    }

    return jsonNoStore({ snapshot: await getCohortInviteAdminSnapshot() });
  } catch (error) {
    logSafeError("Failed to exclude a cohort invite address", error);
    return jsonErrorNoStore("cohort_invite_exclusion_failed", { status: 500 });
  }
}
