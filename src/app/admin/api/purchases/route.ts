import { getAdminPurchasesOverview, listAdminSalesMonths } from "@/db/admin-sales";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import { jsonNoStore } from "@/lib/http-security";
import {
  formatReportMonthLabel,
  getUtcMonthValue,
  parseReportMonth,
} from "@/lib/monthly-sales-report";

export const runtime = "nodejs";

const MAX_SEARCH_LENGTH = 120;

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore({ errorCode: "unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const monthParam = url.searchParams.get("month")?.trim() ?? "";
    const searchQuery = (url.searchParams.get("search")?.trim() ?? "").slice(
      0,
      MAX_SEARCH_LENGTH,
    );
    const currentMonthValue = getUtcMonthValue(new Date());
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
    console.error("Failed to load admin purchases overview", error);
    return jsonNoStore({ errorCode: "purchases_overview_failed" }, { status: 500 });
  }
}
