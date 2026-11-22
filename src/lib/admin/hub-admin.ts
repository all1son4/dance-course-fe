import { and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";

import { INSPIRATION_HUB_PRODUCT_ID } from "@/constants/sellable-products";
import { getDatabase } from "@/db/client";
import {
  findInspirationHubChatId,
  listEndedHubAccessRights,
  listOwnerlessHubPurchases,
  listStalledHubContinuations,
} from "@/db/hub-access-coverage";
import {
  accessEntitlements,
  products,
  purchases,
  telegramChats,
  telegramUserBindings,
} from "@/db/schema";
import { logSafeError } from "@/lib/safe-error-log";
import { getTelegramChatMemberCount } from "@/lib/telegram/bot-api";
import { previewHubExpiry } from "@/lib/telegram/hub-expiry-preview";
import { DAY_MS } from "@/lib/time";

const ENDING_SOON_DAYS = 7;
const PERIOD_LIST_LIMIT = 300;
const FINISHED_STATUSES: ("expired" | "revoked")[] = ["expired", "revoked"];

export type HubPeriodState = "active" | "scheduled" | "waiting" | "ended";

/** The daily cron runs at 03:00 UTC (vercel.json); the next run after `now`. */
const getNextHubCronRun = (now: Date) => {
  const next = new Date(now);
  next.setUTCHours(3, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setTime(next.getTime() + DAY_MS);
  return next;
};

const periodState = (
  right: { startsAt: Date | null; expiresAt: Date | null; status: string },
  now: Date,
): HubPeriodState => {
  if (FINISHED_STATUSES.includes(right.status as "expired")) return "ended";
  if (right.startsAt === null) return "waiting";
  if (right.startsAt.getTime() > now.getTime()) return "scheduled";
  if (right.expiresAt !== null && right.expiresAt.getTime() <= now.getTime())
    return "ended";
  return "active";
};

/**
 * Everything the Inspiration Hub tab shows: the chat, sales, the paid periods with a
 * plain state each, the problems the cron reports (К5, К6, К13) and whom the next
 * cron run would remove, computed by the cron's own code in a rolled-back preview.
 */
export async function getHubAdminOverview({
  now = new Date(),
  previewAt,
}: { now?: Date; previewAt?: Date } = {}) {
  const db = getDatabase();
  const nextCronAt = getNextHubCronRun(now);
  // Every query is a round trip to the database, so the independent ones go at once;
  // the cron preview is the longest and runs alongside the rest.
  const [hubChatId, [product], rows, ownerless, stalled, preview] = await Promise.all([
    findInspirationHubChatId(db),
    db
      .select({ salesEnabled: products.salesEnabled })
      .from(products)
      .where(eq(products.externalProductId, INSPIRATION_HUB_PRODUCT_ID)),
    db
      .select({
        entitlementId: accessEntitlements.id,
        status: accessEntitlements.status,
        startsAt: accessEntitlements.startsAt,
        expiresAt: accessEntitlements.expiresAt,
        periodStartMode: accessEntitlements.periodStartMode,
        rightOwner: accessEntitlements.telegramUserId,
        purchaseOwner: purchases.telegramUserId,
        paymentIntentId: purchases.paymentIntentId,
        customerName: purchases.customerFullNameSnapshot,
        customerEmail: purchases.customerEmailSnapshot,
        offerLabel: purchases.offerLabelSnapshot,
        offerId: purchases.offerExternalId,
        amountMinor: purchases.amountMinor,
        currency: purchases.currency,
        paidAt: purchases.succeededAt,
        source: purchases.source,
      })
      .from(accessEntitlements)
      .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
      .where(
        and(
          eq(accessEntitlements.sourceKind, "standalone_hub"),
          eq(purchases.outcome, "succeeded"),
          isNull(accessEntitlements.revokedAt),
        ),
      )
      .orderBy(desc(purchases.succeededAt))
      .limit(PERIOD_LIST_LIMIT),
    listOwnerlessHubPurchases(db, { checkedAt: now }),
    listStalledHubContinuations(db),
    previewHubExpiry(db, { at: previewAt ?? nextCronAt }),
  ]);

  const owners = [
    ...new Set(
      rows
        .map((row) => row.rightOwner ?? row.purchaseOwner)
        .filter((id): id is string => !!id),
    ),
  ];
  const [[chat], usernames, ended] = await Promise.all([
    hubChatId
      ? db
          .select({ title: telegramChats.title })
          .from(telegramChats)
          .where(eq(telegramChats.chatId, hubChatId))
      : Promise.resolve([] as { title: string | null }[]),
    owners.length
      ? db
          .selectDistinctOn([telegramUserBindings.telegramUserId], {
            telegramUserId: telegramUserBindings.telegramUserId,
            telegramUsername: telegramUserBindings.telegramUsername,
          })
          .from(telegramUserBindings)
          .where(inArray(telegramUserBindings.telegramUserId, owners))
          .orderBy(
            telegramUserBindings.telegramUserId,
            desc(telegramUserBindings.updatedAt),
          )
      : Promise.resolve(
          [] as { telegramUserId: string; telegramUsername: string | null }[],
        ),
    listEndedHubAccessRights(db, { checkedAt: now, hubChatId }),
  ]);
  const usernameOf = new Map(
    usernames.map((row) => [row.telegramUserId, row.telegramUsername]),
  );

  const periods = rows.map((row) => {
    const owner = row.rightOwner ?? row.purchaseOwner;
    return {
      paymentIntentId: row.paymentIntentId,
      customerName: row.customerName ?? "",
      customerEmail: row.customerEmail ?? "",
      offerLabel: row.offerLabel ?? "",
      amountMinor: row.amountMinor,
      currency: row.currency,
      paidAt: row.paidAt?.toISOString() ?? null,
      // An admin invitation: amount 0, no Stripe purchase behind it.
      byInvitation: row.source === "admin_offer_link",
      startsAt: row.startsAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      telegramUserId: owner,
      telegramUsername: (owner && usernameOf.get(owner)) || null,
      state: periodState(row, now),
      afterCohort: row.periodStartMode === "after_entitlement",
    };
  });
  const endingSoonBefore = now.getTime() + ENDING_SOON_DAYS * DAY_MS;

  return {
    generatedAt: now.toISOString(),
    chat: hubChatId ? { chatId: hubChatId, title: chat?.title ?? hubChatId } : null,
    salesEnabled: product?.salesEnabled ?? false,
    counts: {
      active: periods.filter((period) => period.state === "active").length,
      scheduled: periods.filter(
        (period) => period.state === "scheduled" || period.state === "waiting",
      ).length,
      endingSoon: periods.filter(
        (period) =>
          period.state === "active" &&
          period.expiresAt !== null &&
          Date.parse(period.expiresAt) <= endingSoonBefore,
      ).length,
    },
    problems: {
      settingsMissing: hubChatId === null,
      ownerlessPaymentIntentIds: ownerless,
      stalledPaymentIntentIds: stalled,
      endedOwnerlessPaymentIntentIds: ended
        .filter((right) => right.telegramUserId === null)
        .map((right) => right.paymentIntentId),
    },
    nextCronAt: nextCronAt.toISOString(),
    preview: {
      at: preview.at,
      removals: preview.removals,
    },
    periods,
  };
}

export type HubAdminOverview = Awaited<ReturnType<typeof getHubAdminOverview>>;

/** Standalone Hub periods still running, for the overview tiles. */
export async function countRunningHubPeriods(now = new Date()) {
  const db = getDatabase();
  const rows = await db
    .select({
      startsAt: accessEntitlements.startsAt,
      expiresAt: accessEntitlements.expiresAt,
      status: accessEntitlements.status,
    })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
    .where(
      and(
        eq(accessEntitlements.sourceKind, "standalone_hub"),
        eq(purchases.outcome, "succeeded"),
        isNull(accessEntitlements.revokedAt),
        notInArray(accessEntitlements.status, FINISHED_STATUSES),
      ),
    );
  const endingSoonBefore = now.getTime() + ENDING_SOON_DAYS * DAY_MS;
  const states = rows.map((row) => ({ ...row, state: periodState(row, now) }));

  return {
    active: states.filter((row) => row.state === "active").length,
    endingSoon: states.filter(
      (row) =>
        row.state === "active" &&
        row.expiresAt !== null &&
        row.expiresAt.getTime() <= endingSoonBefore,
    ).length,
    scheduled: states.filter(
      (row) => row.state === "scheduled" || row.state === "waiting",
    ).length,
  };
}

/**
 * «Сейчас в группе»: Telegram's own member count of the Hub chat (Anna, admins and
 * the bot included) and how many accounts are in it by our records (active bindings).
 * Telegram's answer is null when it does not answer; the tab says so.
 */
export async function readHubChatMembers(hubChatId: string) {
  const [telegram, [records]] = await Promise.all([
    getTelegramChatMemberCount({ chatId: hubChatId }).catch((error: unknown) => {
      logSafeError("Failed to count the Inspiration Hub chat members", error, {
        severity: "warning",
      });
      return null;
    }),
    getDatabase()
      .select({
        count: sql<number>`count(DISTINCT ${telegramUserBindings.telegramUserId})::int`,
      })
      .from(telegramUserBindings)
      .where(
        and(
          eq(telegramUserBindings.chatId, hubChatId),
          eq(telegramUserBindings.status, "active"),
          isNull(telegramUserBindings.revokedAt),
        ),
      ),
  ]);

  return { telegram, withAccess: records?.count ?? 0 };
}

export type HubChatMembers = Awaited<ReturnType<typeof readHubChatMembers>>;
