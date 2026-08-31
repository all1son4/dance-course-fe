import { runStripeBackgroundJobs } from "@/app/api/stripe/webhook/_lib/background-jobs";
import { getStripeWriteRuntime } from "@/app/api/stripe/webhook/_lib/write-runtime";
import { getDomainPersistenceMode } from "@/db/domain-persistence";
import { runBusinessOperationOutboxJobs } from "@/lib/business-operation-outbox";
import { jsonNoStore } from "@/lib/http-security";
import {
  generateAndDeliverMonthlySalesReport,
  getScheduledMonthlySalesReportPeriod,
  toMonthlySalesReportDeliveryResponse,
} from "@/lib/monthly-sales-report";
import { runSheetsExportOutboxJobs } from "@/lib/sheets-export-outbox";
import { revokeExpiredTelegramChannelAccess } from "@/lib/telegram/access";
import { revokeExpiredOnlineGroupHubAccess } from "@/lib/telegram/online-group-access";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  let businessJobsError: string | null = null;
  let businessJobsResult: Awaited<
    ReturnType<typeof runBusinessOperationOutboxJobs>
  > | null = null;
  let monthlySalesReportResult: ReturnType<
    typeof toMonthlySalesReportDeliveryResponse
  > | null = null;
  let monthlySalesReportError: string | null = null;
  let paymentJobsError: string | null = null;
  let paymentJobsResult: Awaited<ReturnType<typeof runStripeBackgroundJobs>> | null =
    null;
  let sheetsExportError: string | null = null;
  let sheetsExportResult: Awaited<ReturnType<typeof runSheetsExportOutboxJobs>> | null =
    null;

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

  const scheduledMonthlySalesReportPeriod = getScheduledMonthlySalesReportPeriod(now);

  if (scheduledMonthlySalesReportPeriod) {
    try {
      const result = await generateAndDeliverMonthlySalesReport({
        referenceDate: now,
        reportMonth: scheduledMonthlySalesReportPeriod.month,
      });

      monthlySalesReportResult = toMonthlySalesReportDeliveryResponse(result);
    } catch (error) {
      console.error("Daily maintenance: failed to generate monthly sales report", error);
      monthlySalesReportError =
        error instanceof Error ? error.message : "monthly_sales_report_failed";
    }
  }

  try {
    if (getDomainPersistenceMode("businessOperations") === "database") {
      businessJobsResult = await runBusinessOperationOutboxJobs();
    }
  } catch (error) {
    console.error("Daily maintenance: business outbox recovery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    businessJobsError = "business_outbox_recovery_failed";
  }

  // Payment recovery runs after the established maintenance journeys, so a queue or
  // provider slowdown cannot prevent access revocation or the monthly report.
  try {
    if (getStripeWriteRuntime() === "database") {
      paymentJobsResult = await runStripeBackgroundJobs({
        inboxLimit: 8,
        outboxLimit: 16,
      });
    }
  } catch (error) {
    console.error("Daily maintenance: Stripe background recovery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    paymentJobsError = "stripe_background_recovery_failed";
  }

  // Sheets is an optional one-way sink. Its queue is recovered independently from
  // Stripe so admin-created exports do not require Stripe mode or credentials.
  try {
    sheetsExportResult = await runSheetsExportOutboxJobs();
  } catch (error) {
    console.error("Daily maintenance: Sheets export recovery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    sheetsExportError = "sheets_export_recovery_failed";
  }

  const hasFailure = Boolean(
    accessRevocationError ||
    businessJobsError ||
    monthlySalesReportError ||
    paymentJobsError,
  );

  return jsonNoStore(
    {
      accessRevocationError,
      accessRevocationResult,
      businessJobsError,
      businessJobsResult,
      monthlySalesReportError,
      monthlySalesReportResult,
      paymentJobsError,
      paymentJobsResult,
      sheetsExportError,
      sheetsExportResult,
      ok: !hasFailure,
    },
    { status: hasFailure ? 500 : 200 },
  );
}
