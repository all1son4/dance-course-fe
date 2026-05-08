import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import { isTrustedBrowserOrigin, jsonNoStore } from "@/lib/http-security";
import {
  generateAndDeliverMonthlySalesReport,
  listAvailableMonthlySalesReportMonths,
  toMonthlySalesReportDeliveryResponse,
} from "@/lib/monthly-sales-report";

export const runtime = "nodejs";

type MonthlySalesReportRequestBody = {
  reportMonth?: unknown;
};

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore(
      {
        errorCode: "unauthorized",
      },
      { status: 401 },
    );
  }

  try {
    const months = await listAvailableMonthlySalesReportMonths();

    return jsonNoStore({
      months,
    });
  } catch (error) {
    console.error("Failed to load monthly sales report months", error);

    return jsonNoStore(
      {
        errorCode: "monthly_sales_report_months_failed",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore(
      {
        errorCode: "unauthorized",
      },
      { status: 401 },
    );
  }

  if (!isTrustedBrowserOrigin(request)) {
    return jsonNoStore(
      {
        errorCode: "invalid_origin",
      },
      { status: 403 },
    );
  }

  try {
    const body = (await request
      .json()
      .catch(() => ({}))) as MonthlySalesReportRequestBody;
    const reportMonth =
      typeof body.reportMonth === "string" ? body.reportMonth.trim() : undefined;
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
        error.message === "future_monthly_sales_report_month")
    ) {
      return jsonNoStore(
        {
          errorCode: error.message,
        },
        { status: 400 },
      );
    }

    console.error("Failed to generate monthly sales report from admin", error);

    return jsonNoStore(
      {
        errorCode: "monthly_sales_report_failed",
      },
      { status: 500 },
    );
  }
}
