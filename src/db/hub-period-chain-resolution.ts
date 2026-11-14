import { asc, inArray, sql } from "drizzle-orm";

import {
  type HubPeriodChainPlan,
  planPendingHubPeriodChain,
} from "@/lib/inspiration-hub/period-chain";

import { buildHubPeriodChainInput } from "./hub-period-chain";
import {
  discoverHubPeriodChain,
  type HubPeriodChainReference,
} from "./hub-period-chain-discovery";
import { applyPendingHubPeriodDatesInTransaction } from "./hub-period-dates";
import { loadHubPeriodNodesForUpdate } from "./hub-period-nodes";
import { loadHubPredecessorCohort } from "./hub-predecessor-cohort";
import { onlineGroupCohorts } from "./schema";
import type { DatabaseTransaction } from "./transaction";

export type ResolveHubPeriodChainCommand = {
  telegramUserId: string;
  entitlementId: string;
  updatedAt: Date;
};

/**
 * Acquires the shared owner lock before cohort, purchase and entitlement locks.
 * All cooperating period writers use this key until their transaction ends.
 */
export async function lockHubPeriodOwner(
  tx: DatabaseTransaction,
  telegramUserId: string,
): Promise<void> {
  const lockKey = `hub-period-owner:${telegramUserId}`;

  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(
      hashtextextended(${lockKey}, 0)
    )`,
  );
}

function hasSameHubPeriodChainReferences(
  initialReferences: readonly HubPeriodChainReference[],
  currentReferences: readonly HubPeriodChainReference[],
): boolean {
  if (initialReferences.length !== currentReferences.length) {
    return false;
  }

  // Both discovery queries return references in entitlement ID order.
  for (let index = 0; index < initialReferences.length; index++) {
    const initial = initialReferences[index];
    const current = currentReferences[index];
    const isSameReference =
      initial.id === current.id &&
      initial.onlineGroupCohortId === current.onlineGroupCohortId &&
      initial.purchaseId === current.purchaseId &&
      initial.startsAfterEntitlementId === current.startsAfterEntitlementId;

    if (!isSameReference) {
      return false;
    }
  }

  return true;
}

async function loadReferencedHubCohortsForUpdate(
  tx: DatabaseTransaction,
  references: readonly HubPeriodChainReference[],
): Promise<(typeof onlineGroupCohorts.$inferSelect)[]> {
  const uniqueCohortIds = new Set<string>();

  for (const reference of references) {
    if (reference.onlineGroupCohortId !== null) {
      uniqueCohortIds.add(reference.onlineGroupCohortId);
    }
  }

  const cohortIds = [...uniqueCohortIds];
  if (cohortIds.length === 0) return [];

  const cohorts = await tx
    .select()
    .from(onlineGroupCohorts)
    .where(inArray(onlineGroupCohorts.id, cohortIds))
    .orderBy(asc(onlineGroupCohorts.id))
    .for("update");

  if (cohorts.length !== cohortIds.length) {
    throw new Error("hub_period_chain_read_conflict");
  }

  return cohorts;
}

/**
 * Resolves dates in a supplied Read Committed transaction, before other row locks.
 * The caller lets errors abort the transaction; a changed set needs a fresh attempt.
 */
export async function resolveHubPeriodChainInTransaction(
  tx: DatabaseTransaction,
  command: ResolveHubPeriodChainCommand,
): Promise<HubPeriodChainPlan> {
  await lockHubPeriodOwner(tx, command.telegramUserId);

  const initialReferences = await discoverHubPeriodChain(tx, command.entitlementId);
  const cohorts = await loadReferencedHubCohortsForUpdate(tx, initialReferences);

  const nodes = await loadHubPeriodNodesForUpdate(
    tx,
    initialReferences.map((ref) => ref.id),
  );

  const currentReferences = await discoverHubPeriodChain(tx, command.entitlementId);

  if (!hasSameHubPeriodChainReferences(initialReferences, currentReferences)) {
    throw new Error("hub_period_chain_read_conflict");
  }

  const root = nodes.find((node) => node.entitlement.startsAfterEntitlementId === null);
  const rootCohortId = root?.purchase.onlineGroupCohortId ?? null;
  const rootCohort = cohorts.find((item) => item.id === rootCohortId) ?? null;
  const cohort =
    root && rootCohort
      ? await loadHubPredecessorCohort(tx, {
          cohort: rootCohort,
          purchaseId: root.purchase.id,
        })
      : null;

  const chainInput = buildHubPeriodChainInput({
    telegramUserId: command.telegramUserId,
    nodes,
    cohort,
  });

  const plan = planPendingHubPeriodChain(chainInput);

  await applyPendingHubPeriodDatesInTransaction(tx, {
    telegramUserId: command.telegramUserId,
    updates: plan.updates,
    updatedAt: command.updatedAt,
  });

  return plan;
}
