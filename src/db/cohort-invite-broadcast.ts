import { and, desc, eq, exists, gt, inArray, isNull, or, sql } from "drizzle-orm";

import {
  ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
  ONLINE_GROUP_RENEWAL_OFFER_ID,
} from "@/constants/sellable-products";

import { getDatabase } from "./client";
import {
  emailCampaignLeads,
  onlineGroupCohorts,
  purchaseSideEffects,
  renewalCampaigns,
  renewalCampaignSourceChats,
} from "./schema";

/*
 * Read side of the «Приглашение в поток» broadcast: the cohort on sale, every past
 * buyer with what the email needs to know about them, the renewal links of that
 * cohort and how many emails Resend already took today. No writes here.
 */

export type CohortInviteCohort = {
  durationWeeks: number;
  id: string;
  mainChatId: string;
  previousCohortId: string | null;
  previousMainChatId: string | null;
  startsAt: Date;
  title: string;
};

/** One address that ever paid for anything, with the facts the rules need. */
export type CohortInviteAudienceRow = {
  /** Customer of the latest purchase that has one: the «Мой доступ» link. */
  customerId: string | null;
  email: string;
  fullName: string;
  /** checkout_locale of the latest successful purchase; null when it was empty. */
  locale: string | null;
  paidCurrentCohort: boolean;
  paidPreviousCohort: boolean;
  /** Any Inspiration Hub right (own or from Plus) that has not ended. */
  hubActive: boolean;
  /** A Hub bought on its own that has not ended. */
  standaloneHubActive: boolean;
  /** Unsubscribed or excluded everywhere: a `blocked` row in any campaign. */
  blocked: boolean;
  /** Status of this address in this campaign, null when it has no row yet. */
  campaignStatus:
    "blocked" | "excluded" | "failed" | "pending" | "sending" | "sent" | null;
};

export type CohortRenewalSlugs = { plus: string | null; standard: string | null };

/** The cohort on sale: the latest start among those with sales on. */
export async function findCohortOnSale(): Promise<CohortInviteCohort | null> {
  const database = getDatabase();
  const [cohort] = await database
    .select({
      durationWeeks: onlineGroupCohorts.durationWeeks,
      id: onlineGroupCohorts.id,
      mainChatId: onlineGroupCohorts.mainChatId,
      previousCohortId: onlineGroupCohorts.previousCohortId,
      startsAt: onlineGroupCohorts.startsAt,
      title: onlineGroupCohorts.title,
    })
    .from(onlineGroupCohorts)
    .where(eq(onlineGroupCohorts.salesEnabled, true))
    .orderBy(desc(onlineGroupCohorts.startsAt))
    .limit(1);

  if (!cohort) return null;

  const [previous] = cohort.previousCohortId
    ? await database
        .select({ mainChatId: onlineGroupCohorts.mainChatId })
        .from(onlineGroupCohorts)
        .where(eq(onlineGroupCohorts.id, cohort.previousCohortId))
        .limit(1)
    : [];

  return { ...cohort, previousMainChatId: previous?.mainChatId ?? null };
}

/**
 * Every normalized address with a successful purchase, one row each. NOT EXISTS
 * style subqueries only: a NULL cohort id never turns a comparison into "unknown".
 */
export async function listCohortInviteAudience({
  campaignKey,
  cohortId,
  now = new Date(),
  previousCohortId,
}: {
  campaignKey: string;
  cohortId: string;
  now?: Date;
  previousCohortId: string | null;
}): Promise<CohortInviteAudienceRow[]> {
  const rows = await getDatabase().execute<CohortInviteAudienceRow>(sql`
    WITH buyer_purchases AS (
      SELECT
        lower(btrim(purchase.customer_email_snapshot)) AS email,
        purchase.id,
        purchase.checkout_locale,
        purchase.customer_full_name_snapshot,
        purchase.customer_id,
        purchase.online_group_cohort_id,
        coalesce(purchase.succeeded_at, purchase.first_seen_at) AS paid_at
      FROM purchases purchase
      WHERE purchase.outcome = 'succeeded'
        AND btrim(coalesce(purchase.customer_email_snapshot, '')) <> ''
    ),
    buyers AS (
      SELECT DISTINCT ON (email)
        email,
        checkout_locale AS locale,
        (
          SELECT owned.customer_id
          FROM buyer_purchases owned
          WHERE owned.email = latest.email AND owned.customer_id IS NOT NULL
          ORDER BY owned.paid_at DESC, owned.id DESC
          LIMIT 1
        ) AS customer_id,
        coalesce(
          (
            SELECT btrim(named.customer_full_name_snapshot)
            FROM buyer_purchases named
            WHERE named.email = latest.email
              AND btrim(coalesce(named.customer_full_name_snapshot, '')) <> ''
            ORDER BY named.paid_at DESC, named.id DESC
            LIMIT 1
          ),
          ''
        ) AS full_name
      FROM buyer_purchases latest
      ORDER BY email, paid_at DESC, id DESC
    ),
    hub_rights AS (
      SELECT
        lower(btrim(purchase.customer_email_snapshot)) AS email,
        entitlement.source_kind
      FROM access_entitlements entitlement
      JOIN purchases purchase ON purchase.id = entitlement.purchase_id
      WHERE entitlement.access_key = 'inspiration-hub'
        AND entitlement.revoked_at IS NULL
        AND entitlement.status NOT IN ('expired', 'revoked')
        AND (entitlement.expires_at IS NULL OR entitlement.expires_at > ${now.toISOString()}::timestamptz)
        AND purchase.outcome = 'succeeded'
    )
    SELECT
      buyer.customer_id AS "customerId",
      buyer.email,
      buyer.full_name AS "fullName",
      nullif(btrim(coalesce(buyer.locale, '')), '') AS locale,
      EXISTS (
        SELECT 1 FROM buyer_purchases paid
        WHERE paid.email = buyer.email AND paid.online_group_cohort_id = ${cohortId}
      ) AS "paidCurrentCohort",
      ${
        previousCohortId
          ? sql`EXISTS (
              SELECT 1 FROM buyer_purchases paid
              WHERE paid.email = buyer.email
                AND paid.online_group_cohort_id = ${previousCohortId}
            )`
          : sql`false`
      } AS "paidPreviousCohort",
      EXISTS (
        SELECT 1 FROM hub_rights hub WHERE hub.email = buyer.email
      ) AS "hubActive",
      EXISTS (
        SELECT 1 FROM hub_rights hub
        WHERE hub.email = buyer.email AND hub.source_kind = 'standalone_hub'
      ) AS "standaloneHubActive",
      EXISTS (
        SELECT 1 FROM email_campaign_leads blocked
        WHERE blocked.normalized_email = buyer.email
          AND blocked.email_send_status = 'blocked'
      ) AS blocked,
      (
        SELECT lead.email_send_status FROM email_campaign_leads lead
        WHERE lead.campaign_key = ${campaignKey} AND lead.normalized_email = buyer.email
      ) AS "campaignStatus"
    FROM buyers buyer
    ORDER BY buyer.email
  `);

  return [...rows];
}

/**
 * The active, unexpired renewal campaigns into this cohort for members of the
 * previous cohort's chat, one per tariff (the closure post uses the same pair).
 */
export async function findCohortRenewalSlugs({
  mainChatId,
  now = new Date(),
  previousMainChatId,
}: {
  mainChatId: string;
  now?: Date;
  previousMainChatId: string | null;
}): Promise<CohortRenewalSlugs> {
  if (!previousMainChatId) return { plus: null, standard: null };

  const database = getDatabase();
  const campaigns = await database
    .select({
      offerExternalId: renewalCampaigns.offerExternalId,
      slug: renewalCampaigns.slug,
    })
    .from(renewalCampaigns)
    .where(
      and(
        eq(renewalCampaigns.status, "active"),
        eq(renewalCampaigns.targetChatId, mainChatId),
        inArray(renewalCampaigns.offerExternalId, [
          ONLINE_GROUP_RENEWAL_OFFER_ID,
          ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
        ]),
        or(isNull(renewalCampaigns.expiresAt), gt(renewalCampaigns.expiresAt, now)),
        or(
          eq(renewalCampaigns.sourceChatId, previousMainChatId),
          exists(
            database
              .select({ id: renewalCampaignSourceChats.id })
              .from(renewalCampaignSourceChats)
              .where(
                and(
                  eq(renewalCampaignSourceChats.campaignId, renewalCampaigns.id),
                  eq(renewalCampaignSourceChats.chatId, previousMainChatId),
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(desc(renewalCampaigns.createdAt));
  const slugFor = (offerId: string) =>
    campaigns.find((campaign) => campaign.offerExternalId === offerId)?.slug ?? null;

  return {
    plus: slugFor(ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID),
    standard: slugFor(ONLINE_GROUP_RENEWAL_OFFER_ID),
  };
}

/** Emails Resend accepted from our queue in the last 24 hours (all kinds). */
export async function countResendEmailsSentSince(since: Date): Promise<number> {
  const [row] = await getDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseSideEffects)
    .where(
      and(
        eq(purchaseSideEffects.provider, "resend"),
        eq(purchaseSideEffects.status, "sent"),
        gt(purchaseSideEffects.lastAttemptAt, since),
      ),
    );

  return row?.count ?? 0;
}

/**
 * Campaign status and global block of typed addresses, purchases or not: an
 * address without a purchase is not in the audience, yet its row says it was sent.
 */
export async function listCampaignAddressStates({
  campaignKey,
  emails,
}: {
  campaignKey: string;
  emails: string[];
}): Promise<Pick<CohortInviteAudienceRow, "blocked" | "campaignStatus" | "email">[]> {
  if (emails.length === 0) return [];

  const rows = await getDatabase()
    .select({
      blocked: sql<boolean>`bool_or(${emailCampaignLeads.emailSendStatus} = 'blocked')`,
      campaignStatus: sql<
        CohortInviteAudienceRow["campaignStatus"]
      >`max(${emailCampaignLeads.emailSendStatus}) filter (where ${emailCampaignLeads.campaignKey} = ${campaignKey})`,
      email: emailCampaignLeads.normalizedEmail,
    })
    .from(emailCampaignLeads)
    .where(inArray(emailCampaignLeads.normalizedEmail, emails))
    .groupBy(emailCampaignLeads.normalizedEmail);

  return rows;
}

/** Every address this campaign reached, typed ones without a purchase included. */
export async function countCampaignSent(campaignKey: string): Promise<number> {
  const [row] = await getDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(emailCampaignLeads)
    .where(
      and(
        eq(emailCampaignLeads.campaignKey, campaignKey),
        eq(emailCampaignLeads.emailSendStatus, "sent"),
      ),
    );

  return row?.count ?? 0;
}
