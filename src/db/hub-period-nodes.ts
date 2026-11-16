import { asc, inArray } from "drizzle-orm";

import { accessEntitlements, purchases } from "./schema";
import type { DatabaseTransaction } from "./transaction";

export type HubPeriodNodeSnapshot = {
  entitlement: typeof accessEntitlements.$inferSelect;
  purchase: typeof purchases.$inferSelect;
};

/**
 * Locks the supplied set: all purchases by ID, then all entitlements by ID.
 * The caller coordinates chain membership and validates the returned rows.
 * Locks remain held until the supplied transaction ends.
 */
export async function loadHubPeriodNodesForUpdate(
  tx: DatabaseTransaction,
  entitlementIds: readonly string[],
): Promise<HubPeriodNodeSnapshot[]> {
  const entitlementUniqueIds = [...new Set(entitlementIds)];

  if (entitlementUniqueIds.length === 0) return [];

  const entitlementReferences = await tx
    .select({ id: accessEntitlements.id, purchaseId: accessEntitlements.purchaseId })
    .from(accessEntitlements)
    .where(inArray(accessEntitlements.id, entitlementUniqueIds));

  if (entitlementUniqueIds.length !== entitlementReferences.length) {
    throw new Error("hub_period_chain_read_conflict");
  }

  const purchaseIdByEntitlementId = new Map<string, string>();
  const purchaseIdSet = new Set<string>();

  for (const reference of entitlementReferences) {
    purchaseIdByEntitlementId.set(reference.id, reference.purchaseId);
    purchaseIdSet.add(reference.purchaseId);
  }

  const purchaseIds = [...purchaseIdSet];

  const lockedPurchases = await tx
    .select()
    .from(purchases)
    .where(inArray(purchases.id, purchaseIds))
    .orderBy(asc(purchases.id))
    .for("update");

  if (lockedPurchases.length !== purchaseIds.length) {
    throw new Error("hub_period_chain_read_conflict");
  }

  const purchasesById = new Map<string, typeof purchases.$inferSelect>();

  for (const purchase of lockedPurchases) {
    purchasesById.set(purchase.id, purchase);
  }

  const lockedEntitlements = await tx
    .select()
    .from(accessEntitlements)
    .where(inArray(accessEntitlements.id, entitlementUniqueIds))
    .orderBy(asc(accessEntitlements.id))
    .for("update");

  if (lockedEntitlements.length !== entitlementUniqueIds.length) {
    throw new Error("hub_period_chain_read_conflict");
  }

  const nodes: HubPeriodNodeSnapshot[] = [];

  for (const entitlement of lockedEntitlements) {
    const originalPurchaseId = purchaseIdByEntitlementId.get(entitlement.id);
    const purchase = purchasesById.get(entitlement.purchaseId);

    if (originalPurchaseId !== entitlement.purchaseId || !purchase) {
      throw new Error("hub_period_chain_read_conflict");
    }

    nodes.push({
      entitlement,
      purchase,
    });
  }

  return nodes;
}
