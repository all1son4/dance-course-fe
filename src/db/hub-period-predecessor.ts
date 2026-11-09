import { getStandaloneHubPeriodEnd } from "@/lib/inspiration-hub/period-end";

import type { PendingHubChainSnapshotInput } from "./hub-period-chain-input";
import type { HubPeriodNodeSnapshot } from "./hub-period-nodes";
import type { onlineGroupCohorts } from "./schema";

export type HubPeriodPredecessorInput = {
  telegramUserId: string;
  node: HubPeriodNodeSnapshot;
  cohort: Pick<
    typeof onlineGroupCohorts.$inferSelect,
    "id" | "mainChatId" | "accessEndsAt"
  > | null;
};

const INVALID_PREDECESSOR = "hub_period_predecessor_invalid";

function isFiniteDate(value: Date | null): value is Date {
  return value !== null && Number.isFinite(value.getTime());
}

function validatePredecessorNode(
  { entitlement, purchase }: HubPeriodNodeSnapshot,
  telegramUserId: string,
): void {
  if (
    entitlement.purchaseId !== purchase.id ||
    purchase.outcome !== "succeeded" ||
    purchase.telegramUserId !== telegramUserId ||
    (entitlement.telegramUserId !== null &&
      entitlement.telegramUserId !== telegramUserId) ||
    entitlement.revokedAt !== null ||
    entitlement.status === "revoked" ||
    (entitlement.startsAt !== null && !isFiniteDate(entitlement.startsAt)) ||
    (entitlement.expiresAt !== null && !isFiniteDate(entitlement.expiresAt))
  ) {
    throw new Error(INVALID_PREDECESSOR);
  }
}

// The cohort is the only source of an Online end. Dates recorded on the Online right
// are delivery projections that legacy writers rewrite, so they never decide the
// calendar here. A free admin grant has no payment time and still anchors a period.
function getOnlinePredecessorEnd(
  { entitlement, purchase }: HubPeriodNodeSnapshot,
  cohort: HubPeriodPredecessorInput["cohort"],
): Date | null {
  if (
    cohort === null ||
    entitlement.accessKey !== "primary" ||
    entitlement.periodStartMode !== null ||
    entitlement.paidDurationDays !== null ||
    entitlement.startsAfterEntitlementId !== null ||
    purchase.onlineGroupCohortId !== cohort.id ||
    (entitlement.telegramChatId !== null &&
      entitlement.telegramChatId !== cohort.mainChatId)
  ) {
    throw new Error(INVALID_PREDECESSOR);
  }

  const endsAt = cohort.accessEndsAt;
  if (endsAt !== null && !isFiniteDate(endsAt)) {
    throw new Error(INVALID_PREDECESSOR);
  }

  return endsAt;
}

function isExactStandalonePeriod(startsAt: Date, expiresAt: Date): boolean {
  try {
    return getStandaloneHubPeriodEnd({ startsAt }).getTime() === expiresAt.getTime();
  } catch (error) {
    // Finite dates can still overflow when 56 calendar days are added.
    if (error instanceof RangeError) return false;
    throw error;
  }
}

function getStandalonePredecessorEnd(
  { entitlement, purchase }: HubPeriodNodeSnapshot,
  cohort: HubPeriodPredecessorInput["cohort"],
): Date | null {
  const { periodStartMode, startsAfterEntitlementId, startsAt, expiresAt } = entitlement;
  const paidAt = purchase.succeededAt;

  if (
    !isFiniteDate(paidAt) ||
    cohort !== null ||
    purchase.onlineGroupCohortId !== null ||
    entitlement.accessKey !== "inspiration-hub" ||
    entitlement.paidDurationDays !== 56
  ) {
    throw new Error(INVALID_PREDECESSOR);
  }

  if (periodStartMode === "payment") {
    if (startsAfterEntitlementId !== null) {
      throw new Error(INVALID_PREDECESSOR);
    }
  } else if (periodStartMode === "after_entitlement") {
    if (
      startsAfterEntitlementId === null ||
      startsAfterEntitlementId === entitlement.id
    ) {
      throw new Error(INVALID_PREDECESSOR);
    }
    if (startsAt === null && expiresAt === null) return null;
  } else {
    throw new Error(INVALID_PREDECESSOR);
  }

  if (
    startsAt === null ||
    expiresAt === null ||
    expiresAt.getTime() <= startsAt.getTime() ||
    startsAt.getTime() < paidAt.getTime() ||
    (periodStartMode === "payment" && startsAt.getTime() !== paidAt.getTime()) ||
    !isExactStandalonePeriod(startsAt, expiresAt)
  ) {
    throw new Error(INVALID_PREDECESSOR);
  }

  return expiresAt;
}

/**
 * Validates a canonical predecessor snapshot without checking current activity.
 * The caller locks its purchase, entitlement and cohort, and checks full history.
 * Legacy expiry revocations must be reconciled before entering this path.
 */
export function buildHubPeriodPredecessor(
  input: HubPeriodPredecessorInput,
): PendingHubChainSnapshotInput["predecessor"] {
  const { node, cohort, telegramUserId } = input;
  validatePredecessorNode(node, telegramUserId);
  let expiresAt: Date | null;

  switch (node.entitlement.sourceKind) {
    case "online_group":
      expiresAt = getOnlinePredecessorEnd(node, cohort);
      break;
    case "standalone_hub":
      expiresAt = getStandalonePredecessorEnd(node, cohort);
      break;
    default:
      throw new Error(INVALID_PREDECESSOR);
  }

  return {
    entitlementId: node.entitlement.id,
    purchaseId: node.purchase.id,
    expiresAt,
  };
}
