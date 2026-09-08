import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import { API_NO_STORE_HEADERS, jsonErrorNoStore, jsonNoStore } from "@/lib/http-security";
import { generateMonthlySalesReportCsvForMonth } from "@/lib/monthly-sales-report";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const reportMonth = url.searchParams.get("month")?.trim() ?? "";

    if (!reportMonth) {
      return jsonErrorNoStore("invalid_monthly_sales_report_month", {
        status: 400,
      });
    }

    const { csv, filename } = await generateMonthlySalesReportCsvForMonth({
      reportMonth,
    });

    // The BOM keeps Cyrillic headers readable when the CSV is opened in Excel.
    return new Response(`\uFEFF${csv}`, {
      headers: {
        ...API_NO_STORE_HEADERS,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "invalid_monthly_sales_report_month" ||
        error.message === "future_monthly_sales_report_month")
    ) {
      return jsonNoStore({ errorCode: error.message }, { status: 400 });
    }

    console.error("Failed to download monthly sales report from admin", error);
    return jsonErrorNoStore("monthly_sales_report_failed", { status: 500 });
  }
}
