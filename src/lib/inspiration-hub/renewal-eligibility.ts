import { type HubAccessRight, isHubAccessRightActive } from "./access-state";

export type RenewalEligibilityInput = {
  isPreviousGroupMember: boolean;
  standaloneHubPeriods: readonly Omit<HubAccessRight, "sourceKind">[];
  checkedAt: Date;
};

/**
 * Evaluates renewal pricing for Online Group and Inspiration Hub.
 * The caller verifies Telegram identity, the correct source chat, and payment
 * ownership. standaloneHubPeriods are the buyer's successfully paid Hub periods.
 */
export const isEligibleForRenewalPrice = (input: RenewalEligibilityInput): boolean =>
  input.isPreviousGroupMember ||
  input.standaloneHubPeriods.some((period) =>
    isHubAccessRightActive({ ...period, sourceKind: "standalone_hub" }, input.checkedAt),
  );
