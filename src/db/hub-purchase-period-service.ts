import { and, eq } from "drizzle-orm";

import { getDatabase } from "./client";
import { insertHubDependentPeriodInTransaction } from "./hub-dependent-period-persistence";
import { ensureHubPaymentPeriodInTransaction } from "./hub-payment-period-persistence";
import {
  lockHubPeriodOwner,
  resolveHubPeriodChainInTransaction,
} from "./hub-period-chain-resolution";
import { retryHubPeriodChainTransaction } from "./hub-period-chain-retry";
import type { HubPeriodPredecessorInput } from "./hub-period-predecessor";
import { selectHubPeriodPredecessorInTransaction } from "./hub-period-selection";
import { accessEntitlements, onlineGroupCohorts, purchases } from "./schema";
import type { DatabaseTransaction } from "./transaction";

export type EnsureHubPurchasePeriodCommand = {
  purchaseId: string;
  /** Cohort of the Standard/Plus continuation offer behind this purchase, if any. */
  continuationCohortId: string | null;
  /** Moment of processing: picks the current chain and stamps updatedAt. */
  processedAt: Date;
};

type Entitlement = typeof accessEntitlements.$inferSelect;
type Purchase = typeof purchases.$inferSelect;

const PURCHASE_INVALID = "hub_purchase_period_invalid";
const PURCHASE_CONFLICT = "hub_purchase_period_conflict";

async function readPurchase(tx: DatabaseTransaction, purchaseId: string) {
  const [purchase] = await tx
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId));
  return purchase ?? null;
}

async function lockPurchase(tx: DatabaseTransaction, purchaseId: string) {
  const [purchase] = await tx
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .for("update");

  if (!purchase) throw new Error("hub_period_chain_read_conflict");
  return purchase;
}

async function readHubRight(tx: DatabaseTransaction, purchaseId: string) {
  const [right] = await tx
    .select()
    .from(accessEntitlements)
    .where(
      and(
        eq(accessEntitlements.purchaseId, purchaseId),
        eq(accessEntitlements.accessKey, "inspiration-hub"),
      ),
    );
  return right ?? null;
}

async function readRight(tx: DatabaseTransaction, entitlementId: string) {
  const [right] = await tx
    .select()
    .from(accessEntitlements)
    .where(eq(accessEntitlements.id, entitlementId));

  if (!right) throw new Error("hub_period_chain_read_conflict");
  return right;
}

async function loadPredecessorInput(
  tx: DatabaseTransaction,
  entitlementId: string,
  telegramUserId: string,
): Promise<HubPeriodPredecessorInput> {
  const [node] = await tx
    .select({ entitlement: accessEntitlements, purchase: purchases })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
    .where(eq(accessEntitlements.id, entitlementId));

  if (!node) throw new Error("hub_period_chain_read_conflict");

  const cohortId = node.purchase.onlineGroupCohortId;
  if (node.entitlement.sourceKind !== "online_group" || cohortId === null) {
    return { telegramUserId, node, cohort: null };
  }

  const [cohort] = await tx
    .select({
      id: onlineGroupCohorts.id,
      mainChatId: onlineGroupCohorts.mainChatId,
      accessEndsAt: onlineGroupCohorts.accessEndsAt,
    })
    .from(onlineGroupCohorts)
    .where(eq(onlineGroupCohorts.id, cohortId));

  return { telegramUserId, node, cohort: cohort ?? null };
}

async function resolveAndReread(
  tx: DatabaseTransaction,
  right: Entitlement,
  telegramUserId: string,
  processedAt: Date,
): Promise<Entitlement> {
  await resolveHubPeriodChainInTransaction(tx, {
    telegramUserId,
    entitlementId: right.id,
    updatedAt: processedAt,
  });
  return readRight(tx, right.id);
}

// The same payment processed again returns the period written the first time.
async function replayStoredRight(
  tx: DatabaseTransaction,
  purchase: Purchase,
  stored: Entitlement,
  processedAt: Date,
): Promise<Entitlement> {
  if (stored.sourceKind !== "standalone_hub") throw new Error(PURCHASE_CONFLICT);

  if (stored.periodStartMode === "payment") {
    return ensureHubPaymentPeriodInTransaction(tx, {
      purchase: await lockPurchase(tx, purchase.id),
      updatedAt: processedAt,
    });
  }

  if (
    stored.periodStartMode === "after_entitlement" &&
    purchase.telegramUserId !== null
  ) {
    // A cohort may have closed since the first attempt: resolve dates if they are known now.
    return resolveAndReread(tx, stored, purchase.telegramUserId, processedAt);
  }

  throw new Error(PURCHASE_CONFLICT);
}

/**
 * Ensures the paid standalone Hub period of one successful Hub purchase.
 *
 * Without a confirmed Telegram owner the period counts from payment. With one, the
 * owner lock serializes this owner's Hub writers; the new period follows the right
 * chosen by HUB-D15 and its dates are resolved at once when the predecessor end is
 * known. A replay returns the stored right. Run in a fresh Read Committed
 * transaction; errors abort it and conflicts are retried by the database wrapper.
 * The caller has selected the Hub product; delivery checks the returned status.
 */
export async function ensureHubPurchasePeriodInTransaction(
  tx: DatabaseTransaction,
  command: EnsureHubPurchasePeriodCommand,
): Promise<Entitlement> {
  const reference = await readPurchase(tx, command.purchaseId);
  if (!reference) throw new Error(PURCHASE_INVALID);

  const owner = reference.telegramUserId;
  if (owner !== null) await lockHubPeriodOwner(tx, owner);

  const purchase = await readPurchase(tx, command.purchaseId);
  if (!purchase || purchase.telegramUserId !== owner) {
    throw new Error("hub_period_chain_read_conflict");
  }
  if (purchase.outcome !== "succeeded" || purchase.onlineGroupCohortId !== null) {
    throw new Error(PURCHASE_INVALID);
  }

  const stored = await readHubRight(tx, purchase.id);
  if (stored) return replayStoredRight(tx, purchase, stored, command.processedAt);

  const predecessorId =
    owner === null
      ? null
      : await selectHubPeriodPredecessorInTransaction(tx, {
          telegramUserId: owner,
          continuationCohortId: command.continuationCohortId,
          checkedAt: command.processedAt,
        });

  if (owner === null || predecessorId === null) {
    return ensureHubPaymentPeriodInTransaction(tx, {
      purchase: await lockPurchase(tx, purchase.id),
      updatedAt: command.processedAt,
    });
  }

  const inserted = await insertHubDependentPeriodInTransaction(tx, {
    purchase,
    predecessor: await loadPredecessorInput(tx, predecessorId, owner),
    updatedAt: command.processedAt,
  });

  return resolveAndReread(tx, inserted, owner, command.processedAt);
}

/** Runs the purchase period service in its own Read Committed transaction with retries. */
export function ensureHubPurchasePeriodInDatabase(
  command: EnsureHubPurchasePeriodCommand,
): Promise<Entitlement> {
  const db = getDatabase();

  return retryHubPeriodChainTransaction(() =>
    db.transaction((tx) => ensureHubPurchasePeriodInTransaction(tx, command), {
      isolationLevel: "read committed",
    }),
  );
}
