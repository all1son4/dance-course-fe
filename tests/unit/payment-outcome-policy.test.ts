import assert from "node:assert/strict";
import test from "node:test";

import {
  isPaymentOutcomeTransitionAllowed,
  type PaymentOutcome,
} from "@/db/payment-outcome-policy";

const OUTCOMES: PaymentOutcome[] = [
  "requires_action",
  "processing",
  "failed",
  "canceled",
  "succeeded",
];

test("keeps non-terminal payment outcomes retryable", () => {
  for (const currentOutcome of [
    "requires_action",
    "processing",
    "failed",
  ] satisfies PaymentOutcome[]) {
    for (const incomingOutcome of OUTCOMES) {
      assert.equal(
        isPaymentOutcomeTransitionAllowed(currentOutcome, incomingOutcome),
        true,
        `${currentOutcome} -> ${incomingOutcome}`,
      );
    }
  }
});

test("does not regress a succeeded payment", () => {
  for (const incomingOutcome of OUTCOMES) {
    assert.equal(
      isPaymentOutcomeTransitionAllowed("succeeded", incomingOutcome),
      incomingOutcome === "succeeded",
      `succeeded -> ${incomingOutcome}`,
    );
  }
});

test("keeps cancellation terminal while allowing success to win", () => {
  for (const incomingOutcome of OUTCOMES) {
    assert.equal(
      isPaymentOutcomeTransitionAllowed("canceled", incomingOutcome),
      incomingOutcome === "canceled" || incomingOutcome === "succeeded",
      `canceled -> ${incomingOutcome}`,
    );
  }
});
