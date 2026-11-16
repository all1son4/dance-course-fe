import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";

import { isOnlineGroupLibraryOfferId } from "@/constants/sellable-products";
import { addWarsawCalendarDays } from "@/lib/inspiration-hub/calendar";

import { getDatabase } from "./client";
import { lockHubPeriodOwner } from "./hub-period-chain-resolution";
import { retryHubPeriodChainTransaction } from "./hub-period-chain-retry";
import { accessEntitlements, onlineGroupCohorts, purchases } from "./schema";
import type { DatabaseTransaction } from "./transaction";

type Entitlement = typeof accessEntitlements.$inferSelect;

// Section 8 and HUB-D21: a gap up to 7 Warsaw calendar days after a standalone Hub
// is bridged. HUB-D24: a Plus bought within 7 days after the previous Plus ended
// is bridged however long the pause until its start.
const GAP_DAYS = 7;
const BRIDGE_KEY = "inspiration-hub-bridge";

export type EnsurePlusHubBridgeCommand = {
  purchaseId: string;
  processedAt: Date;
};

const isUsablePaidRight = and(
  isNull(accessEntitlements.revokedAt),
  ne(accessEntitlements.status, "revoked"),
  eq(purchases.outcome, "succeeded"),
);

/** End of the owner's standalone Hub coverage if a period is active at paidAt. */
async function findStandaloneCoverageEnd(
  tx: DatabaseTransaction,
  telegramUserId: string,
  paidAt: Date,
): Promise<Date | null> {
  const periods = await tx
    .select({
      startsAt: accessEntitlements.startsAt,
      expiresAt: accessEntitlements.expiresAt,
    })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
    .where(
      and(
        eq(accessEntitlements.sourceKind, "standalone_hub"),
        eq(purchases.telegramUserId, telegramUserId),
        isUsablePaidRight,
        isNotNull(accessEntitlements.startsAt),
        gt(accessEntitlements.expiresAt, paidAt),
      ),
    );

  // Paid periods of one owner form one gapless chain (HUB-D15), so the latest end
  // counts once any period covers the payment moment.
  const isActiveAtPayment = periods.some(
    (period) => period.startsAt !== null && period.startsAt.getTime() <= paidAt.getTime(),
  );
  if (!isActiveAtPayment) return null;

  return periods.reduce<Date | null>(
    (latest, period) =>
      period.expiresAt !== null && (latest === null || period.expiresAt > latest)
        ? period.expiresAt
        : latest,
    null,
  );
}

/** End of the owner's Hub from Plus in the previous cohort, if it is set. */
async function findPreviousPlusHubEnd(
  tx: DatabaseTransaction,
  telegramUserId: string,
  previousCohortId: string,
): Promise<Date | null> {
  const [right] = await tx
    .select({ expiresAt: accessEntitlements.expiresAt })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
    .where(
      and(
        eq(purchases.onlineGroupCohortId, previousCohortId),
        eq(purchases.telegramUserId, telegramUserId),
        eq(accessEntitlements.sourceKind, "online_group"),
        eq(accessEntitlements.accessKey, "inspiration-hub"),
        isUsablePaidRight,
        isNotNull(accessEntitlements.expiresAt),
      ),
    )
    .orderBy(accessEntitlements.expiresAt)
    .limit(1);

  return right?.expiresAt ?? null;
}

/**
 * Grants the Hub between the owner's current Hub access and the start of a newly
 * bought Plus (section 8, HUB-D04, D21, D24). The bridge is a separate right of the
 * Plus purchase; the earlier rights keep their own dates. Returns null when no
 * bridge is due: no confirmed owner, the cohort already started, nothing to bridge
 * from, or a standalone gap longer than 7 days. A replay returns the stored bridge.
 * The caller has selected a Plus offer of a cohort and confirmed the payment.
 */
export async function ensurePlusHubBridgeInTransaction(
  tx: DatabaseTransaction,
  command: EnsurePlusHubBridgeCommand,
): Promise<Entitlement | null> {
  const [reference] = await tx
    .select()
    .from(purchases)
    .where(eq(purchases.id, command.purchaseId));
  if (!reference) throw new Error("hub_bridge_purchase_invalid");

  const owner = reference.telegramUserId;
  const cohortId = reference.onlineGroupCohortId;
  const paidAt = reference.succeededAt;
  if (
    reference.outcome !== "succeeded" ||
    paidAt === null ||
    cohortId === null ||
    !isOnlineGroupLibraryOfferId(reference.offerExternalId ?? "")
  ) {
    throw new Error("hub_bridge_purchase_invalid");
  }
  if (owner === null) return null;

  await lockHubPeriodOwner(tx, owner);

  const [stored] = await tx
    .select()
    .from(accessEntitlements)
    .where(
      and(
        eq(accessEntitlements.purchaseId, reference.id),
        eq(accessEntitlements.accessKey, BRIDGE_KEY),
      ),
    );
  if (stored) return stored;

  const [cohort] = await tx
    .select({
      startsAt: onlineGroupCohorts.startsAt,
      previousCohortId: onlineGroupCohorts.previousCohortId,
    })
    .from(onlineGroupCohorts)
    .where(eq(onlineGroupCohorts.id, cohortId));
  if (!cohort) throw new Error("hub_bridge_purchase_invalid");
  if (cohort.startsAt.getTime() <= paidAt.getTime()) return null;

  const standaloneEnd = await findStandaloneCoverageEnd(tx, owner, paidAt);
  const previousPlusEnd =
    cohort.previousCohortId === null
      ? null
      : await findPreviousPlusHubEnd(tx, owner, cohort.previousCohortId);

  const isStandaloneGapBridged =
    standaloneEnd !== null &&
    addWarsawCalendarDays(standaloneEnd, GAP_DAYS).getTime() >= cohort.startsAt.getTime();
  const isPlusRenewalBridged =
    previousPlusEnd !== null &&
    paidAt.getTime() < addWarsawCalendarDays(previousPlusEnd, GAP_DAYS).getTime();
  if (!isStandaloneGapBridged && !isPlusRenewalBridged) return null;

  // Access that still runs moves the bridge start to its end.
  const bridgeStart = [
    standaloneEnd,
    isPlusRenewalBridged ? previousPlusEnd : null,
  ].reduce<Date | null>(
    (latest, end) => (end !== null && (latest === null || end > latest) ? end : latest),
    null,
  );
  if (bridgeStart === null || bridgeStart.getTime() >= cohort.startsAt.getTime()) {
    return null;
  }

  const [bridge] = await tx
    .insert(accessEntitlements)
    .values({
      purchaseId: reference.id,
      accessKey: BRIDGE_KEY,
      sourceKind: "hub_bridge",
      startsAt: bridgeStart,
      expiresAt: cohort.startsAt,
      customerId: reference.customerId,
      productId: reference.productId,
      offerId: reference.offerId,
      telegramUserId: owner,
      status: "pending",
      deliveryChannel: "telegram",
      externalTargetType: "telegram_chat",
      updatedAt: command.processedAt,
    })
    .returning();

  return bridge;
}

/** Runs the bridge service in its own Read Committed transaction with retries. */
export function ensurePlusHubBridgeInDatabase(
  command: EnsurePlusHubBridgeCommand,
): Promise<Entitlement | null> {
  const db = getDatabase();

  return retryHubPeriodChainTransaction(() =>
    db.transaction((tx) => ensurePlusHubBridgeInTransaction(tx, command), {
      isolationLevel: "read committed",
    }),
  );
}

export type MoveCohortStartCommand = {
  cohortId: string;
  startsAt: Date;
  updatedAt: Date;
};

/**
 * Moves the start of a not yet closed cohort and keeps every bridge granted to its
 * buyers reaching the new start (HUB-D14). A bridge whose start is not before the
 * new cohort start is closed to zero length: the Plus Hub itself takes over.
 * New purchases check the 7-day rule against the new date automatically.
 */
export async function moveCohortStartInTransaction(
  tx: DatabaseTransaction,
  command: MoveCohortStartCommand,
): Promise<void> {
  const [cohort] = await tx
    .update(onlineGroupCohorts)
    .set({ startsAt: command.startsAt, updatedAt: command.updatedAt })
    .where(
      and(
        eq(onlineGroupCohorts.id, command.cohortId),
        isNull(onlineGroupCohorts.closedAt),
      ),
    )
    .returning({ id: onlineGroupCohorts.id });
  if (!cohort) throw new Error("cohort_start_move_invalid");

  const cohortPurchaseIds = tx
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.onlineGroupCohortId, command.cohortId));
  const isCohortBridge = and(
    eq(accessEntitlements.sourceKind, "hub_bridge"),
    eq(accessEntitlements.accessKey, BRIDGE_KEY),
    inArray(accessEntitlements.purchaseId, cohortPurchaseIds),
  );

  await tx
    .update(accessEntitlements)
    .set({ expiresAt: command.startsAt, updatedAt: command.updatedAt })
    .where(and(isCohortBridge, lt(accessEntitlements.startsAt, command.startsAt)));

  await tx
    .update(accessEntitlements)
    .set({ expiresAt: sql`${accessEntitlements.startsAt}`, updatedAt: command.updatedAt })
    .where(and(isCohortBridge, gte(accessEntitlements.startsAt, command.startsAt)));
}
