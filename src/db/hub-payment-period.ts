import { getStandaloneHubPeriodEnd } from "@/lib/inspiration-hub/period-end";

import type { purchases } from "./schema";

export type HubPaymentPeriodPurchase = Pick<
  typeof purchases.$inferSelect,
  "id" | "outcome" | "succeededAt" | "onlineGroupCohortId"
>;

export type HubPaymentPeriodValues = {
  purchaseId: string;
  accessKey: "inspiration-hub";
  sourceKind: "standalone_hub";
  periodStartMode: "payment";
  paidDurationDays: 56;
  startsAfterEntitlementId: null;
  startsAt: Date;
  expiresAt: Date;
};

/**
 * Builds payment-based fields after the caller selects the Hub product and mode.
 * Persistence and repeat-payment handling belong to the surrounding transaction.
 */
export const buildHubPaymentPeriodValues = (
  purchase: HubPaymentPeriodPurchase,
): HubPaymentPeriodValues => {
  if (
    purchase.outcome !== "succeeded" ||
    !purchase.succeededAt ||
    !Number.isFinite(purchase.succeededAt.getTime()) ||
    purchase.onlineGroupCohortId !== null
  ) {
    throw new Error("hub_payment_period_invalid");
  }

  try {
    const expiresAt = getStandaloneHubPeriodEnd({ startsAt: purchase.succeededAt });

    return {
      purchaseId: purchase.id,
      accessKey: "inspiration-hub",
      sourceKind: "standalone_hub",
      periodStartMode: "payment",
      paidDurationDays: 56,
      startsAfterEntitlementId: null,
      startsAt: purchase.succeededAt,
      expiresAt,
    };
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Error("hub_payment_period_invalid");
    }
    throw error;
  }
};
