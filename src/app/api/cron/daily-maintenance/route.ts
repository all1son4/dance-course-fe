import { runStripeBackgroundJobs } from "@/app/api/stripe/webhook/_lib/background-jobs";
import { deleteOldOperationalEvents } from "@/db/operational-events";
import { countOutstandingPolishTerminalSales } from "@/db/polish-terminal-sales";
import { eraseSpentTelegramAccessTokenValues } from "@/db/telegram-access-token-records";
import {
  enqueuePolishTerminalReminder,
  runBusinessOperationOutboxJobs,
} from "@/lib/business-operation-outbox";
import { enqueueDueChoreoAccessReminders } from "@/lib/choreo-access-reminder-delivery";
import {
  areEqualInTimingSafeWay,
  jsonErrorNoStore,
  jsonNoStore,
} from "@/lib/http-security";
import { enqueueDueHubExpiryReminders } from "@/lib/hub-expiry-reminder-delivery";
import { enqueueStartedHubPeriodInvites } from "@/lib/hub-period-start-invite-delivery";
import {
  generateAndDeliverMonthlySalesReport,
  getScheduledMonthlySalesReportPeriod,
  toMonthlySalesReportDeliveryResponse,
} from "@/lib/monthly-sales-report";
import { enqueueDueCohortGraceReminders } from "@/lib/online-group/cohort-admin";
import { getScheduledPolishTerminalReminderPeriod } from "@/lib/polish-terminal-sales";
import { logSafeError } from "@/lib/safe-error-log";
import { revokeExpiredTelegramChannelAccess } from "@/lib/telegram/channel-access-expiry";
import { revokeExpiredOnlineGroupHubAccess } from "@/lib/telegram/online-group-hub-expiry";

export const runtime = "nodejs";
export const maxDuration = 300;

const isAuthorizedCronRequest = (request: Request) => {
  const configuredSecret = process.env.CRON_SECRET?.trim() ?? "";
  const isProduction = process.env.NODE_ENV === "production";

  if (!configuredSecret) {
    return !isProduction;
  }

  const receivedAuthorization = request.headers.get("authorization")?.trim() ?? "";

  return areEqualInTimingSafeWay(receivedAuthorization, `Bearer ${configuredSecret}`);
};

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  const now = new Date();
  let accessRevocationResult: {
    onlineGroup: Awaited<ReturnType<typeof revokeExpiredOnlineGroupHubAccess>>;
    standard: Awaited<ReturnType<typeof revokeExpiredTelegramChannelAccess>>;
  } | null = null;
  let accessRevocationError: string | null = null;
  let choreoRemindersResult: Awaited<
    ReturnType<typeof enqueueDueChoreoAccessReminders>
  > | null = null;
  let choreoRemindersError: string | null = null;
  let hubStartInvitesResult: Awaited<
    ReturnType<typeof enqueueStartedHubPeriodInvites>
  > | null = null;
  let hubStartInvitesError: string | null = null;
  let hubRemindersResult: Awaited<
    ReturnType<typeof enqueueDueHubExpiryReminders>
  > | null = null;
  let hubRemindersError: string | null = null;
  let cohortRemindersResult: Awaited<
    ReturnType<typeof enqueueDueCohortGraceReminders>
  > | null = null;
  let cohortRemindersError: string | null = null;
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
  let polishTerminalReminderError: string | null = null;
  let spentInviteLinksError: string | null = null;
  let spentInviteLinksResult: Awaited<
    ReturnType<typeof eraseSpentTelegramAccessTokenValues>
  > | null = null;
  let polishTerminalReminderResult: {
    outstandingCount: number;
    status: "duplicate" | "empty" | "enqueued";
  } | null = null;

  try {
    const [standard, onlineGroup] = await Promise.all([
      revokeExpiredTelegramChannelAccess(),
      revokeExpiredOnlineGroupHubAccess(),
    ]);
    accessRevocationResult = { onlineGroup, standard };
  } catch (error) {
    logSafeError("Daily maintenance: failed to revoke expired Telegram access", error);
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
      logSafeError("Daily maintenance: failed to generate monthly sales report", error);
      monthlySalesReportError =
        error instanceof Error ? error.message : "monthly_sales_report_failed";
    }
  }

  const polishTerminalReminderPeriod = getScheduledPolishTerminalReminderPeriod(now);

  if (polishTerminalReminderPeriod) {
    try {
      const outstandingCount = await countOutstandingPolishTerminalSales(
        polishTerminalReminderPeriod.monthValue,
      );

      if (outstandingCount === 0) {
        polishTerminalReminderResult = { outstandingCount, status: "empty" };
      } else {
        const enqueued = await enqueuePolishTerminalReminder({
          deduplicationKey: `polish_terminal_reminder:${polishTerminalReminderPeriod.monthValue}`,
          monthValue: polishTerminalReminderPeriod.monthValue,
        });

        polishTerminalReminderResult = {
          outstandingCount,
          status: enqueued.duplicate ? "duplicate" : "enqueued",
        };
      }
    } catch (error) {
      logSafeError(
        "Daily maintenance: failed to schedule Polish terminal reminder",
        error,
      );
      polishTerminalReminderError = "polish_terminal_reminder_failed";
    }
  }

  try {
    choreoRemindersResult = await enqueueDueChoreoAccessReminders(now);
  } catch (error) {
    logSafeError(
      "Daily maintenance: failed to schedule choreography access reminders",
      error,
    );
    choreoRemindersError = "choreo_access_reminders_failed";
  }

  // HUB-D37: invites for paid Hub periods that began today; the business outbox run
  // below creates and mails them.
  try {
    hubStartInvitesResult = await enqueueStartedHubPeriodInvites(now);
  } catch (error) {
    logSafeError("Daily maintenance: failed to schedule Hub start invites", error);
    hubStartInvitesError = "hub_start_invites_failed";
  }

  // HUB-06: emails 7 and 3 days before a self-paid Hub ends.
  try {
    hubRemindersResult = await enqueueDueHubExpiryReminders(now);
  } catch (error) {
    logSafeError("Daily maintenance: failed to schedule Hub reminders", error);
    hubRemindersError = "hub_reminders_failed";
  }

  // HUB-D29: the bot's reminder in a closed cohort's chat a day before the Plus Hub ends.
  try {
    cohortRemindersResult = await enqueueDueCohortGraceReminders(now);
  } catch (error) {
    logSafeError("Daily maintenance: failed to schedule cohort reminders", error);
    cohortRemindersError = "cohort_reminders_failed";
  }

  try {
    businessJobsResult = await runBusinessOperationOutboxJobs({
      limit: 100,
      timeBudgetMs: 90_000,
    });
  } catch (error) {
    logSafeError("Daily maintenance: business outbox recovery failed", error);
    businessJobsError = "business_outbox_recovery_failed";
  }

  // Payment recovery runs after the established maintenance journeys, so a queue or
  // provider slowdown cannot prevent access revocation or the monthly report.
  try {
    paymentJobsResult = await runStripeBackgroundJobs({
      inboxLimit: 8,
      outboxLimit: 16,
    });
  } catch (error) {
    logSafeError("Daily maintenance: Stripe background recovery failed", error);
    paymentJobsError = "stripe_background_recovery_failed";
  }

  // HARD-03: after revocation, which may still need an issued link, erase the
  // clear links that can no longer be used.
  try {
    spentInviteLinksResult = await eraseSpentTelegramAccessTokenValues(now);
  } catch (error) {
    logSafeError("Daily maintenance: failed to erase spent invite links", error);
    spentInviteLinksError = "erase_spent_invite_links_failed";
  }

  // The event log keeps 90 days; older groups go.
  let oldEventsError: string | null = null;
  let oldEventsDeleted: number | null = null;
  try {
    oldEventsDeleted = await deleteOldOperationalEvents(now);
  } catch (error) {
    logSafeError("Daily maintenance: failed to delete old operational events", error);
    oldEventsError = "delete_old_operational_events_failed";
  }

  const hasFailure = Boolean(
    accessRevocationError ||
    choreoRemindersError ||
    hubStartInvitesError ||
    hubRemindersError ||
    cohortRemindersError ||
    businessJobsError ||
    monthlySalesReportError ||
    polishTerminalReminderError ||
    paymentJobsError ||
    spentInviteLinksError ||
    oldEventsError,
  );

  return jsonNoStore(
    {
      accessRevocationError,
      accessRevocationResult,
      choreoRemindersError,
      choreoRemindersResult,
      hubStartInvitesError,
      hubStartInvitesResult,
      hubRemindersError,
      hubRemindersResult,
      cohortRemindersError,
      cohortRemindersResult,
      businessJobsError,
      businessJobsResult,
      monthlySalesReportError,
      monthlySalesReportResult,
      paymentJobsError,
      paymentJobsResult,
      spentInviteLinksError,
      spentInviteLinksResult,
      oldEventsError,
      oldEventsDeleted,
      polishTerminalReminderError,
      polishTerminalReminderResult,
      ok: !hasFailure,
    },
    { status: hasFailure ? 500 : 200 },
  );
}
