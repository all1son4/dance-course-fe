import { type SQL, sql, type SQLWrapper } from "drizzle-orm";

export type PaymentOutcome =
  "succeeded" | "processing" | "requires_action" | "failed" | "canceled";

export const isPaymentOutcomeTransitionAllowed = (
  currentOutcome: PaymentOutcome,
  incomingOutcome: PaymentOutcome,
): boolean => {
  if (currentOutcome === "succeeded") {
    return incomingOutcome === "succeeded";
  }

  if (currentOutcome === "canceled") {
    return incomingOutcome === "canceled" || incomingOutcome === "succeeded";
  }

  return true;
};

export const getPaymentOutcomeTransitionCondition = (
  currentOutcome: SQLWrapper,
  incomingOutcome: PaymentOutcome,
): SQL => sql`(
  ${currentOutcome} NOT IN ('succeeded', 'canceled')
  OR ${currentOutcome} = ${incomingOutcome}
  OR ${incomingOutcome} = 'succeeded'
)`;
