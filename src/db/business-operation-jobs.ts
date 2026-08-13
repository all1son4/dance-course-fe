import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import { getDatabase } from "./client";
import { emailCampaignLeads, monthlyReportRuns, purchaseSideEffects } from "./schema";

export type MonthlyReportRun = typeof monthlyReportRuns.$inferSelect;
export type EmailCampaignLead = typeof emailCampaignLeads.$inferSelect;

export type RecordMonthlyReportRunInput = {
  csvSha256: string;
  deliveredAtUtc: Date | null;
  deliveredTo: string;
  deliveryStatus: "failed" | "sent" | "skipped";
  generatedAtUtc: Date;
  periodEndUtc: Date;
  periodStartUtc: Date;
  reportFamily: string;
  reportKey: string;
  rowCount: number;
};

export type CreateEmailCampaignLeadInDatabaseInput = {
  campaignKey: string;
  createdAt: Date;
  email: string;
  fullName: string;
  leadId: string;
  locale: string;
  socialContact: string;
};

export type EmailCampaignExclusionScope = "campaign" | "global";

const normalizeEmail = (value: string) => value.trim().toLowerCase().slice(0, 254);
const normalizeOptional = (value: string) => value.trim();

const requireNonEmpty = (value: string, field: string) => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`business_operation_${field}_required`);
  }

  return normalizedValue;
};

export const getCampaignEmailDeliveryDeduplicationKey = ({
  campaignKey,
  leadId,
}: {
  campaignKey: string;
  leadId: string;
}) =>
  `campaign:${requireNonEmpty(campaignKey, "campaign_key")}:lead:${requireNonEmpty(
    leadId,
    "lead_id",
  )}`;

export const findMonthlyReportRunInDatabase = async (reportKey: string) => {
  const normalizedReportKey = requireNonEmpty(reportKey, "report_key");
  const [run] = await getDatabase()
    .select()
    .from(monthlyReportRuns)
    .where(eq(monthlyReportRuns.reportKey, normalizedReportKey))
    .limit(1);

  return run ?? null;
};

export const recordMonthlyReportRunInDatabase = async (
  input: RecordMonthlyReportRunInput,
) => {
  const reportKey = requireNonEmpty(input.reportKey, "report_key");
  const now = new Date();
  const [run] = await getDatabase()
    .insert(monthlyReportRuns)
    .values({
      csvSha256: input.csvSha256.trim() || null,
      deliveredAtUtc: input.deliveredAtUtc,
      deliveredTo: input.deliveredTo.trim() || null,
      deliveryStatus: input.deliveryStatus,
      generatedAtUtc: input.generatedAtUtc,
      periodEndUtc: input.periodEndUtc,
      periodStartUtc: input.periodStartUtc,
      reportFamily: requireNonEmpty(input.reportFamily, "report_family"),
      reportKey,
      rowCount: input.rowCount,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        csvSha256: input.csvSha256.trim() || null,
        deliveredAtUtc: input.deliveredAtUtc,
        deliveredTo: input.deliveredTo.trim() || null,
        deliveryStatus: input.deliveryStatus,
        generatedAtUtc: input.generatedAtUtc,
        periodEndUtc: input.periodEndUtc,
        periodStartUtc: input.periodStartUtc,
        reportFamily: requireNonEmpty(input.reportFamily, "report_family"),
        rowCount: input.rowCount,
        updatedAt: now,
      },
      target: monthlyReportRuns.reportKey,
    })
    .returning();

  if (!run) {
    throw new Error("monthly_report_run_not_recorded");
  }

  return run;
};

export const listEmailCampaignLeadsFromDatabase = () =>
  getDatabase()
    .select()
    .from(emailCampaignLeads)
    .orderBy(asc(emailCampaignLeads.createdAt), asc(emailCampaignLeads.leadId));

export const createEmailCampaignLeadInDatabase = async (
  input: CreateEmailCampaignLeadInDatabaseInput,
) => {
  const campaignKey = requireNonEmpty(input.campaignKey, "campaign_key");
  const normalizedEmail = normalizeEmail(input.email);
  const leadId = requireNonEmpty(input.leadId, "lead_id");

  if (!normalizedEmail) {
    throw new Error("business_operation_email_required");
  }

  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(
        hashtextextended(${`email-campaign-address:${normalizedEmail}`}, 0)
      )`,
    );

    const [blockedLead] = await transaction
      .select({ id: emailCampaignLeads.id })
      .from(emailCampaignLeads)
      .where(
        and(
          eq(emailCampaignLeads.normalizedEmail, normalizedEmail),
          eq(emailCampaignLeads.emailSendStatus, "blocked"),
        ),
      )
      .limit(1);
    const [created] = await transaction
      .insert(emailCampaignLeads)
      .values({
        campaignKey,
        createdAt: input.createdAt,
        email: normalizedEmail,
        emailSendStatus: blockedLead ? "blocked" : "pending",
        fullName: normalizeOptional(input.fullName).slice(0, 120),
        leadId,
        locale: normalizeOptional(input.locale).slice(0, 20),
        normalizedEmail,
        socialContact: normalizeOptional(input.socialContact).slice(0, 160),
        updatedAt: input.createdAt,
      })
      .onConflictDoNothing({
        target: [emailCampaignLeads.campaignKey, emailCampaignLeads.normalizedEmail],
      })
      .returning();

    if (created) {
      return { created: true, lead: created };
    }

    const [existing] = await transaction
      .select()
      .from(emailCampaignLeads)
      .where(
        and(
          eq(emailCampaignLeads.campaignKey, campaignKey),
          eq(emailCampaignLeads.normalizedEmail, normalizedEmail),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error("email_campaign_duplicate_disappeared");
    }

    return { created: false, lead: existing };
  });
};

export const excludeEmailCampaignLeadInDatabase = async ({
  campaignKey,
  leadId,
  scope,
}: {
  campaignKey: string;
  leadId: string;
  scope: EmailCampaignExclusionScope;
}) => {
  const normalizedCampaignKey = requireNonEmpty(campaignKey, "campaign_key");
  const normalizedLeadId = requireNonEmpty(leadId, "lead_id");

  return getDatabase().transaction(async (transaction) => {
    const [leadIdentity] = await transaction
      .select({ normalizedEmail: emailCampaignLeads.normalizedEmail })
      .from(emailCampaignLeads)
      .where(
        and(
          eq(emailCampaignLeads.campaignKey, normalizedCampaignKey),
          eq(emailCampaignLeads.leadId, normalizedLeadId),
        ),
      )
      .limit(1);

    if (!leadIdentity) {
      return { status: "not_found" as const };
    }

    if (scope === "global") {
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(
          hashtextextended(${`email-campaign-address:${leadIdentity.normalizedEmail}`}, 0)
        )`,
      );
    }

    const [lead] = await transaction
      .select()
      .from(emailCampaignLeads)
      .where(
        and(
          eq(emailCampaignLeads.campaignKey, normalizedCampaignKey),
          eq(emailCampaignLeads.leadId, normalizedLeadId),
        ),
      )
      .limit(1)
      .for("update");

    if (!lead) {
      return { status: "not_found" as const };
    }

    const deduplicationKey = getCampaignEmailDeliveryDeduplicationKey({
      campaignKey: normalizedCampaignKey,
      leadId: normalizedLeadId,
    });
    const [deliveryJob] = await transaction
      .select({ status: purchaseSideEffects.status })
      .from(purchaseSideEffects)
      .where(eq(purchaseSideEffects.deduplicationKey, deduplicationKey))
      .limit(1)
      .for("update");

    if (lead.emailSendStatus === "sending" || deliveryJob?.status === "sending") {
      return { status: "delivery_in_progress" as const };
    }

    if (lead.emailSendStatus !== "pending" && lead.emailSendStatus !== "failed") {
      return { status: "not_actionable" as const };
    }

    const [updated] = await transaction
      .update(emailCampaignLeads)
      .set({
        emailSendStatus: scope === "global" ? "blocked" : "excluded",
        lastEmailError: "",
        updatedAt: new Date(),
      })
      .where(eq(emailCampaignLeads.id, lead.id))
      .returning();

    if (!updated) {
      throw new Error("email_campaign_exclusion_not_recorded");
    }

    await transaction
      .update(purchaseSideEffects)
      .set({
        leaseExpiresAt: null,
        leaseToken: null,
        nextAttemptAt: null,
        status: "skipped",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(purchaseSideEffects.deduplicationKey, deduplicationKey),
          inArray(purchaseSideEffects.status, ["pending", "failed", "dead_letter"]),
        ),
      );

    return { lead: updated, status: "excluded" as const };
  });
};

export const claimEmailCampaignLeadForDelivery = async ({
  campaignKey,
  leadId,
}: {
  campaignKey: string;
  leadId: string;
}) => {
  const normalizedCampaignKey = requireNonEmpty(campaignKey, "campaign_key");
  const normalizedLeadId = requireNonEmpty(leadId, "lead_id");

  return getDatabase().transaction(async (transaction) => {
    const [leadIdentity] = await transaction
      .select({ normalizedEmail: emailCampaignLeads.normalizedEmail })
      .from(emailCampaignLeads)
      .where(
        and(
          eq(emailCampaignLeads.campaignKey, normalizedCampaignKey),
          eq(emailCampaignLeads.leadId, normalizedLeadId),
        ),
      )
      .limit(1);

    if (!leadIdentity) {
      throw Object.assign(new Error("email_campaign_lead_not_found"), {
        retryable: false,
      });
    }

    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(
        hashtextextended(${`email-campaign-address:${leadIdentity.normalizedEmail}`}, 0)
      )`,
    );

    const [lead] = await transaction
      .select()
      .from(emailCampaignLeads)
      .where(
        and(
          eq(emailCampaignLeads.campaignKey, normalizedCampaignKey),
          eq(emailCampaignLeads.leadId, normalizedLeadId),
        ),
      )
      .limit(1)
      .for("update");

    if (!lead) {
      throw Object.assign(new Error("email_campaign_lead_not_found"), {
        retryable: false,
      });
    }

    if (lead.emailSendStatus === "sent") {
      return { lead, status: "already_sent" as const };
    }

    const [globallyBlockedLead] = await transaction
      .select({ id: emailCampaignLeads.id })
      .from(emailCampaignLeads)
      .where(
        and(
          eq(emailCampaignLeads.normalizedEmail, lead.normalizedEmail),
          eq(emailCampaignLeads.emailSendStatus, "blocked"),
          ne(emailCampaignLeads.id, lead.id),
        ),
      )
      .limit(1);

    if (
      lead.emailSendStatus === "blocked" ||
      lead.emailSendStatus === "excluded" ||
      globallyBlockedLead
    ) {
      return { lead, status: "excluded" as const };
    }

    if (
      lead.emailSendStatus !== "pending" &&
      lead.emailSendStatus !== "failed" &&
      lead.emailSendStatus !== "sending"
    ) {
      throw new Error("email_campaign_lead_status_invalid");
    }

    const [claimed] = await transaction
      .update(emailCampaignLeads)
      .set({
        emailSendAttempts: sql`${emailCampaignLeads.emailSendAttempts} + 1`,
        emailSendStatus: "sending",
        lastEmailError: "",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailCampaignLeads.id, lead.id),
          inArray(emailCampaignLeads.emailSendStatus, ["pending", "failed", "sending"]),
        ),
      )
      .returning();

    if (!claimed) {
      throw new Error("email_campaign_lead_claim_failed");
    }

    return { lead: claimed, status: "claimed" as const };
  });
};

export const markEmailCampaignLeadSent = async ({
  leadId,
  sentAt = new Date(),
}: {
  leadId: string;
  sentAt?: Date;
}) => {
  const [updated] = await getDatabase()
    .update(emailCampaignLeads)
    .set({
      emailSendStatus: "sent",
      emailSentAt: sentAt,
      lastEmailError: "",
      updatedAt: sentAt,
    })
    .where(
      and(
        eq(emailCampaignLeads.leadId, requireNonEmpty(leadId, "lead_id")),
        eq(emailCampaignLeads.emailSendStatus, "sending"),
      ),
    )
    .returning();

  if (!updated) {
    throw new Error("email_campaign_lead_delivery_state_lost");
  }

  return updated;
};

export const markEmailCampaignLeadFailed = async ({
  error,
  leadId,
}: {
  error: unknown;
  leadId: string;
}) => {
  const now = new Date();
  const [updated] = await getDatabase()
    .update(emailCampaignLeads)
    .set({
      emailSendStatus: "failed",
      lastEmailError:
        error instanceof Error ? error.message.slice(0, 500) : "unknown_error",
      updatedAt: now,
    })
    .where(
      and(
        eq(emailCampaignLeads.leadId, requireNonEmpty(leadId, "lead_id")),
        eq(emailCampaignLeads.emailSendStatus, "sending"),
      ),
    )
    .returning();

  return updated ?? null;
};
