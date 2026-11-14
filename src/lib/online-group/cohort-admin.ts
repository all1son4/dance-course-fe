import { and, desc, eq, exists, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  isOnlineGroupLibraryOfferId,
  ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
  ONLINE_GROUP_RENEWAL_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { getDatabase } from "@/db/client";
import { closeOnlineGroupCohortInDatabase } from "@/db/cohort-closure";
import {
  accessEntitlements,
  onlineGroupCohorts,
  purchases,
  purchaseSideEffects,
  renewalCampaigns,
  renewalCampaignSourceChats,
  telegramChats,
} from "@/db/schema";
import type { DatabaseExecutor } from "@/db/transaction";
import {
  type ClaimedOutboxJob,
  enqueueOutboxJob,
  processOutboxJobByDeduplicationKey,
  replayOutboxJob,
} from "@/db/transactional-outbox";
import { getStartOfNextWarsawDay } from "@/lib/inspiration-hub/calendar";
import { logSafeError } from "@/lib/safe-error-log";
import { normalizedSiteUrl } from "@/lib/seo";
import { pinTelegramChatMessage, sendTelegramMessage } from "@/lib/telegram/bot-api";

import {
  buildCohortClosurePost,
  buildCohortGraceReminder,
  type CohortRenewalLinks,
  getGraceReminderDay,
  getPlusHubLastDay,
  toWarsawDay,
} from "./cohort-messages";

type Cohort = typeof onlineGroupCohorts.$inferSelect;

export const cohortClosurePostKey = (cohortId: string) =>
  `cohort_closure_post:${cohortId}`;
const cohortGraceReminderKey = (cohortId: string) => `cohort_grace_reminder:${cohortId}`;

const isProduction = () =>
  process.env.VERCEL_ENV === "production" ||
  (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production");

const PLUS_OFFER_IDS = SELLABLE_PRODUCTS["online-group-anna-strok"].offers
  .map((offer) => offer.id)
  .filter(isOnlineGroupLibraryOfferId);
const HUB_SPECIAL_PRICE_URL = `${normalizedSiteUrl}/payment?renewal=inspiration-hub`;

const buildRenewalUrl = (campaign: {
  offerExternalId: string;
  productExternalId: string;
  slug: string;
}) => {
  const url = new URL("/payment", normalizedSiteUrl);
  url.searchParams.set("product", campaign.productExternalId);
  url.searchParams.set("offer", campaign.offerExternalId);
  url.searchParams.set("renewal", campaign.slug);
  return url.toString();
};

/**
 * The three links of the closure post (HUB-D40): the active renewal campaigns that
 * lead members of this cohort's chat into the next cohort, one per tariff, and the
 * Hub at the special price.
 */
export async function findCohortRenewalLinks(
  executor: DatabaseExecutor,
  {
    cohortMainChatId,
    nextMainChatId,
  }: { cohortMainChatId: string; nextMainChatId: string },
): Promise<CohortRenewalLinks> {
  const campaigns = await executor
    .select({
      offerExternalId: renewalCampaigns.offerExternalId,
      productExternalId: renewalCampaigns.productExternalId,
      slug: renewalCampaigns.slug,
    })
    .from(renewalCampaigns)
    .where(
      and(
        eq(renewalCampaigns.status, "active"),
        eq(renewalCampaigns.targetChatId, nextMainChatId),
        exists(
          executor
            .select({ id: renewalCampaignSourceChats.id })
            .from(renewalCampaignSourceChats)
            .where(
              and(
                eq(renewalCampaignSourceChats.campaignId, renewalCampaigns.id),
                eq(renewalCampaignSourceChats.chatId, cohortMainChatId),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(renewalCampaigns.createdAt));
  const linkFor = (offerId: string) => {
    const campaign = campaigns.find((candidate) => candidate.offerExternalId === offerId);
    return campaign
      ? buildRenewalUrl({
          offerExternalId: offerId,
          productExternalId: campaign.productExternalId,
          slug: campaign.slug,
        })
      : null;
  };

  return {
    hub: HUB_SPECIAL_PRICE_URL,
    plus: linkFor(ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID),
    standard: linkFor(ONLINE_GROUP_RENEWAL_OFFER_ID),
  };
}

const countCohortFacts = async (executor: DatabaseExecutor, cohortId: string) => {
  const predecessor = alias(accessEntitlements, "predecessor");
  const predecessorPurchase = alias(purchases, "predecessor_purchase");
  const [sales] = await executor
    .select({
      plus: sql<number>`count(*) filter (where ${inArray(purchases.offerExternalId, PLUS_OFFER_IDS)})::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.onlineGroupCohortId, cohortId),
        eq(purchases.outcome, "succeeded"),
      ),
    );
  const [legacyPlusHub] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
    .where(
      and(
        eq(purchases.onlineGroupCohortId, cohortId),
        eq(accessEntitlements.accessKey, "inspiration-hub"),
        isNull(accessEntitlements.sourceKind),
      ),
    );
  const [continuations] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(accessEntitlements)
    .innerJoin(
      predecessor,
      eq(predecessor.id, accessEntitlements.startsAfterEntitlementId),
    )
    .innerJoin(predecessorPurchase, eq(predecessorPurchase.id, predecessor.purchaseId))
    .where(
      and(
        eq(accessEntitlements.sourceKind, "standalone_hub"),
        eq(predecessorPurchase.onlineGroupCohortId, cohortId),
      ),
    );

  return {
    continuations: continuations?.count ?? 0,
    legacyPlusHubRights: legacyPlusHub?.count ?? 0,
    plusPurchases: sales?.plus ?? 0,
    purchases: sales?.total ?? 0,
  };
};

export type CohortOverview = Awaited<ReturnType<typeof getCohortsOverview>>[number];

/**
 * Everything the Online Group tab shows about each cohort and needs to close one:
 * dates, sales state, what a closure would touch (HUB-D20), the warnings of
 * HUB-D27 and step 27, the links and the draft post (HUB-D29), and the post state.
 */
export async function getCohortsOverview(now = new Date()) {
  const db = getDatabase();
  const chat = alias(telegramChats, "chat");
  const cohorts = await db
    .select({ cohort: onlineGroupCohorts, chatTitle: chat.title })
    .from(onlineGroupCohorts)
    .leftJoin(chat, eq(chat.chatId, onlineGroupCohorts.mainChatId))
    .orderBy(desc(onlineGroupCohorts.startsAt));
  const posts = cohorts.length
    ? await db
        .select({
          deduplicationKey: purchaseSideEffects.deduplicationKey,
          lastErrorMessage: purchaseSideEffects.lastErrorMessage,
          sentAt: purchaseSideEffects.sentAt,
          status: purchaseSideEffects.status,
        })
        .from(purchaseSideEffects)
        .where(
          inArray(
            purchaseSideEffects.deduplicationKey,
            cohorts.map(({ cohort }) => cohortClosurePostKey(cohort.id)),
          ),
        )
    : [];

  return Promise.all(
    cohorts.map(async ({ cohort, chatTitle }) => {
      const next = cohorts.find(
        (candidate) => candidate.cohort.previousCohortId === cohort.id,
      )?.cohort;
      const links = next
        ? await findCohortRenewalLinks(db, {
            cohortMainChatId: cohort.mainChatId,
            nextMainChatId: next.mainChatId,
          })
        : null;
      const accessEndsAt = cohort.accessEndsAt ?? getStartOfNextWarsawDay(now);
      const post = posts.find(
        (candidate) => candidate.deduplicationKey === cohortClosurePostKey(cohort.id),
      );

      return {
        id: cohort.id,
        title: cohort.title,
        mainChatId: cohort.mainChatId,
        mainChatTitle: chatTitle ?? cohort.mainChatId,
        startsAt: cohort.startsAt.toISOString(),
        closedAt: cohort.closedAt?.toISOString() ?? null,
        accessEndsAt: cohort.accessEndsAt?.toISOString() ?? null,
        plusHubLastDay: toWarsawDay(getPlusHubLastDay(accessEndsAt)),
        salesEnabled: cohort.salesEnabled,
        previousCohortId: cohort.previousCohortId,
        next: next
          ? {
              id: next.id,
              title: next.title,
              startsAt: next.startsAt.toISOString(),
              salesEnabled: next.salesEnabled,
            }
          : null,
        facts: await countCohortFacts(db, cohort.id),
        links,
        draftPost:
          next && links && !cohort.closedAt
            ? buildCohortClosurePost({
                accessEndsAt,
                links,
                nextCohortStartsAt: next.startsAt,
              })
            : "",
        post: post
          ? {
              status: post.status,
              sentAt: post.sentAt?.toISOString() ?? null,
              error: post.lastErrorMessage,
            }
          : null,
      };
    }),
  );
}

const sendClosurePost = async ({
  cohort,
  pin,
  text,
}: {
  cohort: Cohort;
  pin: boolean;
  text: string;
}) => {
  const deduplicationKey = cohortClosurePostKey(cohort.id);
  await enqueueOutboxJob({
    deduplicationKey,
    kind: "cohort_closure_post",
    payload: { chatId: cohort.mainChatId, pin, text },
    provider: "telegram",
    recipient: cohort.mainChatId,
  });
  return processOutboxJobByDeduplicationKey({
    deduplicationKey,
    deliver: deliverCohortChatMessage,
    maxAttempts: 3,
  });
};

/**
 * The closure window (section 6.2): closes the cohort with the cron-safe two-step
 * service, then publishes the post in the cohort chat if asked. A failed post never
 * undoes the closure: it stays in the queue for "Повторить".
 */
export async function closeCohortFromAdmin({
  cohortId,
  confirmationTitle,
  lessonsCleared,
  openNextCohortSales,
  post,
}: {
  cohortId: string;
  confirmationTitle: string;
  lessonsCleared: boolean;
  openNextCohortSales: boolean;
  post: { pin: boolean; text: string } | null;
}) {
  const closure = await closeOnlineGroupCohortInDatabase({
    cohortId,
    confirmationTitle,
    lessonsCleared,
    openNextCohortSales,
    closedAt: new Date(),
  });
  const postResult =
    post && !closure.alreadyClosed && post.text.trim()
      ? await sendClosurePost({
          cohort: closure.cohort,
          pin: post.pin,
          text: post.text.trim(),
        })
      : null;

  return {
    alreadyClosed: closure.alreadyClosed,
    accessEndsAt: closure.cohort.accessEndsAt?.toISOString() ?? null,
    nextCohortSalesOpened: closure.nextCohortSalesOpened,
    continuations: closure.continuations,
    postStatus: postResult?.status ?? null,
  };
}

/** "Повторить": sends a failed closure post again. */
export async function retryCohortClosurePost(cohortId: string) {
  const deduplicationKey = cohortClosurePostKey(cohortId);
  const replayed = await replayOutboxJob({ deduplicationKey });
  if (!replayed) return { status: "not_failed" as const };
  const result = await processOutboxJobByDeduplicationKey({
    deduplicationKey,
    deliver: deliverCohortChatMessage,
    maxAttempts: 3,
  });
  return { status: result.status };
}

/**
 * HUB-D29, run daily: the reminder on the day before the Plus Hub's last day, in
 * the chat of every cohort whose closure post the bot published.
 */
export async function enqueueDueCohortGraceReminders(now = new Date()) {
  const result = { due: 0, enqueued: 0, duplicates: 0, disabled: false };
  if (!isProduction() && process.env.ALLOW_TEST_MODE_NOTIFICATIONS !== "1") {
    return { ...result, disabled: true };
  }

  const db = getDatabase();
  const next = alias(onlineGroupCohorts, "next_cohort");
  const rows = await db
    .select({ cohort: onlineGroupCohorts, next })
    .from(onlineGroupCohorts)
    .innerJoin(next, eq(next.previousCohortId, onlineGroupCohorts.id))
    .innerJoin(
      purchaseSideEffects,
      and(
        eq(
          purchaseSideEffects.deduplicationKey,
          sql`'cohort_closure_post:' || ${onlineGroupCohorts.id}`,
        ),
        eq(purchaseSideEffects.status, "sent"),
      ),
    )
    .where(isNotNull(onlineGroupCohorts.accessEndsAt));
  const today = toWarsawDay(now);

  for (const { cohort, next: nextCohort } of rows) {
    if (!cohort.accessEndsAt || getGraceReminderDay(cohort.accessEndsAt) !== today)
      continue;
    result.due += 1;
    const links = await findCohortRenewalLinks(db, {
      cohortMainChatId: cohort.mainChatId,
      nextMainChatId: nextCohort.mainChatId,
    });
    const queued = await enqueueOutboxJob({
      deduplicationKey: cohortGraceReminderKey(cohort.id),
      kind: "cohort_grace_reminder",
      payload: {
        chatId: cohort.mainChatId,
        pin: false,
        text: buildCohortGraceReminder({
          accessEndsAt: cohort.accessEndsAt,
          links,
          nextCohortStartsAt: nextCohort.startsAt,
        }),
      },
      provider: "telegram",
      recipient: cohort.mainChatId,
    });
    if (queued.duplicate) result.duplicates += 1;
    else result.enqueued += 1;
  }

  return result;
}

/** Sends a cohort chat post of the queue; a failed pin is logged, not resent. */
export async function deliverCohortChatMessage(job: ClaimedOutboxJob) {
  const chatId = typeof job.payload.chatId === "string" ? job.payload.chatId : "";
  const text = typeof job.payload.text === "string" ? job.payload.text : "";
  if (!chatId || !text) {
    throw Object.assign(new Error("cohort_chat_message_invalid"), { retryable: false });
  }

  const message = await sendTelegramMessage({
    chatId,
    disableWebPagePreview: true,
    maxAttempts: 3,
    text,
  });

  if (job.payload.pin === true) {
    try {
      await pinTelegramChatMessage({ chatId, messageId: message.message_id });
    } catch (error) {
      logSafeError("Cohort chat post was sent but not pinned", error);
    }
  }

  return { externalMessageId: String(message.message_id) };
}
