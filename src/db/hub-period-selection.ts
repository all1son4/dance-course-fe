import { and, desc, eq, isNull, ne, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { accessEntitlements, purchases } from "./schema";
import type { DatabaseTransaction } from "./transaction";

export type HubPeriodPredecessorSelection = {
  telegramUserId: string;
  /** Cohort of the Standard/Plus continuation offer the buyer came from, if any. */
  continuationCohortId: string | null;
  checkedAt: Date;
};

const SELECTION_AMBIGUOUS = "hub_period_selection_ambiguous";

// A right with no paid period attached after it yet.
function hasNoSuccessor(tx: DatabaseTransaction) {
  const successor = alias(accessEntitlements, "successor");

  return notExists(
    tx
      .select({ id: successor.id })
      .from(successor)
      .where(eq(successor.startsAfterEntitlementId, accessEntitlements.id)),
  );
}

const isUsablePaidRight = and(
  isNull(accessEntitlements.revokedAt),
  ne(accessEntitlements.status, "revoked"),
  eq(purchases.outcome, "succeeded"),
);

/**
 * Picks the right a new paid Hub period must follow (HUB-D15).
 *
 * 1. The owner's current standalone chain wins: the tail of a chain that is still
 *    awaiting dates or ends after checkedAt. An awaiting tail counts as the latest.
 * 2. Otherwise the owner's Standard/Plus primary right in the continuation cohort.
 * 3. Otherwise null: the period counts from payment.
 *
 * Reads without row locks. The caller holds the owner lock, so no cooperating writer
 * can extend this owner's chains meanwhile, and the full history is revalidated
 * under row locks when the new period's dates are resolved.
 */
export async function selectHubPeriodPredecessorInTransaction(
  tx: DatabaseTransaction,
  selection: HubPeriodPredecessorSelection,
): Promise<string | null> {
  const standaloneTails = await tx
    .select({
      id: accessEntitlements.id,
      startsAt: accessEntitlements.startsAt,
      expiresAt: accessEntitlements.expiresAt,
    })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
    .where(
      and(
        eq(accessEntitlements.sourceKind, "standalone_hub"),
        eq(purchases.telegramUserId, selection.telegramUserId),
        isUsablePaidRight,
        hasNoSuccessor(tx),
      ),
    );

  const awaitingTails = standaloneTails.filter(
    (tail) => tail.startsAt === null && tail.expiresAt === null,
  );

  if (awaitingTails.length > 1) {
    throw new Error(SELECTION_AMBIGUOUS);
  }

  if (awaitingTails.length === 1) {
    return awaitingTails[0].id;
  }

  let currentTail: { id: string; endsAtMs: number } | null = null;

  for (const tail of standaloneTails) {
    const endsAtMs = tail.expiresAt?.getTime() ?? null;

    if (
      endsAtMs !== null &&
      endsAtMs > selection.checkedAt.getTime() &&
      (currentTail === null || endsAtMs > currentTail.endsAtMs)
    ) {
      currentTail = { id: tail.id, endsAtMs };
    }
  }

  if (currentTail) {
    return currentTail.id;
  }

  if (selection.continuationCohortId === null) {
    return null;
  }

  const [primary] = await tx
    .select({ id: accessEntitlements.id })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
    .where(
      and(
        eq(purchases.onlineGroupCohortId, selection.continuationCohortId),
        eq(purchases.telegramUserId, selection.telegramUserId),
        eq(accessEntitlements.accessKey, "primary"),
        eq(accessEntitlements.sourceKind, "online_group"),
        isUsablePaidRight,
        hasNoSuccessor(tx),
      ),
    )
    // A free admin grant has no payment time; a paid purchase of the cohort wins.
    .orderBy(sql`${purchases.succeededAt} DESC NULLS LAST`, desc(purchases.firstSeenAt))
    .limit(1);

  return primary?.id ?? null;
}
