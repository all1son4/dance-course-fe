import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  isTrustedBrowserOrigin,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import {
  generateAndDeliverMonthlySalesReport,
  toMonthlySalesReportDeliveryResponse,
} from "@/lib/monthly-sales-report";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";

export const runtime = "nodejs";
const MAX_REPORT_BODY_BYTES = 2 * 1024;

type MonthlySalesReportRequestBody = {
  reportMonth?: unknown;
};

export async function POST(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  if (!isTrustedBrowserOrigin(request)) {
    return jsonErrorNoStore("invalid_origin", { status: 403 });
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:monthly-sales-report:send",
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
    const { body, errorResponse } = await parseJsonBody<MonthlySalesReportRequestBody>(
      request,
      MAX_REPORT_BODY_BYTES,
    );

    if (errorResponse) {
      return errorResponse;
    }

    const reportMonth =
      typeof body?.reportMonth === "string" ? body.reportMonth.trim() : undefined;
    const result = await generateAndDeliverMonthlySalesReport({
      force: true,
      referenceDate: new Date(),
      reportMonth,
    });

    return jsonNoStore(toMonthlySalesReportDeliveryResponse(result));
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "invalid_monthly_sales_report_month" ||
        error.message === "future_monthly_sales_report_month" ||
        error.message === "monthly_sales_report_stripe_data_incomplete")
    ) {
      return jsonNoStore(
        {
          errorCode: error.message,
        },
        {
          status:
            error.message === "monthly_sales_report_stripe_data_incomplete" ? 409 : 400,
        },
      );
    }

    logSafeError("Failed to generate monthly sales report from admin", error);

    return jsonErrorNoStore("monthly_sales_report_failed", { status: 500 });
  }
}
