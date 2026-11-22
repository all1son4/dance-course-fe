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
  getActiveOnlineGroupCampaign,
  saveOnlineGroupSettings,
} from "@/db/online-group-campaigns";
import {
  accessEntitlements,
  inspirationHubSettings,
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
import {
  addWarsawCalendarDays,
  getStartOfNextWarsawDay,
} from "@/lib/inspiration-hub/calendar";
import { logSafeError } from "@/lib/safe-error-log";
import { normalizedSiteUrl } from "@/lib/seo";
import { pinTelegramChatMessage, sendTelegramMessage } from "@/lib/telegram/bot-api";
import {
  type PostButton,
  readPostButtons,
  renderTelegramPostHtml,
  toInlineKeyboard,
} from "@/lib/telegram/post-markup";

import {
  buildCohortClosurePost,
  buildCohortGraceReminder,
  cohortPostButtons,
  type CohortRenewalLinks,
  getGraceReminderDay,
  getPlusHubLastDay,
  toWarsawDay,
} from "./cohort-messages";

type Cohort = typeof onlineGroupCohorts.$inferSelect;

const cohortClosurePostKey = (cohortId: string) => `cohort_closure_post:${cohortId}`;
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
async function findCohortRenewalLinks(
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
  // Three independent counts: one round trip to the database instead of three.
  const [[sales], [legacyPlusHub], [continuations]] = await Promise.all([
    executor
      .select({
        plus: sql<number>`count(*) filter (where ${inArray(purchases.offerExternalId, PLUS_OFFER_IDS)})::int`,
        total: sql<number>`count(*)::int`,
        // Admin invitations: participants with amount 0, apart from the paid ones.
        invited: sql<number>`count(*) filter (where ${purchases.source} = 'admin_offer_link')::int`,
      })
      .from(purchases)
      .where(
        and(
          eq(purchases.onlineGroupCohortId, cohortId),
          eq(purchases.outcome, "succeeded"),
        ),
      ),
    executor
      .select({ count: sql<number>`count(*)::int` })
      .from(accessEntitlements)
      .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
      .where(
        and(
          eq(purchases.onlineGroupCohortId, cohortId),
          eq(accessEntitlements.accessKey, "inspiration-hub"),
          isNull(accessEntitlements.sourceKind),
        ),
      ),
    executor
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
      ),
  ]);

  return {
    continuations: continuations?.count ?? 0,
    legacyPlusHubRights: legacyPlusHub?.count ?? 0,
    invitedParticipants: sales?.invited ?? 0,
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
      const [links, facts] = await Promise.all([
        next
          ? findCohortRenewalLinks(db, {
              cohortMainChatId: cohort.mainChatId,
              nextMainChatId: next.mainChatId,
            })
          : Promise.resolve(null),
        countCohortFacts(db, cohort.id),
      ]);
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
        removesPreviousChatMembers: cohort.removesPreviousChatMembers,
        durationWeeks: cohort.durationWeeks,
        plannedEndsAt: addWarsawCalendarDays(
          cohort.startsAt,
          cohort.durationWeeks * 7,
        ).toISOString(),
        next: next
          ? {
              id: next.id,
              title: next.title,
              startsAt: next.startsAt.toISOString(),
              salesEnabled: next.salesEnabled,
            }
          : null,
        facts,
        links,
        draftPost:
          next && links && !cohort.closedAt
            ? buildCohortClosurePost({
                accessEndsAt,
                links,
                nextCohortStartsAt: next.startsAt,
                // Old-model Plus Hub rights last until the next cohort starts (HUB-D26).
                plusHubEndsOn: facts.legacyPlusHubRights > 0 ? next.startsAt : undefined,
              })
            : "",
        // What the closure window shows under the draft: the same buttons go out.
        postButtons:
          next && links && !cohort.closedAt
            ? cohortPostButtons(links, { standard: true })
            : [],
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

/** The closure post's buttons: the links of the closed cohort to its successor. */
const findClosurePostButtons = async (cohort: Cohort): Promise<PostButton[]> => {
  const db = getDatabase();
  const [next] = await db
    .select({ mainChatId: onlineGroupCohorts.mainChatId })
    .from(onlineGroupCohorts)
    .where(eq(onlineGroupCohorts.previousCohortId, cohort.id))
    .limit(1);
  if (!next) return [];
  const links = await findCohortRenewalLinks(db, {
    cohortMainChatId: cohort.mainChatId,
    nextMainChatId: next.mainChatId,
  });
  return cohortPostButtons(links, { standard: true });
};

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
  const buttons = await findClosurePostButtons(cohort);
  await enqueueOutboxJob({
    deduplicationKey,
    kind: "cohort_closure_post",
    payload: { buttons, chatId: cohort.mainChatId, pin, text },
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
/**
 * Where a renewal link created now leads: the next cohort when the current one runs
 * and its successor is recorded, so the links exist before the closure post that
 * lists them; otherwise the current cohort, as before.
 */
export async function resolveRenewalTargetChatId(activeMainChatId: string) {
  const db = getDatabase();
  const [current] = await db
    .select({ closedAt: onlineGroupCohorts.closedAt, id: onlineGroupCohorts.id })
    .from(onlineGroupCohorts)
    .where(eq(onlineGroupCohorts.mainChatId, activeMainChatId))
    .limit(1);

  if (!current || current.closedAt) return activeMainChatId;

  const [next] = await db
    .select({ mainChatId: onlineGroupCohorts.mainChatId })
    .from(onlineGroupCohorts)
    .where(
      and(
        eq(onlineGroupCohorts.previousCohortId, current.id),
        isNull(onlineGroupCohorts.closedAt),
      ),
    )
    .limit(1);

  return next?.mainChatId ?? activeMainChatId;
}

/**
 * After a closure the next cohort becomes the current one in «Настройки потока»:
 * its renewal links turn payable and new Online sales go to it. Saving those
 * settings also gives the legacy Plus Hub of the closed cohort its end, «until the
 * next start». A failure leaves the closure done; the admin then saves by hand.
 */
async function switchCampaignToNextCohort(closed: { id: string; mainChatId: string }) {
  try {
    const active = await getActiveOnlineGroupCampaign();
    if (!active || active.regularChatId !== closed.mainChatId)
      return "not_needed" as const;

    const [next] = await getDatabase()
      .select({
        mainChatId: onlineGroupCohorts.mainChatId,
        startsAt: onlineGroupCohorts.startsAt,
        title: onlineGroupCohorts.title,
      })
      .from(onlineGroupCohorts)
      .where(eq(onlineGroupCohorts.previousCohortId, closed.id))
      .limit(1);
    if (!next) return "not_needed" as const;

    await saveOnlineGroupSettings({
      inspirationChatId: active.libraryChatId,
      mainChatId: next.mainChatId,
      startsAt: next.startsAt,
      title: next.title,
    });
    return "switched" as const;
  } catch (error) {
    logSafeError("Failed to switch the Online Group settings to the next cohort", error);
    return "failed" as const;
  }
}

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
  // Before the post, so the renewal links it lists already open the payment.
  const campaignSwitch = closure.alreadyClosed
    ? ("not_needed" as const)
    : await switchCampaignToNextCohort(closure.cohort);
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
    campaignSwitch,
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
        buttons: cohortPostButtons(links, { standard: false }),
        chatId: cohort.mainChatId,
        pin: false,
        text: buildCohortGraceReminder({
          accessEndsAt: cohort.accessEndsAt,
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

/**
 * Sends a cohort chat post of the queue; a failed pin is logged, not resent. The text
 * is in the post markup and goes out as HTML, the links as buttons under it.
 */
export async function deliverCohortChatMessage(job: ClaimedOutboxJob) {
  const chatId = typeof job.payload.chatId === "string" ? job.payload.chatId : "";
  const text = typeof job.payload.text === "string" ? job.payload.text : "";
  if (!chatId || !text) {
    throw Object.assign(new Error("cohort_chat_message_invalid"), { retryable: false });
  }

  let message: Awaited<ReturnType<typeof sendTelegramMessage>>;
  try {
    message = await sendTelegramMessage({
      chatId,
      disableWebPagePreview: true,
      maxAttempts: 3,
      parseMode: "HTML",
      replyMarkup: toInlineKeyboard(readPostButtons(job.payload.buttons)),
      text: renderTelegramPostHtml(text),
    });
  } catch (error) {
    // A timeout may mean Telegram posted it anyway; sendMessage has no idempotency
    // key, so the queue must not post it again on its own (a second pinned post in
    // the cohort chat). The admin sees the failure and «Повторить» decides.
    const uncertain =
      error instanceof TypeError ||
      (error instanceof Error && error.name === "AbortError");
    if (uncertain) {
      throw Object.assign(new Error("cohort_chat_message_delivery_uncertain"), {
        retryable: false,
      });
    }
    throw error;
  }

  if (job.payload.pin === true) {
    try {
      await pinTelegramChatMessage({ chatId, messageId: message.message_id });
    } catch (error) {
      logSafeError("Cohort chat post was sent but not pinned", error);
    }
  }

  return { externalMessageId: String(message.message_id) };
}

/** HUB-D44: the switch «Удалять из чата прошлого потока» of one cohort. */
export const COHORT_DURATION_WEEKS = { max: 26, min: 1 } as const;

/**
 * «Завести следующий поток»: the record of the cohort that follows a running one.
 * Sales stay closed until the running cohort is closed; the chat must be registered
 * with /register_chat and belong to no other cohort and not be the library chat.
 */
export async function createNextCohortFromAdmin({
  durationWeeks,
  mainChatId,
  previousCohortId,
  startsAt,
  title,
}: {
  durationWeeks: number;
  mainChatId: string;
  previousCohortId: string;
  startsAt: Date;
  title: string;
}) {
  const normalizedTitle = title.replace(/\s+/g, " ").trim();
  const chatId = mainChatId.trim();

  if (!normalizedTitle || !chatId || !Number.isFinite(startsAt.getTime())) {
    throw new Error("next_cohort_incomplete");
  }
  if (
    !Number.isInteger(durationWeeks) ||
    durationWeeks < COHORT_DURATION_WEEKS.min ||
    durationWeeks > COHORT_DURATION_WEEKS.max
  ) {
    throw new Error("cohort_duration_invalid");
  }

  const db = getDatabase();

  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select({ id: onlineGroupCohorts.id, startsAt: onlineGroupCohorts.startsAt })
      .from(onlineGroupCohorts)
      .where(eq(onlineGroupCohorts.id, previousCohortId))
      .limit(1);
    if (!previous) throw new Error("cohort_not_found");
    if (startsAt.getTime() <= previous.startsAt.getTime()) {
      throw new Error("next_cohort_starts_too_early");
    }

    const [successor] = await tx
      .select({ id: onlineGroupCohorts.id })
      .from(onlineGroupCohorts)
      .where(eq(onlineGroupCohorts.previousCohortId, previous.id))
      .limit(1);
    if (successor) throw new Error("next_cohort_exists");

    const [chat] = await tx
      .select({ chatId: telegramChats.chatId, isActive: telegramChats.isActive })
      .from(telegramChats)
      .where(eq(telegramChats.chatId, chatId))
      .limit(1);
    if (!chat?.isActive) throw new Error("telegram_chat_not_registered");

    const [library] = await tx
      .select({ chatId: inspirationHubSettings.telegramChatId })
      .from(inspirationHubSettings)
      .limit(1);
    if (library?.chatId === chatId) throw new Error("next_cohort_chat_is_library");

    const [taken] = await tx
      .select({ id: onlineGroupCohorts.id })
      .from(onlineGroupCohorts)
      .where(eq(onlineGroupCohorts.mainChatId, chatId))
      .limit(1);
    if (taken) throw new Error("next_cohort_chat_taken");

    const [created] = await tx
      .insert(onlineGroupCohorts)
      .values({
        durationWeeks,
        mainChatId: chatId,
        previousCohortId: previous.id,
        startsAt,
        title: normalizedTitle,
      })
      .returning({ id: onlineGroupCohorts.id });

    return { id: created!.id };
  });
}

/** HUB-D50: the planned length of a cohort, in weeks (the admin sets it). */
export async function setCohortDurationWeeks({
  cohortId,
  durationWeeks,
}: {
  cohortId: string;
  durationWeeks: number;
}) {
  if (
    !Number.isInteger(durationWeeks) ||
    durationWeeks < COHORT_DURATION_WEEKS.min ||
    durationWeeks > COHORT_DURATION_WEEKS.max
  ) {
    throw new Error("cohort_duration_invalid");
  }

  const updated = await getDatabase()
    .update(onlineGroupCohorts)
    .set({ durationWeeks, updatedAt: new Date() })
    .where(eq(onlineGroupCohorts.id, cohortId))
    .returning({ id: onlineGroupCohorts.id });

  if (updated.length === 0) throw new Error("cohort_not_found");

  return { durationWeeks };
}

export async function setCohortPreviousChatRemoval({
  cohortId,
  enabled,
}: {
  cohortId: string;
  enabled: boolean;
}) {
  const db = getDatabase();
  const [cohort] = await db
    .select({ previousCohortId: onlineGroupCohorts.previousCohortId })
    .from(onlineGroupCohorts)
    .where(eq(onlineGroupCohorts.id, cohortId))
    .limit(1);

  if (!cohort) throw new Error("cohort_not_found");
  // Nothing to leave without a previous cohort: the switch stays off.
  if (enabled && !cohort.previousCohortId) throw new Error("cohort_has_no_previous");

  await db
    .update(onlineGroupCohorts)
    .set({ removesPreviousChatMembers: enabled, updatedAt: new Date() })
    .where(eq(onlineGroupCohorts.id, cohortId));

  return { enabled };
}
