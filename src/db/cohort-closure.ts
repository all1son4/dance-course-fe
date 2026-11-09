import { and, eq, exists, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getStartOfNextWarsawDay } from "@/lib/inspiration-hub/calendar";

import { getDatabase } from "./client";
import { retryHubPeriodChainTransaction } from "./hub-period-chain-retry";
import { resolveHubPeriodChainInDatabase } from "./hub-period-chain-service";
import { accessEntitlements, onlineGroupCohorts, purchases } from "./schema";
import type { DatabaseTransaction } from "./transaction";

export type CloseOnlineGroupCohortCommand = {
  cohortId: string;
  /** The cohort title typed by the admin as confirmation (HUB-D20). */
  confirmationTitle: string;
  /** The admin confirms the lessons were removed from the chat by hand. */
  lessonsCleared: boolean;
  /** Open sales of the following cohort right after closing (HUB-D27). */
  openNextCohortSales: boolean;
  closedAt: Date;
};

/** A Standard/Plus right of the closed cohort with a paid Hub period after it. */
export type CohortContinuationRoot = {
  entitlementId: string;
  telegramUserId: string | null;
};

export type CohortClosure = {
  cohort: typeof onlineGroupCohorts.$inferSelect;
  alreadyClosed: boolean;
  nextCohortSalesOpened: boolean;
  continuationRoots: CohortContinuationRoot[];
};

export type CohortContinuationResolution = {
  resolvedEntitlementIds: string[];
  failures: { entitlementId: string; reason: string }[];
};

const normalizeTitle = (value: string) => value.replace(/\s+/g, " ").trim();

const cohortPurchaseIds = (tx: DatabaseTransaction, cohortId: string) =>
  tx
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.onlineGroupCohortId, cohortId));

async function listContinuationRoots(
  tx: DatabaseTransaction,
  cohortId: string,
): Promise<CohortContinuationRoot[]> {
  const successor = alias(accessEntitlements, "successor");

  return tx
    .select({
      entitlementId: accessEntitlements.id,
      telegramUserId: purchases.telegramUserId,
    })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
    .where(
      and(
        eq(purchases.onlineGroupCohortId, cohortId),
        eq(accessEntitlements.sourceKind, "online_group"),
        eq(accessEntitlements.accessKey, "primary"),
        exists(
          tx
            .select({ id: successor.id })
            .from(successor)
            .where(eq(successor.startsAfterEntitlementId, accessEntitlements.id)),
        ),
      ),
    )
    .orderBy(accessEntitlements.id);
}

/**
 * Step 1 of closing a cohort (HUB-D19): one transaction fixes the closure, the end
 * of Standard/Plus access at the next Warsaw midnight and the end of the Hub
 * included in Plus, and switches cohort sales off. Closing is irreversible
 * (HUB-D20): a closed cohort is returned unchanged. Only period-model rights are
 * stamped; legacy rights keep their old deadline mechanism. Paid continuations
 * are resolved afterwards, owner by owner.
 */
export async function closeOnlineGroupCohortInTransaction(
  tx: DatabaseTransaction,
  command: CloseOnlineGroupCohortCommand,
): Promise<CohortClosure> {
  const [cohort] = await tx
    .select()
    .from(onlineGroupCohorts)
    .where(eq(onlineGroupCohorts.id, command.cohortId))
    .for("update");

  if (!cohort) throw new Error("cohort_closure_not_found");

  if (cohort.closedAt !== null) {
    return {
      cohort,
      alreadyClosed: true,
      nextCohortSalesOpened: false,
      continuationRoots: await listContinuationRoots(tx, cohort.id),
    };
  }

  if (normalizeTitle(command.confirmationTitle) !== normalizeTitle(cohort.title)) {
    throw new Error("cohort_closure_title_mismatch");
  }
  if (!command.lessonsCleared) {
    throw new Error("cohort_closure_lessons_not_cleared");
  }
  if (command.closedAt.getTime() < cohort.startsAt.getTime()) {
    throw new Error("cohort_closure_before_start");
  }

  const accessEndsAt = getStartOfNextWarsawDay(command.closedAt);
  const [closedCohort] = await tx
    .update(onlineGroupCohorts)
    .set({
      closedAt: command.closedAt,
      accessEndsAt,
      lessonsClearedAt: command.closedAt,
      salesEnabled: false,
      updatedAt: command.closedAt,
    })
    .where(eq(onlineGroupCohorts.id, cohort.id))
    .returning();

  await tx
    .update(accessEntitlements)
    .set({ expiresAt: accessEndsAt, updatedAt: command.closedAt })
    .where(
      and(
        eq(accessEntitlements.sourceKind, "online_group"),
        inArray(accessEntitlements.accessKey, ["primary", "inspiration-hub"]),
        inArray(accessEntitlements.purchaseId, cohortPurchaseIds(tx, cohort.id)),
      ),
    );

  let nextCohortSalesOpened = false;
  if (command.openNextCohortSales) {
    const opened = await tx
      .update(onlineGroupCohorts)
      .set({ salesEnabled: true, updatedAt: command.closedAt })
      .where(
        and(
          eq(onlineGroupCohorts.previousCohortId, cohort.id),
          isNull(onlineGroupCohorts.closedAt),
        ),
      )
      .returning({ id: onlineGroupCohorts.id });

    if (opened.length === 0) throw new Error("cohort_closure_next_cohort_missing");
    nextCohortSalesOpened = true;
  }

  return {
    cohort: closedCohort,
    alreadyClosed: false,
    nextCohortSalesOpened,
    continuationRoots: await listContinuationRoots(tx, cohort.id),
  };
}

/**
 * Step 2 of closing a cohort (HUB-D19): resolves each owner's paid continuation in
 * its own transaction with retries. One broken chain never blocks the others; it
 * is reported for the Hub admin tab and its owner stays in the Hub (the expiry
 * cron treats a stalled continuation as an error, not as a reason to remove).
 */
export async function resolveCohortContinuations(
  roots: readonly CohortContinuationRoot[],
  processedAt: Date,
): Promise<CohortContinuationResolution> {
  const result: CohortContinuationResolution = {
    resolvedEntitlementIds: [],
    failures: [],
  };

  for (const root of roots) {
    if (root.telegramUserId === null) {
      result.failures.push({
        entitlementId: root.entitlementId,
        reason: "owner_missing",
      });
      continue;
    }

    try {
      await resolveHubPeriodChainInDatabase({
        telegramUserId: root.telegramUserId,
        entitlementId: root.entitlementId,
        updatedAt: processedAt,
      });
      result.resolvedEntitlementIds.push(root.entitlementId);
    } catch (error) {
      result.failures.push({
        entitlementId: root.entitlementId,
        reason: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  if (result.failures.length > 0) {
    console.warn("Cohort closure left Hub continuations unresolved", {
      failures: result.failures,
    });
  }

  return result;
}

/** Closes a cohort (step 1 with retries), then resolves its paid continuations. */
export async function closeOnlineGroupCohortInDatabase(
  command: CloseOnlineGroupCohortCommand,
): Promise<CohortClosure & { continuations: CohortContinuationResolution }> {
  const db = getDatabase();
  const closure = await retryHubPeriodChainTransaction(() =>
    db.transaction((tx) => closeOnlineGroupCohortInTransaction(tx, command), {
      isolationLevel: "read committed",
    }),
  );

  return {
    ...closure,
    continuations: await resolveCohortContinuations(
      closure.continuationRoots,
      closure.cohort.closedAt ?? command.closedAt,
    ),
  };
}
