import { getStandaloneHubPeriodEnd } from "./period-end";
import { getStandaloneHubPeriodStart } from "./period-start";

export type PendingHubChainPeriod = {
  entitlementId: string;
  startsAfterEntitlementId: string;
  paidAt: Date;
  startsAt: null;
  expiresAt: null;
};

export type HubPeriodChainInput = {
  predecessor: {
    entitlementId: string;
    expiresAt: Date | null;
  };
  periods: readonly PendingHubChainPeriod[];
};

export type HubPeriodDateUpdate = {
  entitlementId: string;
  startsAt: Date;
  expiresAt: Date;
};

export type HubPeriodChainPlan = {
  updates: HubPeriodDateUpdate[];
  waitingEntitlementIds: string[];
};

/**
 * Plans dates for an ordered chain of paid standalone Hub rights awaiting a start.
 * The caller validates payments, ownership, source and dates before calling.
 * Resolved rights are excluded; this function validates links without persisting.
 */
export function planPendingHubPeriodChain(
  input: HubPeriodChainInput,
): HubPeriodChainPlan {
  const seenEntitlementIds = new Set<string>([input.predecessor.entitlementId]);
  let previousEntitlementId = input.predecessor.entitlementId;

  for (const period of input.periods) {
    if (
      period.startsAfterEntitlementId !== previousEntitlementId ||
      seenEntitlementIds.has(period.entitlementId)
    ) {
      throw new Error("hub_period_chain_invalid");
    }

    seenEntitlementIds.add(period.entitlementId);
    previousEntitlementId = period.entitlementId;
  }

  if (input.predecessor.expiresAt === null) {
    return {
      updates: [],
      waitingEntitlementIds: input.periods.map((period) => period.entitlementId),
    };
  }

  const updates: HubPeriodDateUpdate[] = [];
  let previousExpiresAt = input.predecessor.expiresAt;

  for (const period of input.periods) {
    const startsAt = getStandaloneHubPeriodStart({
      paidAt: period.paidAt,
      currentAccessEndsAt: previousExpiresAt,
    });
    const expiresAt = getStandaloneHubPeriodEnd({ startsAt });

    updates.push({
      entitlementId: period.entitlementId,
      startsAt,
      expiresAt,
    });

    previousExpiresAt = expiresAt;
  }
  return { updates, waitingEntitlementIds: [] };
}
