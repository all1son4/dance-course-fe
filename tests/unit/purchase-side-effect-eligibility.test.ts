import assert from "node:assert/strict";
import test from "node:test";

import type Stripe from "stripe";

import { shouldRunPurchaseSuccessSideEffects } from "@/app/api/stripe/webhook/_lib/side-effects/eligibility";

import { createStripeEvent, createStripePaymentIntent } from "../fixtures/providers";

test("runs purchase side effects for the final PaymentIntent event", () => {
  const paymentIntent = createStripePaymentIntent();

  assert.equal(
    shouldRunPurchaseSuccessSideEffects(
      createStripeEvent({
        object: paymentIntent,
        type: "payment_intent.succeeded",
      }),
    ),
    true,
  );
});

test("does not duplicate side effects for Payment Link checkout completion", () => {
  const checkoutSession = {
    id: "cs_fixture",
    object: "checkout.session",
    payment_intent: "pi_fixture",
  } as Stripe.Checkout.Session;

  assert.equal(
    shouldRunPurchaseSuccessSideEffects(
      createStripeEvent({
        object: checkoutSession,
        type: "checkout.session.completed",
      }),
    ),
    false,
  );
});

test("ignores unrelated or non-success provider events", () => {
  assert.equal(
    shouldRunPurchaseSuccessSideEffects(
      createStripeEvent({
        object: createStripePaymentIntent({
          status: "processing",
        }),
        type: "payment_intent.processing",
      }),
    ),
    false,
  );
});
