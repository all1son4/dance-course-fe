import { and, eq } from "drizzle-orm";

import {
  buildHubPaymentPeriodValues,
  type HubPaymentPeriodValues,
} from "./hub-payment-period";
import { accessEntitlements, type purchases } from "./schema";
import type { DatabaseTransaction } from "./transaction";

export type EnsureHubPaymentPeriodCommand = {
  purchase: typeof purchases.$inferSelect;
  updatedAt: Date;
};

const matchesHubPaymentPeriod = (
  existing: typeof accessEntitlements.$inferSelect,
  expected: HubPaymentPeriodValues,
): boolean => {
  const hasMatchingDates =
    existing.startsAt !== null &&
    existing.expiresAt !== null &&
    existing.startsAt.getTime() === expected.startsAt.getTime() &&
    existing.expiresAt.getTime() === expected.expiresAt.getTime();

  return (
    hasMatchingDates &&
    existing.purchaseId === expected.purchaseId &&
    existing.accessKey === expected.accessKey &&
    existing.sourceKind === expected.sourceKind &&
    existing.periodStartMode === expected.periodStartMode &&
    existing.paidDurationDays === expected.paidDurationDays &&
    existing.startsAfterEntitlementId === expected.startsAfterEntitlementId
  );
};

/**
 * Persists payment-mode fields after product/mode selection by the caller.
 * Requires a fresh purchase snapshot locked in this Read Committed transaction,
 * after owner/cohort/purchase coordination and before unrelated entitlement locks.
 * A replay returns the stored right unchanged, including a revoked one: callers
 * must check revokedAt and status before issuing an invite.
 */
export const ensureHubPaymentPeriodInTransaction = async (
  tx: DatabaseTransaction,
  command: EnsureHubPaymentPeriodCommand,
): Promise<typeof accessEntitlements.$inferSelect> => {
  const expected = buildHubPaymentPeriodValues(command.purchase);

  const [insertedEntitlement] = await tx
    .insert(accessEntitlements)
    .values({
      ...expected,
      customerId: command.purchase.customerId,
      productId: command.purchase.productId,
      offerId: command.purchase.offerId,
      telegramUserId: command.purchase.telegramUserId,
      status: "pending",
      deliveryChannel: "telegram",
      externalTargetType: "telegram_chat",
      updatedAt: command.updatedAt,
    })
    .onConflictDoNothing({
      target: [accessEntitlements.purchaseId, accessEntitlements.accessKey],
    })
    .returning();

  if (insertedEntitlement) {
    return insertedEntitlement;
  }

  const [existingEntitlement] = await tx
    .select()
    .from(accessEntitlements)
    .where(
      and(
        eq(accessEntitlements.purchaseId, expected.purchaseId),
        eq(accessEntitlements.accessKey, expected.accessKey),
      ),
    )
    .for("update");

  if (!existingEntitlement) {
    throw new Error("hub_payment_period_write_conflict");
  }

  const isCompatible = matchesHubPaymentPeriod(existingEntitlement, expected);

  if (!isCompatible) {
    throw new Error("hub_payment_period_conflict");
  }

  if (
    existingEntitlement.telegramUserId !== null &&
    existingEntitlement.telegramUserId !== command.purchase.telegramUserId
  ) {
    throw new Error("hub_payment_period_conflict");
  }

  return existingEntitlement;
};
