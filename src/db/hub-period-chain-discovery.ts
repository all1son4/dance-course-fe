import { sql } from "drizzle-orm";

import { accessEntitlements, purchases } from "./schema";
import type { DatabaseTransaction } from "./transaction";

export type HubPeriodChainReference = Pick<
  typeof accessEntitlements.$inferSelect,
  "id" | "purchaseId" | "startsAfterEntitlementId"
> &
  Pick<typeof purchases.$inferSelect, "onlineGroupCohortId">;

/**
 * Discovers the connected set in one statement without locking or filtering it.
 * The caller coordinates writers, locks the set and revalidates its full history.
 */
export async function discoverHubPeriodChain(
  tx: DatabaseTransaction,
  entitlementId: string,
): Promise<HubPeriodChainReference[]> {
  const rows = await tx.execute<HubPeriodChainReference>(sql`
    WITH RECURSIVE connected_ids AS (
      SELECT seed.id
      FROM ${accessEntitlements} AS seed
      WHERE seed.id = ${entitlementId}

      UNION

      SELECT neighbor.id
      FROM connected_ids
      JOIN ${accessEntitlements} AS current_entitlement
        ON current_entitlement.id = connected_ids.id
      JOIN ${accessEntitlements} AS neighbor
        ON neighbor.id = current_entitlement.starts_after_entitlement_id
        OR neighbor.starts_after_entitlement_id = current_entitlement.id
    )
    SELECT
      entitlement.id,
      entitlement.purchase_id AS "purchaseId",
      entitlement.starts_after_entitlement_id AS "startsAfterEntitlementId",
      purchase.online_group_cohort_id AS "onlineGroupCohortId"
    FROM connected_ids
    JOIN ${accessEntitlements} AS entitlement
      ON entitlement.id = connected_ids.id
    JOIN ${purchases} AS purchase
      ON purchase.id = entitlement.purchase_id
    ORDER BY entitlement.id ASC
  `);

  if (rows.length === 0) {
    throw new Error("hub_period_chain_read_conflict");
  }

  return [...rows];
}
