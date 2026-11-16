import { and, eq, isNull, ne } from "drizzle-orm";

import { isOnlineGroupLibraryOfferId } from "@/constants/sellable-products";
import { getOnlineGroupIdentityReuseLookup } from "@/lib/telegram/identity-reuse-policy";

import { getDatabase } from "./client";
import { ensurePlusHubBridgeInTransaction } from "./hub-bridge";
import { lockHubPeriodOwner } from "./hub-period-chain-resolution";
import { retryHubPeriodChainTransaction } from "./hub-period-chain-retry";
import { ensureHubPurchasePeriodInTransaction } from "./hub-purchase-period-service";
import {
  accessEntitlements,
  inspirationHubSettings,
  purchases,
  telegramUserBindings,
} from "./schema";
import type { DatabaseTransaction } from "./transaction";

type Purchase = typeof purchases.$inferSelect;
type Entitlement = typeof accessEntitlements.$inferSelect;

/** "mismatch": the purchase already names another Telegram account; nothing was written. */
export type PurchaseOwnerWrite = "written" | "unchanged" | "mismatch";

export type OnlineGroupPurchaseSourceCommand = {
  purchaseId: string;
  /** The cohort the payment was sold into, from the payment data. */
  cohortId: string;
  /** Telegram account confirmed before payment (renewal), if any. */
  verifiedTelegramUserId: string | null;
  processedAt?: Date;
};

export type HubPurchaseAccessCommand = {
  purchaseId: string;
  /** Telegram account confirmed before payment (discounted Hub), if any. */
  verifiedTelegramUserId: string | null;
  /** The cohort whose chat granted the discount; null for full price or an active Hub. */
  continuationCohortId: string | null;
  processedAt: Date;
};

export type HubPurchaseAccess = {
  right: Entitlement;
  ownerWrite: PurchaseOwnerWrite | null;
  /** The customer sits in the Hub under several accounts, so none was taken. */
  ambiguousKnownOwner: boolean;
};

async function lockPurchase(tx: DatabaseTransaction, purchaseId: string) {
  const [purchase] = await tx
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .for("update");

  if (!purchase || purchase.outcome !== "succeeded") {
    throw new Error("purchase_access_purchase_invalid");
  }
  return purchase;
}

/**
 * Writes the purchase owner only into an empty field. The caller holds the owner lock
 * (`lockHubPeriodOwner`) so the Hub period writers of this account see one state.
 */
export async function recordPurchaseTelegramOwnerInTransaction(
  tx: DatabaseTransaction,
  purchaseId: string,
  telegramUserId: string,
): Promise<PurchaseOwnerWrite> {
  const [written] = await tx
    .update(purchases)
    .set({ telegramUserId })
    .where(and(eq(purchases.id, purchaseId), isNull(purchases.telegramUserId)))
    .returning({ id: purchases.id });

  if (written) return "written";

  const [current] = await tx
    .select({ telegramUserId: purchases.telegramUserId })
    .from(purchases)
    .where(eq(purchases.id, purchaseId));

  return current?.telegramUserId === telegramUserId ? "unchanged" : "mismatch";
}

/**
 * An Online Group purchase joins the period model: the purchase names its cohort and
 * its `primary` right becomes `online_group`. A Plus purchase's `inspiration-hub`
 * right stays unclassified on purpose (handoff, step А4).
 */
export async function recordOnlineGroupPurchaseSourceInTransaction(
  tx: DatabaseTransaction,
  command: OnlineGroupPurchaseSourceCommand,
): Promise<PurchaseOwnerWrite | null> {
  const owner = command.verifiedTelegramUserId;
  if (owner !== null) await lockHubPeriodOwner(tx, owner);

  const purchase = await lockPurchase(tx, command.purchaseId);

  if (
    purchase.onlineGroupCohortId !== null &&
    purchase.onlineGroupCohortId !== command.cohortId
  ) {
    throw new Error("purchase_access_cohort_conflict");
  }
  if (purchase.onlineGroupCohortId === null) {
    await tx
      .update(purchases)
      .set({ onlineGroupCohortId: command.cohortId })
      .where(eq(purchases.id, purchase.id));
  }

  const [primary] = await tx
    .select({ id: accessEntitlements.id, sourceKind: accessEntitlements.sourceKind })
    .from(accessEntitlements)
    .where(
      and(
        eq(accessEntitlements.purchaseId, purchase.id),
        eq(accessEntitlements.accessKey, "primary"),
      ),
    )
    .for("update");

  if (!primary) throw new Error("purchase_access_primary_missing");
  if (primary.sourceKind !== null && primary.sourceKind !== "online_group") {
    throw new Error("purchase_access_primary_conflict");
  }
  if (primary.sourceKind === null) {
    await tx
      .update(accessEntitlements)
      .set({ sourceKind: "online_group" })
      .where(eq(accessEntitlements.id, primary.id));
  }

  const ownerWrite =
    owner === null
      ? null
      : await recordPurchaseTelegramOwnerInTransaction(tx, purchase.id, owner);

  // HUB-D24 and section 8: a Plus bought while the buyer's Hub runs, or within the
  // 7-day grace after the previous Plus, keeps the Hub until the new cohort starts.
  // Without a known owner, or with nothing to bridge, no bridge is written; a replay
  // returns the stored one.
  if (
    isOnlineGroupLibraryOfferId(purchase.offerExternalId ?? "") &&
    purchase.succeededAt
  ) {
    await ensurePlusHubBridgeInTransaction(tx, {
      purchaseId: purchase.id,
      processedAt: command.processedAt ?? new Date(),
    });
  }

  return ownerWrite;
}

/**
 * The account under which the same customer already sits in the Hub (HUB-D35): no
 * join event will come for them, so the earlier binding names the owner. Several
 * accounts name nobody.
 */
async function findActiveHubMemberOfCustomer(
  tx: DatabaseTransaction,
  purchase: Purchase,
): Promise<{ telegramUserId: string | null; ambiguous: boolean }> {
  const none = { telegramUserId: null, ambiguous: false };
  const [settings] = await tx
    .select({ chatId: inspirationHubSettings.telegramChatId })
    .from(inspirationHubSettings);
  const lookup = getOnlineGroupIdentityReuseLookup({
    customerEmailSnapshot: purchase.customerEmailSnapshot,
    customerId: purchase.customerId,
  });

  if (!settings || !lookup) return none;

  const rows = await tx
    .selectDistinct({ telegramUserId: telegramUserBindings.telegramUserId })
    .from(telegramUserBindings)
    .innerJoin(purchases, eq(purchases.id, telegramUserBindings.purchaseId))
    .where(
      and(
        eq(telegramUserBindings.chatId, settings.chatId),
        eq(telegramUserBindings.status, "active"),
        ne(purchases.id, purchase.id),
        lookup.kind === "customer_id"
          ? eq(purchases.customerId, lookup.value)
          : eq(purchases.customerEmailSnapshot, lookup.value),
      ),
    );
  const ids = [...new Set(rows.map((row) => row.telegramUserId.trim()).filter(Boolean))];

  if (ids.length > 1) return { telegramUserId: null, ambiguous: true };
  return { telegramUserId: ids[0] ?? null, ambiguous: false };
}

/**
 * A Hub purchase gets its owner (А5) and then its paid period. The owner is the
 * account confirmed before payment, else the account the customer already uses in
 * the Hub; without either the period counts from payment and the owner is written at
 * the first join. Idempotent: a replay returns the stored period.
 */
export async function ensureHubPurchaseAccessInTransaction(
  tx: DatabaseTransaction,
  command: HubPurchaseAccessCommand,
): Promise<HubPurchaseAccess> {
  const [reference] = await tx
    .select()
    .from(purchases)
    .where(eq(purchases.id, command.purchaseId));

  if (!reference || reference.outcome !== "succeeded") {
    throw new Error("purchase_access_purchase_invalid");
  }

  let ownerWrite: PurchaseOwnerWrite | null = null;
  let ambiguousKnownOwner = false;
  let candidate = command.verifiedTelegramUserId;

  if (candidate === null && reference.telegramUserId === null) {
    const known = await findActiveHubMemberOfCustomer(tx, reference);
    candidate = known.telegramUserId;
    ambiguousKnownOwner = known.ambiguous;
  }
  if (candidate !== null) {
    await lockHubPeriodOwner(tx, candidate);
    await lockPurchase(tx, reference.id);
    ownerWrite = await recordPurchaseTelegramOwnerInTransaction(
      tx,
      reference.id,
      candidate,
    );
  }

  const right = await ensureHubPurchasePeriodInTransaction(tx, {
    purchaseId: reference.id,
    continuationCohortId: command.continuationCohortId,
    processedAt: command.processedAt,
  });

  return { right, ownerWrite, ambiguousKnownOwner };
}

const inFreshTransaction = <Result>(
  run: (tx: DatabaseTransaction) => Promise<Result>,
): Promise<Result> => {
  const db = getDatabase();

  return retryHubPeriodChainTransaction(() =>
    db.transaction(run, { isolationLevel: "read committed" }),
  );
};

export const recordOnlineGroupPurchaseSourceInDatabase = (
  command: OnlineGroupPurchaseSourceCommand,
) =>
  inFreshTransaction((tx) => recordOnlineGroupPurchaseSourceInTransaction(tx, command));

export const ensureHubPurchaseAccessInDatabase = (command: HubPurchaseAccessCommand) =>
  inFreshTransaction((tx) => ensureHubPurchaseAccessInTransaction(tx, command));
