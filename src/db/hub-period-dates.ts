import { and, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";

import type { HubPeriodDateUpdate } from "@/lib/inspiration-hub/period-chain";

import { accessEntitlements, purchases } from "./schema";
import type { DatabaseTransaction } from "./transaction";

export type ApplyPendingHubPeriodDatesCommand = {
  telegramUserId: string;
  updates: readonly HubPeriodDateUpdate[];
  updatedAt: Date;
};

/**
 * Applies a trusted plan after the caller locks and validates the chain.
 * The caller must let conflicts reject the transaction to roll back all writes.
 */
export async function applyPendingHubPeriodDatesInTransaction(
  tx: DatabaseTransaction,
  command: ApplyPendingHubPeriodDatesCommand,
): Promise<void> {
  const eligiblePurchaseIds = tx
    .select({ id: purchases.id })
    .from(purchases)
    .where(
      and(
        eq(purchases.telegramUserId, command.telegramUserId),
        eq(purchases.outcome, "succeeded"),
        isNotNull(purchases.succeededAt),
        isNull(purchases.onlineGroupCohortId),
      ),
    );

  for (const update of command.updates) {
    const [updatedEntitlement] = await tx
      .update(accessEntitlements)
      .set({
        startsAt: update.startsAt,
        expiresAt: update.expiresAt,
        updatedAt: command.updatedAt,
      })
      .where(
        and(
          eq(accessEntitlements.id, update.entitlementId),
          eq(accessEntitlements.sourceKind, "standalone_hub"),
          eq(accessEntitlements.periodStartMode, "after_entitlement"),
          isNull(accessEntitlements.startsAt),
          isNull(accessEntitlements.expiresAt),
          isNull(accessEntitlements.revokedAt),
          ne(accessEntitlements.status, "revoked"),
          or(
            isNull(accessEntitlements.telegramUserId),
            eq(accessEntitlements.telegramUserId, command.telegramUserId),
          ),
          inArray(accessEntitlements.purchaseId, eligiblePurchaseIds),
        ),
      )
      .returning({
        id: accessEntitlements.id,
      });

    if (!updatedEntitlement) {
      throw new Error("hub_period_chain_write_conflict");
    }
  }
}
