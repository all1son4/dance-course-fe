import { and, desc, eq, gt, isNotNull, isNull, lte, ne, or } from "drizzle-orm";

import { isHubAccessRightActive } from "@/lib/inspiration-hub/access-state";
import { addWarsawCalendarDays } from "@/lib/inspiration-hub/calendar";

import { getDatabase } from "./client";
import {
  accessEntitlements,
  hubDiscountVerifications,
  onlineGroupCohorts,
  purchases,
} from "./schema";
import type { DatabaseExecutor } from "./transaction";

/** HUB-D36: a cohort's chat still grants the discount this many calendar days. */
const ENDED_COHORT_DISCOUNT_DAYS = 7;
const VERIFICATION_TTL_MS = 60 * 60 * 1000;

export type HubDiscountCohort = { id: string; mainChatId: string };

export type HubDiscountBasis =
  { basis: "active_hub"; cohortId: null } | { basis: "cohort_chat"; cohortId: string };

export type HubDiscountVerification = typeof hubDiscountVerifications.$inferSelect;

/**
 * Basis 1 (HUB-D17): a paid standalone Hub period of this Telegram account is
 * running right now. A period still waiting for its dates does not count yet.
 */
export async function hasActiveStandaloneHub(
  executor: DatabaseExecutor,
  { checkedAt, telegramUserId }: { checkedAt: Date; telegramUserId: string },
): Promise<boolean> {
  const periods = await executor
    .select({
      periodStartMode: accessEntitlements.periodStartMode,
      startsAt: accessEntitlements.startsAt,
      expiresAt: accessEntitlements.expiresAt,
    })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
    .where(
      and(
        eq(accessEntitlements.sourceKind, "standalone_hub"),
        eq(purchases.outcome, "succeeded"),
        isNull(accessEntitlements.revokedAt),
        ne(accessEntitlements.status, "revoked"),
        or(
          eq(accessEntitlements.telegramUserId, telegramUserId),
          and(
            isNull(accessEntitlements.telegramUserId),
            eq(purchases.telegramUserId, telegramUserId),
          ),
        ),
      ),
    );

  return periods.some((period) =>
    isHubAccessRightActive({ ...period, sourceKind: "standalone_hub" }, checkedAt),
  );
}

/**
 * Bases 2 and 3 (HUB-D17, HUB-D36), in this order: the latest cohort that has
 * started, then every cohort whose boundary passed at most 7 calendar days ago.
 * Older cohorts never grant the discount.
 */
export async function listHubDiscountCohorts(
  executor: DatabaseExecutor,
  checkedAt: Date,
): Promise<HubDiscountCohort[]> {
  const [latestStarted] = await executor
    .select({ id: onlineGroupCohorts.id, mainChatId: onlineGroupCohorts.mainChatId })
    .from(onlineGroupCohorts)
    .where(lte(onlineGroupCohorts.startsAt, checkedAt))
    .orderBy(desc(onlineGroupCohorts.startsAt))
    .limit(1);
  // A generous lower bound; the calendar rule below decides.
  const searchFrom = new Date(
    checkedAt.getTime() - (ENDED_COHORT_DISCOUNT_DAYS + 2) * 24 * 60 * 60 * 1000,
  );
  const recentlyEnded = await executor
    .select({
      id: onlineGroupCohorts.id,
      mainChatId: onlineGroupCohorts.mainChatId,
      accessEndsAt: onlineGroupCohorts.accessEndsAt,
    })
    .from(onlineGroupCohorts)
    .where(
      and(
        isNotNull(onlineGroupCohorts.accessEndsAt),
        lte(onlineGroupCohorts.accessEndsAt, checkedAt),
        gt(onlineGroupCohorts.accessEndsAt, searchFrom),
      ),
    )
    .orderBy(desc(onlineGroupCohorts.accessEndsAt));

  const cohorts = latestStarted ? [latestStarted] : [];

  for (const cohort of recentlyEnded) {
    if (
      cohort.accessEndsAt &&
      addWarsawCalendarDays(cohort.accessEndsAt, ENDED_COHORT_DISCOUNT_DAYS).getTime() >=
        checkedAt.getTime() &&
      !cohorts.some((known) => known.id === cohort.id)
    ) {
      cohorts.push({ id: cohort.id, mainChatId: cohort.mainChatId });
    }
  }

  return cohorts;
}

/**
 * Re-checks a recorded basis from the database alone, without asking Telegram again:
 * at payment creation the active Hub must still run and the cohort must still count.
 */
export async function isHubDiscountBasisStillValid(
  executor: DatabaseExecutor,
  {
    basis,
    checkedAt,
    telegramUserId,
  }: { basis: HubDiscountBasis; checkedAt: Date; telegramUserId: string },
): Promise<boolean> {
  if (basis.basis === "active_hub") {
    return hasActiveStandaloneHub(executor, { checkedAt, telegramUserId });
  }

  const cohorts = await listHubDiscountCohorts(executor, checkedAt);
  return cohorts.some((cohort) => cohort.id === basis.cohortId);
}

export type RecordHubDiscountVerificationInput = {
  checkoutSessionId: string;
  telegramUserId: string;
  telegramUsername: string | null;
  status: "verified" | "not_member" | "failed";
  basis: HubDiscountBasis | null;
  lastError: string | null;
  now?: Date;
};

/** One row per checkout session; a new check replaces the previous result. */
export async function recordHubDiscountVerification(
  input: RecordHubDiscountVerificationInput,
): Promise<HubDiscountVerification> {
  const now = input.now ?? new Date();
  const values = {
    telegramUserId: input.telegramUserId,
    telegramUsername: input.telegramUsername || null,
    basis: input.basis?.basis ?? null,
    cohortId: input.basis?.cohortId ?? null,
    status: input.status,
    verifiedAt: input.status === "verified" ? now : null,
    expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
    lastError: input.lastError,
    updatedAt: now,
  };
  const [row] = await getDatabase()
    .insert(hubDiscountVerifications)
    .values({ checkoutSessionId: input.checkoutSessionId, ...values })
    .onConflictDoUpdate({
      target: hubDiscountVerifications.checkoutSessionId,
      set: values,
    })
    .returning();

  if (!row) throw new Error("hub_discount_verification_not_recorded");
  return row;
}

/** The passed, unexpired check of this checkout session, if any. */
export async function findValidHubDiscountVerification(
  checkoutSessionId: string,
  now = new Date(),
): Promise<(HubDiscountVerification & { discount: HubDiscountBasis }) | null> {
  const [row] = await getDatabase()
    .select()
    .from(hubDiscountVerifications)
    .where(
      and(
        eq(hubDiscountVerifications.checkoutSessionId, checkoutSessionId.trim()),
        eq(hubDiscountVerifications.status, "verified"),
        gt(hubDiscountVerifications.expiresAt, now),
      ),
    );

  if (!row?.basis) return null;
  if (row.basis === "cohort_chat") {
    return row.cohortId
      ? { ...row, discount: { basis: "cohort_chat", cohortId: row.cohortId } }
      : null;
  }
  return { ...row, discount: { basis: "active_hub", cohortId: null } };
}
