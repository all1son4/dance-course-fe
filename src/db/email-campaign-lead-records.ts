import { and, asc, eq } from "drizzle-orm";

import type { EmailCampaignLeadRecord } from "@/lib/email-campaign-record";

import { getDatabase } from "./client";
import { normalizeEmail, toIso } from "./record-values";
import { emailCampaignLeads } from "./schema";

const mapEmailCampaignLeadRecordFromDatabase = (
  row: typeof emailCampaignLeads.$inferSelect,
): EmailCampaignLeadRecord => ({
  campaign_key: row.campaignKey,
  created_at: toIso(row.createdAt),
  email: row.email,
  email_send_attempts: String(row.emailSendAttempts),
  email_send_status: row.emailSendStatus,
  email_sent_at: toIso(row.emailSentAt),
  full_name: row.fullName,
  last_email_error: row.lastEmailError,
  lead_id: row.leadId,
  locale: row.locale,
  social_contact: row.socialContact,
});

export const listEmailCampaignLeadRecordsFromDatabase = async () => {
  const rows = await getDatabase()
    .select()
    .from(emailCampaignLeads)
    .orderBy(asc(emailCampaignLeads.createdAt), asc(emailCampaignLeads.leadId));

  return rows
    .map(mapEmailCampaignLeadRecordFromDatabase)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
};

export const findEmailCampaignLeadByCampaignAndEmailFromDatabase = async ({
  campaignKey,
  email,
}: {
  campaignKey: string;
  email: string;
}) => {
  const normalizedCampaignKey = campaignKey.trim();
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedCampaignKey || !normalizedEmail) {
    return null;
  }

  const [row] = await getDatabase()
    .select()
    .from(emailCampaignLeads)
    .where(
      and(
        eq(emailCampaignLeads.campaignKey, normalizedCampaignKey),
        eq(emailCampaignLeads.normalizedEmail, normalizedEmail),
      ),
    )
    .limit(1);

  return row ? mapEmailCampaignLeadRecordFromDatabase(row) : null;
};
