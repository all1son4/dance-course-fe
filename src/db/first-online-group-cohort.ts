import { and, eq, isNull, lt, notInArray, or, sql } from "drizzle-orm";

import {
  ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
  ONLINE_GROUP_RENEWAL_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { getStartOfNextWarsawDay } from "@/lib/inspiration-hub/calendar";

import {
  onlineGroupCohorts,
  purchases,
  renewalCampaigns,
  renewalCampaignSourceChats,
  telegramChats,
} from "./schema";
import type { DatabaseExecutor } from "./transaction";

/*
 * The first Online Group cycle (May–June 2026) ran before cohorts were recorded:
 * its chat is known (the 2.0 renewal was sold from it) and its purchases are in the
 * database without a cohort. This records it once, from those facts (owner,
 * 2026-11-19): a closed cohort on that chat, and its purchases linked to it. The
 * dates are the owner's; nothing else is entered by hand. No `previous_cohort_id`
 * is set on the cycle after it: the Hub and chat-removal flows read that link.
 */

export const FIRST_COHORT_TITLE = "Online Group 1.0";
const GROUP_PRODUCT_ID = SELLABLE_PRODUCTS["online-group-anna-strok"].id;
const ONLINE_GROUP_RENEWAL_OFFER_IDS = [
  ONLINE_GROUP_RENEWAL_OFFER_ID,
  ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
] as const;

type CohortRow = { id: string; mainChatId: string; startsAt: Date; title: string };
type CampaignRow = { sourceChatIds: string[]; targetChatId: string };

/**
 * The first cycle's chat and the cycle after it: the one renewal campaign with a
 * single source chat that no cohort records (or that this script recorded). Pure.
 */
export const findFirstCohortChat = ({
  campaigns,
  cohorts,
}: {
  campaigns: readonly CampaignRow[];
  cohorts: readonly CohortRow[];
}):
  | { ok: true; sourceChatId: string; next: CohortRow; existing: CohortRow | null }
  | { ok: false; reason: string } => {
  const byChat = new Map(cohorts.map((cohort) => [cohort.mainChatId, cohort]));
  const unrecorded = (chatId: string) => {
    const cohort = byChat.get(chatId);
    return !cohort || cohort.title === FIRST_COHORT_TITLE;
  };
  const pairs = new Map<string, { sourceChatId: string; next: CohortRow }>();

  for (const campaign of campaigns) {
    const next = byChat.get(campaign.targetChatId);
    if (!next || next.title === FIRST_COHORT_TITLE) continue;
    const sources = [...new Set(campaign.sourceChatIds)];
    if (sources.length !== 1 || !unrecorded(sources[0]!)) continue;
    pairs.set(`${sources[0]}→${next.id}`, { next, sourceChatId: sources[0]! });
  }

  if (pairs.size !== 1) {
    return {
      ok: false,
      reason: `expected one unrecorded source chat, found ${pairs.size}`,
    };
  }
  const [{ next, sourceChatId }] = [...pairs.values()];
  const earlier = cohorts.filter(
    (cohort) => cohort.title !== FIRST_COHORT_TITLE && cohort.startsAt < next.startsAt,
  );
  if (earlier.length > 0) {
    return { ok: false, reason: "the cycle after it is not the first recorded one" };
  }

  return { existing: byChat.get(sourceChatId) ?? null, next, ok: true, sourceChatId };
};

export type FirstCohortDates = { closedAt: Date; durationWeeks: number; startsAt: Date };

export const checkFirstCohortDates = (
  dates: FirstCohortDates,
  next: Pick<CohortRow, "startsAt">,
  now: Date,
): string | null => {
  if (
    !Number.isInteger(dates.durationWeeks) ||
    dates.durationWeeks < 1 ||
    dates.durationWeeks > 26
  )
    return "duration_weeks must be a whole number from 1 to 26";
  if (!(dates.closedAt > dates.startsAt)) return "the closure must come after the start";
  if (dates.closedAt > next.startsAt)
    return "the first cycle must close before the next starts";
  if (getStartOfNextWarsawDay(dates.closedAt) > now)
    return "the closure must be in the past";
  return null;
};

/** Reads cohorts and renewal campaigns and finds the first cycle's chat. */
export async function findFirstOnlineGroupCohortChat(tx: DatabaseExecutor) {
  const [cohortRows, campaignRows, sourceRows] = await Promise.all([
    tx
      .select({
        id: onlineGroupCohorts.id,
        mainChatId: onlineGroupCohorts.mainChatId,
        startsAt: onlineGroupCohorts.startsAt,
        title: onlineGroupCohorts.title,
      })
      .from(onlineGroupCohorts),
    tx
      .select({
        id: renewalCampaigns.id,
        sourceChatId: renewalCampaigns.sourceChatId,
        targetChatId: renewalCampaigns.targetChatId,
      })
      .from(renewalCampaigns),
    tx
      .select({
        campaignId: renewalCampaignSourceChats.campaignId,
        chatId: renewalCampaignSourceChats.chatId,
      })
      .from(renewalCampaignSourceChats),
  ]);
  const found = findFirstCohortChat({
    campaigns: campaignRows.map((campaign) => ({
      sourceChatIds: [
        campaign.sourceChatId,
        ...sourceRows
          .filter((row) => row.campaignId === campaign.id)
          .map((row) => row.chatId),
      ],
      targetChatId: campaign.targetChatId,
    })),
    cohorts: cohortRows,
  });
  if (!found.ok) throw new Error(`first_cohort_not_found: ${found.reason}`);
  return found;
}

/** What the run would do (and, with `apply`, does); run it inside one transaction. */
export async function recordFirstOnlineGroupCohort(
  tx: DatabaseExecutor,
  {
    apply,
    dates,
    found,
    now = new Date(),
  }: {
    apply: boolean;
    dates: FirstCohortDates;
    found: { existing: CohortRow | null; next: CohortRow; sourceChatId: string };
    now?: Date;
  },
) {
  const problem = checkFirstCohortDates(dates, found.next, now);
  if (problem) throw new Error(`first_cohort_dates_invalid: ${problem}`);

  const [chat] = await tx
    .select({ title: telegramChats.title })
    .from(telegramChats)
    .where(eq(telegramChats.chatId, found.sourceChatId));

  // Online Group checkouts without a cohort, begun before the next cycle started —
  // except renewals: nothing came before the first cycle, so a renewal is always
  // into a later one (prod has a failed 2.0 renewal attempt of 3 August).
  const toLink = and(
    eq(purchases.productExternalId, GROUP_PRODUCT_ID),
    isNull(purchases.onlineGroupCohortId),
    lt(purchases.firstSeenAt, found.next.startsAt),
    or(
      isNull(purchases.offerExternalId),
      notInArray(purchases.offerExternalId, [...ONLINE_GROUP_RENEWAL_OFFER_IDS]),
    ),
  );
  const byOutcome = await tx
    .select({ count: sql<number>`count(*)::int`, outcome: purchases.outcome })
    .from(purchases)
    .where(toLink)
    .groupBy(purchases.outcome);

  const accessEndsAt = getStartOfNextWarsawDay(dates.closedAt);
  if (found.existing) {
    const [existing] = await tx
      .select({
        accessEndsAt: onlineGroupCohorts.accessEndsAt,
        closedAt: onlineGroupCohorts.closedAt,
        durationWeeks: onlineGroupCohorts.durationWeeks,
        startsAt: onlineGroupCohorts.startsAt,
      })
      .from(onlineGroupCohorts)
      .where(eq(onlineGroupCohorts.id, found.existing.id));
    const same =
      existing?.startsAt.getTime() === dates.startsAt.getTime() &&
      existing.closedAt?.getTime() === dates.closedAt.getTime() &&
      existing.durationWeeks === dates.durationWeeks;
    if (!same) throw new Error("first_cohort_exists_with_other_dates");
  }

  const plan = {
    chat: chat?.title ?? null,
    cohort: found.existing ? "exists" : "to create",
    next: found.next.title,
    purchases: Object.fromEntries(byOutcome.map((row) => [row.outcome, row.count])),
  };
  if (!apply) return { applied: false, ...plan };

  const cohortId =
    found.existing?.id ??
    (
      await tx
        .insert(onlineGroupCohorts)
        .values({
          accessEndsAt,
          closedAt: dates.closedAt,
          durationWeeks: dates.durationWeeks,
          lessonsClearedAt: dates.closedAt,
          mainChatId: found.sourceChatId,
          salesEnabled: false,
          startsAt: dates.startsAt,
          title: FIRST_COHORT_TITLE,
        })
        .returning({ id: onlineGroupCohorts.id })
    )[0]!.id;
  const linked = await tx
    .update(purchases)
    .set({ onlineGroupCohortId: cohortId })
    .where(toLink)
    .returning({ id: purchases.id });

  return { applied: true, ...plan, linked: linked.length };
}
