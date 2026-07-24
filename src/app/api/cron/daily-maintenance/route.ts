import { jsonNoStore } from "@/lib/http-security";
import {
  generateAndDeliverMonthlySalesReport,
  isLastDayOfMonthUtc,
  toMonthlySalesReportDeliveryResponse,
} from "@/lib/monthly-sales-report";
import { revokeExpiredTelegramChannelAccess } from "@/lib/telegram/access";
import { revokeExpiredOnlineGroupHubAccess } from "@/lib/telegram/online-group-access";

export const runtime = "nodejs";

const isAuthorizedCronRequest = (request: Request) => {
  const configuredSecret = process.env.CRON_SECRET?.trim() ?? "";
  const isProduction = process.env.NODE_ENV === "production";

  if (!configuredSecret) {
    return !isProduction;
  }

  const receivedAuthorization = request.headers.get("authorization")?.trim() ?? "";

  return receivedAuthorization === `Bearer ${configuredSecret}`;
};

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return jsonNoStore(
      {
        errorCode: "unauthorized",
      },
      { status: 401 },
    );
  }

  const now = new Date();
  let accessRevocationResult: {
    onlineGroup: Awaited<ReturnType<typeof revokeExpiredOnlineGroupHubAccess>>;
    standard: Awaited<ReturnType<typeof revokeExpiredTelegramChannelAccess>>;
  } | null = null;
  let accessRevocationError: string | null = null;
  let monthlySalesReportResult: ReturnType<
    typeof toMonthlySalesReportDeliveryResponse
  > | null = null;
  let monthlySalesReportError: string | null = null;

  try {
    const [standard, onlineGroup] = await Promise.all([
      revokeExpiredTelegramChannelAccess(),
      revokeExpiredOnlineGroupHubAccess(),
    ]);
    accessRevocationResult = { onlineGroup, standard };
  } catch (error) {
    console.error("Daily maintenance: failed to revoke expired Telegram access", error);
    accessRevocationError =
      error instanceof Error ? error.message : "revoke_expired_access_failed";
  }

  if (isLastDayOfMonthUtc(now)) {
    try {
      const result = await generateAndDeliverMonthlySalesReport({
        referenceDate: now,
      });

      monthlySalesReportResult = toMonthlySalesReportDeliveryResponse(result);
    } catch (error) {
      console.error("Daily maintenance: failed to generate monthly sales report", error);
      monthlySalesReportError =
        error instanceof Error ? error.message : "monthly_sales_report_failed";
    }
  }

  const hasFailure = Boolean(accessRevocationError || monthlySalesReportError);

  return jsonNoStore(
    {
      accessRevocationError,
      accessRevocationResult,
      monthlySalesReportError,
      monthlySalesReportResult,
      ok: !hasFailure,
    },
    { status: hasFailure ? 500 : 200 },
  );
}
