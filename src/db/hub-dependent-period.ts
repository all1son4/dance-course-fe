import {
  buildHubPeriodPredecessor,
  type HubPeriodPredecessorInput,
} from "./hub-period-predecessor";
import type { purchases } from "./schema";

export type HubDependentPeriodInput = {
  purchase: Pick<
    typeof purchases.$inferSelect,
    "id" | "outcome" | "succeededAt" | "onlineGroupCohortId" | "telegramUserId"
  >;
  predecessor: HubPeriodPredecessorInput;
};

export type HubDependentPeriodValues = {
  purchaseId: string;
  accessKey: "inspiration-hub";
  sourceKind: "standalone_hub";
  periodStartMode: "after_entitlement";
  paidDurationDays: 56;
  startsAfterEntitlementId: string;
  startsAt: null;
  expiresAt: null;
};

/**
 * Builds initial dependency fields after the caller selects the Hub purchase mode.
 * The caller validates the complete locked history, persists and resolves dates.
 */
export const buildHubDependentPeriodValues = (
  input: HubDependentPeriodInput,
): HubDependentPeriodValues => {
  if (
    input.purchase.outcome !== "succeeded" ||
    input.purchase.succeededAt === null ||
    !Number.isFinite(input.purchase.succeededAt.getTime()) ||
    input.purchase.onlineGroupCohortId !== null ||
    input.predecessor.telegramUserId !== input.purchase.telegramUserId
  ) {
    throw new Error("hub_dependent_period_invalid");
  }

  const validatedPredecessor = buildHubPeriodPredecessor(input.predecessor);

  if (input.purchase.id === validatedPredecessor.purchaseId) {
    throw new Error("hub_dependent_period_invalid");
  }

  return {
    purchaseId: input.purchase.id,
    accessKey: "inspiration-hub",
    sourceKind: "standalone_hub",
    periodStartMode: "after_entitlement",
    paidDurationDays: 56,
    startsAfterEntitlementId: validatedPredecessor.entitlementId,
    startsAt: null,
    expiresAt: null,
  };
};
