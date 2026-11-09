import {
  buildHubDependentPeriodValues,
  type HubDependentPeriodInput,
} from "./hub-dependent-period";
import { accessEntitlements, type purchases } from "./schema";
import type { DatabaseTransaction } from "./transaction";

export type InsertHubDependentPeriodCommand = {
  purchase: typeof purchases.$inferSelect;
  predecessor: HubDependentPeriodInput["predecessor"];
  updatedAt: Date;
};

// Another writer attached a period to the same predecessor or wrote this purchase's
// right first. A fresh attempt reselects the tail or replays the stored right.
const RACED_UNIQUE_CONSTRAINTS = new Set([
  "access_entitlements_starts_after_idx",
  "access_entitlements_purchase_key_idx",
]);

function getUniqueViolationConstraint(error: unknown): string | null {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const candidate = current as Error & { code?: unknown; constraint_name?: unknown };

    if (candidate.code === "23505" && typeof candidate.constraint_name === "string") {
      return candidate.constraint_name;
    }

    current = current.cause;
  }

  return null;
}

/**
 * Inserts a new paid Hub period that starts after an existing right (HUB-01T values).
 * Both dates stay null here; the caller resolves the chain in the same transaction.
 * The caller holds the owner lock and has checked that the purchase has no Hub right.
 */
export async function insertHubDependentPeriodInTransaction(
  tx: DatabaseTransaction,
  command: InsertHubDependentPeriodCommand,
): Promise<typeof accessEntitlements.$inferSelect> {
  const values = buildHubDependentPeriodValues({
    purchase: command.purchase,
    predecessor: command.predecessor,
  });

  try {
    const [inserted] = await tx
      .insert(accessEntitlements)
      .values({
        ...values,
        customerId: command.purchase.customerId,
        productId: command.purchase.productId,
        offerId: command.purchase.offerId,
        telegramUserId: command.purchase.telegramUserId,
        status: "pending",
        deliveryChannel: "telegram",
        externalTargetType: "telegram_chat",
        updatedAt: command.updatedAt,
      })
      .returning();

    return inserted;
  } catch (error) {
    const constraint = getUniqueViolationConstraint(error);

    if (constraint !== null && RACED_UNIQUE_CONSTRAINTS.has(constraint)) {
      // No cause: a wrapped database code would make the retry policy refuse it.
      throw new Error("hub_period_chain_write_conflict");
    }

    throw error;
  }
}
