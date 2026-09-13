import { DEFAULT_SITE_HOME_URL } from "@/constants/links";
import {
  claimEmailCampaignLeadForDelivery,
  findMonthlyReportRunInDatabase,
  markEmailCampaignLeadFailed,
  markEmailCampaignLeadSent,
  recordMonthlyReportRunInDatabase,
} from "@/db/business-operation-jobs";
import { countOutstandingPolishTerminalSales } from "@/db/polish-terminal-sales";
import {
  type ClaimedOutboxJob,
  enqueueOutboxJob,
  processNextOutboxJob,
  processOutboxJobByDeduplicationKey,
  replayOutboxJob,
} from "@/db/transactional-outbox";
import { sendResendEmail, type SendResendEmailInput } from "@/lib/email/resend";
import { formatReportMonthLabel } from "@/lib/monthly-sales-report";
import { sendTelegramMessage } from "@/lib/telegram/bot-api";
import {
  getTelegramAlertsBotToken,
  getTelegramAlertsChatId,
  isTelegramAlertsConfigured,
} from "@/lib/telegram/config";

export const BUSINESS_OPERATION_OUTBOX_KINDS = [
  "monthly_report_delivery",
  "campaign_email_delivery",
  "polish_terminal_reminder",
] as const;

type MonthlyReportDeliveryPayload = {
  email: SendResendEmailInput;
  force: boolean;
  report: {
    csvSha256: string;
    deliveredAtUtc: string;
    deliveredTo: string;
    generatedAtUtc: string;
    periodEndUtc: string;
    periodStartUtc: string;
    reportFamily: string;
    reportKey: string;
    rowCount: number;
  };
};

type CampaignEmailDeliveryPayload = {
  campaignKey: string;
  email: SendResendEmailInput;
  leadId: string;
};

type PolishTerminalReminderPayload = {
  monthValue: string;
};

const SITE_HOME_URL =
  process.env.SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  DEFAULT_SITE_HOME_URL;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const requireString = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw Object.assign(new Error(`business_outbox_${field}_invalid`), {
      retryable: false,
    });
  }

  return value;
};

const requireDate = (value: unknown, field: string) => {
  const date = new Date(requireString(value, field));

  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error(`business_outbox_${field}_invalid`), {
      retryable: false,
    });
  }

  return date;
};

const createNonRetryableError = (message: string) =>
  Object.assign(new Error(message), { retryable: false });

const parseEmailPayload = (value: unknown): SendResendEmailInput => {
  if (!isRecord(value)) {
    throw Object.assign(new Error("business_outbox_email_invalid"), {
      retryable: false,
    });
  }

  const attachments = value.attachments;

  if (
    attachments !== undefined &&
    (!Array.isArray(attachments) ||
      attachments.some(
        (attachment) =>
          !isRecord(attachment) ||
          typeof attachment.content !== "string" ||
          typeof attachment.filename !== "string",
      ))
  ) {
    throw Object.assign(new Error("business_outbox_attachments_invalid"), {
      retryable: false,
    });
  }

  return {
    attachments: attachments as SendResendEmailInput["attachments"],
    html: requireString(value.html, "email_html"),
    subject: requireString(value.subject, "email_subject"),
    text: requireString(value.text, "email_text"),
    to: requireString(value.to, "email_recipient"),
  };
};

const parseCampaignEmailDeliveryPayload = (
  payload: Record<string, unknown>,
): CampaignEmailDeliveryPayload => ({
  campaignKey: requireString(payload.campaignKey, "campaign_key"),
  email: parseEmailPayload(payload.email),
  leadId: requireString(payload.leadId, "lead_id"),
});

const parseMonthlyReportDeliveryPayload = (
  payload: Record<string, unknown>,
): MonthlyReportDeliveryPayload => {
  if (!isRecord(payload.report)) {
    throw Object.assign(new Error("business_outbox_report_invalid"), {
      retryable: false,
    });
  }

  const rowCount = payload.report.rowCount;

  if (!Number.isInteger(rowCount) || Number(rowCount) <= 0) {
    throw Object.assign(new Error("business_outbox_report_row_count_invalid"), {
      retryable: false,
    });
  }

  return {
    email: parseEmailPayload(payload.email),
    force: payload.force === true,
    report: {
      csvSha256: requireString(payload.report.csvSha256, "report_sha256"),
      deliveredAtUtc: requireString(payload.report.deliveredAtUtc, "report_delivered_at"),
      deliveredTo: requireString(payload.report.deliveredTo, "report_recipient"),
      generatedAtUtc: requireString(payload.report.generatedAtUtc, "report_generated_at"),
      periodEndUtc: requireString(payload.report.periodEndUtc, "report_period_end"),
      periodStartUtc: requireString(payload.report.periodStartUtc, "report_period_start"),
      reportFamily: requireString(payload.report.reportFamily, "report_family"),
      reportKey: requireString(payload.report.reportKey, "report_key"),
      rowCount: Number(rowCount),
    },
  };
};

const parsePolishTerminalReminderPayload = (
  payload: Record<string, unknown>,
): PolishTerminalReminderPayload => {
  const monthValue = requireString(payload.monthValue, "terminal_reminder_month");

  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(monthValue)) {
    throw createNonRetryableError("business_outbox_terminal_reminder_month_invalid");
  }

  return { monthValue };
};

const deliverCampaignEmail = async (job: ClaimedOutboxJob) => {
  const payload = parseCampaignEmailDeliveryPayload(job.payload);

  if (job.recipient?.trim().toLowerCase() !== payload.email.to.trim().toLowerCase()) {
    throw createNonRetryableError("business_outbox_job_recipient_mismatch");
  }

  const claim = await claimEmailCampaignLeadForDelivery({
    campaignKey: payload.campaignKey,
    leadId: payload.leadId,
  });

  if (claim.status === "excluded") {
    return { skipped: true };
  }

  if (claim.status === "already_sent") {
    return {};
  }

  if (claim.lead.normalizedEmail !== payload.email.to.trim().toLowerCase()) {
    const error = createNonRetryableError("business_outbox_campaign_recipient_mismatch");

    await markEmailCampaignLeadFailed({
      error,
      leadId: payload.leadId,
    });
    throw error;
  }

  try {
    const result = await sendResendEmail({
      ...payload.email,
      idempotencyKey: `campaign-email/${job.deduplicationKey}`,
    });

    await markEmailCampaignLeadSent({ leadId: payload.leadId });

    return { externalMessageId: result.emailId };
  } catch (error) {
    await markEmailCampaignLeadFailed({
      error,
      leadId: payload.leadId,
    });
    throw error;
  }
};

const toMonthlyReportRunInput = (
  payload: MonthlyReportDeliveryPayload,
  deliveryStatus: "failed" | "sent",
) => ({
  csvSha256: payload.report.csvSha256,
  deliveredAtUtc:
    deliveryStatus === "sent"
      ? requireDate(payload.report.deliveredAtUtc, "report_delivered_at")
      : null,
  deliveredTo: payload.report.deliveredTo,
  deliveryStatus,
  generatedAtUtc: requireDate(payload.report.generatedAtUtc, "report_generated_at"),
  periodEndUtc: requireDate(payload.report.periodEndUtc, "report_period_end"),
  periodStartUtc: requireDate(payload.report.periodStartUtc, "report_period_start"),
  reportFamily: payload.report.reportFamily,
  reportKey: payload.report.reportKey,
  rowCount: payload.report.rowCount,
});

const deliverMonthlyReport = async (job: ClaimedOutboxJob) => {
  const payload = parseMonthlyReportDeliveryPayload(job.payload);
  const sentRun = toMonthlyReportRunInput(payload, "sent");
  const failedRun = toMonthlyReportRunInput(payload, "failed");
  const normalizedRecipient = payload.email.to.trim().toLowerCase();

  if (
    job.recipient?.trim().toLowerCase() !== normalizedRecipient ||
    payload.report.deliveredTo.trim().toLowerCase() !== normalizedRecipient
  ) {
    throw createNonRetryableError("business_outbox_report_recipient_mismatch");
  }

  if (!payload.force) {
    const existingRun = await findMonthlyReportRunInDatabase(payload.report.reportKey);

    if (
      existingRun?.deliveryStatus === "sent" &&
      existingRun.csvSha256 === payload.report.csvSha256
    ) {
      return {};
    }
  }

  try {
    const result = await sendResendEmail({
      ...payload.email,
      idempotencyKey: `monthly-report/${job.deduplicationKey}`,
    });

    await recordMonthlyReportRunInDatabase(sentRun);

    return { externalMessageId: result.emailId };
  } catch (error) {
    await recordMonthlyReportRunInDatabase(failedRun);
    throw error;
  }
};

const deliverPolishTerminalReminder = async (job: ClaimedOutboxJob) => {
  const { monthValue } = parsePolishTerminalReminderPayload(job.payload);
  const outstandingCount = await countOutstandingPolishTerminalSales(monthValue);

  // The operator may clear the final checkbox after enqueue but before delivery.
  // Re-read here so a stale queued job never sends a false reminder.
  if (outstandingCount === 0) {
    return { skipped: true };
  }

  if (!isTelegramAlertsConfigured()) {
    throw new Error("telegram_alerts_not_configured");
  }

  const botToken = getTelegramAlertsBotToken();
  const chatId = getTelegramAlertsChatId();

  if (!botToken || !chatId) {
    throw new Error("telegram_alerts_not_configured");
  }

  const monthLabel = formatReportMonthLabel(monthValue).toLocaleLowerCase("ru-RU");
  const text = [
    "⚠️ <b>Польские продажи: фискальный терминал</b>",
    "",
    `За ${monthLabel} не внесено в терминал: <b>${outstandingCount}</b>.`,
    "Проверь продажи в админке и отметь обработанные записи до конца месяца.",
  ].join("\n");

  try {
    const message = await sendTelegramMessage({
      botToken,
      chatId,
      disableWebPagePreview: true,
      maxAttempts: 1,
      parseMode: "HTML",
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: "Открыть продажи",
              url: `${SITE_HOME_URL}/admin?view=purchases`,
            },
          ],
        ],
      },
      text,
    });

    return { externalMessageId: String(message.message_id) };
  } catch {
    // sendMessage has no idempotency key. An uncertain provider response must
    // not be retried automatically and risk showing the same reminder twice.
    throw createNonRetryableError(
      "telegram_terminal_reminder_delivery_uncertain_manual_review_required",
    );
  }
};

export const deliverBusinessOperationOutboxJob = (job: ClaimedOutboxJob) => {
  if (job.kind === "campaign_email_delivery") {
    return deliverCampaignEmail(job);
  }

  if (job.kind === "monthly_report_delivery") {
    return deliverMonthlyReport(job);
  }

  if (job.kind === "polish_terminal_reminder") {
    return deliverPolishTerminalReminder(job);
  }

  throw Object.assign(new Error(`unsupported_business_outbox_kind:${job.kind}`), {
    retryable: false,
  });
};

const enqueueRecoverableBusinessJob = async (
  input: Parameters<typeof enqueueOutboxJob>[0],
) => {
  const result = await enqueueOutboxJob(input);

  if (
    result.duplicate &&
    (result.status === "failed" || result.status === "dead_letter")
  ) {
    await replayOutboxJob({ deduplicationKey: input.deduplicationKey });
  }

  return result;
};

export const enqueueCampaignEmailDelivery = ({
  campaignKey,
  deduplicationKey,
  email,
  leadId,
}: CampaignEmailDeliveryPayload & { deduplicationKey: string }) =>
  enqueueRecoverableBusinessJob({
    deduplicationKey,
    kind: "campaign_email_delivery",
    payload: { campaignKey, email, leadId },
    provider: "resend",
    recipient: email.to,
  });

export const enqueueMonthlyReportDelivery = ({
  deduplicationKey,
  ...payload
}: MonthlyReportDeliveryPayload & { deduplicationKey: string }) =>
  enqueueRecoverableBusinessJob({
    deduplicationKey,
    kind: "monthly_report_delivery",
    payload,
    provider: "resend",
    recipient: payload.email.to,
  });

export const enqueuePolishTerminalReminder = ({
  deduplicationKey,
  monthValue,
}: PolishTerminalReminderPayload & { deduplicationKey: string }) =>
  enqueueOutboxJob({
    deduplicationKey,
    kind: "polish_terminal_reminder",
    payload: { monthValue },
    provider: "telegram",
    recipient: getTelegramAlertsChatId() || null,
  });

export const processBusinessOperationOutboxJob = (deduplicationKey: string) =>
  processOutboxJobByDeduplicationKey({
    deduplicationKey,
    deliver: deliverBusinessOperationOutboxJob,
  });

export const runBusinessOperationOutboxJobs = async ({
  limit = 24,
}: {
  limit?: number;
} = {}) => {
  const counts = {
    dead_letter: 0,
    empty: 0,
    retry: 0,
    sent: 0,
    skipped: 0,
  };

  for (let index = 0; index < limit; index += 1) {
    const result = await processNextOutboxJob({
      deliver: deliverBusinessOperationOutboxJob,
      kinds: [...BUSINESS_OPERATION_OUTBOX_KINDS],
    });

    counts[result.status] += 1;

    if (result.status === "empty") {
      break;
    }
  }

  return counts;
};
