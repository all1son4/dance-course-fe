import type {
  HubPeriodChainInput,
  PendingHubChainPeriod,
} from "@/lib/inspiration-hub/period-chain";

import type { HubPeriodNodeSnapshot } from "./hub-period-nodes";

export type PendingHubChainSnapshotInput = {
  telegramUserId: string;
  predecessor: {
    entitlementId: string;
    purchaseId: string;
    expiresAt: Date | null;
  };
  nodes: readonly HubPeriodNodeSnapshot[];
};

function toPendingHubChainPeriod(
  node: HubPeriodNodeSnapshot,
  telegramUserId: string,
): PendingHubChainPeriod {
  const { entitlement, purchase } = node;
  const paidAt = purchase.succeededAt;

  if (paidAt === null || !Number.isFinite(paidAt.getTime())) {
    throw new Error("hub_period_chain_invalid");
  }

  const {
    id: entitlementId,
    purchaseId,
    sourceKind,
    accessKey,
    periodStartMode,
    paidDurationDays,
    startsAfterEntitlementId,
    startsAt,
    expiresAt,
    revokedAt,
    status,
  } = entitlement;

  const isValidPurchase =
    purchaseId === purchase.id &&
    purchase.outcome === "succeeded" &&
    purchase.telegramUserId === telegramUserId &&
    purchase.onlineGroupCohortId === null;

  const isValidEntitlement =
    sourceKind === "standalone_hub" &&
    accessKey === "inspiration-hub" &&
    periodStartMode === "after_entitlement" &&
    paidDurationDays === 56 &&
    startsAfterEntitlementId !== null &&
    startsAt === null &&
    expiresAt === null &&
    revokedAt === null &&
    status !== "revoked" &&
    (entitlement.telegramUserId === null ||
      entitlement.telegramUserId === telegramUserId);

  if (!isValidPurchase || !isValidEntitlement) {
    throw new Error("hub_period_chain_invalid");
  }

  return {
    entitlementId,
    startsAfterEntitlementId,
    paidAt,
    startsAt: null,
    expiresAt: null,
  };
}

/**
 * Validates and orders a pending suffix after a prevalidated predecessor.
 * The caller discovers the full chain and validates its predecessor under locks.
 * Resolved rights are excluded; dates are calculated and persisted separately.
 */
export function buildPendingHubPeriodChainInput(
  input: PendingHubChainSnapshotInput,
): HubPeriodChainInput {
  const seenEntitlementIds = new Set([input.predecessor.entitlementId]);
  const seenPurchaseIds = new Set([input.predecessor.purchaseId]);
  const nextByPredecessor = new Map<string, PendingHubChainPeriod>();

  for (const node of input.nodes) {
    const period = toPendingHubChainPeriod(node, input.telegramUserId);

    if (
      seenEntitlementIds.has(period.entitlementId) ||
      seenPurchaseIds.has(node.purchase.id) ||
      nextByPredecessor.has(period.startsAfterEntitlementId)
    ) {
      throw new Error("hub_period_chain_invalid");
    }

    seenEntitlementIds.add(period.entitlementId);
    seenPurchaseIds.add(node.purchase.id);
    nextByPredecessor.set(period.startsAfterEntitlementId, period);
  }

  const periods: PendingHubChainPeriod[] = [];
  let currentPredecessorId = input.predecessor.entitlementId;

  let currentPeriod = nextByPredecessor.get(currentPredecessorId);
  while (currentPeriod) {
    periods.push(currentPeriod);
    currentPredecessorId = currentPeriod.entitlementId;
    currentPeriod = nextByPredecessor.get(currentPredecessorId);
  }

  if (input.nodes.length !== periods.length) {
    throw new Error("hub_period_chain_invalid");
  }

  return {
    predecessor: {
      entitlementId: input.predecessor.entitlementId,
      expiresAt: input.predecessor.expiresAt,
    },
    periods,
  };
}
