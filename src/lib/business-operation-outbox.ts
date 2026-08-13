import {
  claimEmailCampaignLeadForDelivery,
  findMonthlyReportRunInDatabase,
  markEmailCampaignLeadFailed,
  markEmailCampaignLeadSent,
  recordMonthlyReportRunInDatabase,
} from "@/db/business-operation-jobs";
import {
  type ClaimedOutboxJob,
  enqueueOutboxJob,
  processNextOutboxJob,
  processOutboxJobByDeduplicationKey,
  replayOutboxJob,
} from "@/db/transactional-outbox";
import { sendResendEmail, type SendResendEmailInput } from "@/lib/email/resend";

export const BUSINESS_OPERATION_OUTBOX_KINDS = [
  "monthly_report_delivery",
  "campaign_email_delivery",
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

export const deliverBusinessOperationOutboxJob = (job: ClaimedOutboxJob) => {
  if (job.kind === "campaign_email_delivery") {
    return deliverCampaignEmail(job);
  }

  if (job.kind === "monthly_report_delivery") {
    return deliverMonthlyReport(job);
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
