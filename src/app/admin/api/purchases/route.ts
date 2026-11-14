import { getAdminPurchasesOverview, listAdminSalesMonths } from "@/db/admin-sales";
import { setPolishSaleTerminalRecorded } from "@/db/polish-terminal-sales";
import { getAccountingMonthValue } from "@/lib/accounting-month";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { formatReportMonthLabel, parseReportMonth } from "@/lib/monthly-sales-report";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";

export const runtime = "nodejs";

const MAX_SEARCH_LENGTH = 120;
const MAX_BODY_BYTES = 4 * 1024;

type SetTerminalRecordedBody = {
  paymentIntentId?: unknown;
  terminalRecorded?: unknown;
};

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const monthParam = url.searchParams.get("month")?.trim() ?? "";
    const searchQuery = (url.searchParams.get("search")?.trim() ?? "").slice(
      0,
      MAX_SEARCH_LENGTH,
    );
    const currentMonthValue = getAccountingMonthValue(new Date());
    // Same validation the report pipeline applies: syntactically a month and
    // not in the future; anything else falls back to the current month.
    const monthValue =
      parseReportMonth(monthParam) && monthParam <= currentMonthValue
        ? monthParam
        : currentMonthValue;

    const [overview, saleMonthValues] = await Promise.all([
      getAdminPurchasesOverview({ monthValue, searchQuery }),
      listAdminSalesMonths(),
    ]);

    // The current month is always selectable so the summary works before the
    // first sale of the month lands.
    const monthValues = saleMonthValues.includes(currentMonthValue)
      ? saleMonthValues
      : [currentMonthValue, ...saleMonthValues];
    const months = monthValues.map((value) => ({
      label: formatReportMonthLabel(value),
      value,
    }));

    return jsonNoStore({
      months,
      previousSummary: overview.previousSummary,
      products: overview.products,
      purchases: overview.purchases,
      summary: overview.summary,
    });
  } catch (error) {
    logSafeError("Failed to load admin purchases overview", error);
    return jsonErrorNoStore("purchases_overview_failed", { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:polish-terminal-sales",
    limit: 60,
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
    const { body, errorResponse: bodyErrorResponse } =
      await parseJsonBody<SetTerminalRecordedBody>(request, MAX_BODY_BYTES);

    if (bodyErrorResponse) {
      return bodyErrorResponse;
    }
    const paymentIntentId =
      typeof body?.paymentIntentId === "string" ? body.paymentIntentId.trim() : "";

    if (!paymentIntentId || typeof body?.terminalRecorded !== "boolean") {
      return jsonErrorNoStore("invalid_request_body", { status: 400 });
    }

    const updated = await setPolishSaleTerminalRecorded({
      paymentIntentId,
      terminalRecorded: body.terminalRecorded,
    });

    if (!updated) {
      return jsonErrorNoStore("polish_sale_not_eligible", { status: 409 });
    }

    return jsonNoStore({
      paymentIntentId: updated.paymentIntentId,
      terminalRecordedAtIso: updated.terminalRecordedAt?.toISOString() ?? "",
    });
  } catch (error) {
    logSafeError("Failed to update Polish terminal sale state", error);
    return jsonErrorNoStore("polish_terminal_update_failed", { status: 500 });
  }
}
