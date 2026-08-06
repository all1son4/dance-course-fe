import assert from "node:assert/strict";
import test from "node:test";

import {
  getCheckoutOwnedPaymentIntent,
  getManagedPaymentIntentOutcome,
  normalizePaymentIntentCustomerData,
} from "@/app/api/stripe/payment-intent/lib";

import { createStripeFake, createStripePaymentIntent } from "../fixtures/providers";

test("maps Stripe statuses to the accepted visible outcomes", () => {
  assert.deepEqual(
    [
      "succeeded",
      "canceled",
      "requires_payment_method",
      "processing",
      "requires_capture",
      "requires_action",
      "requires_confirmation",
    ].map((status) =>
      getManagedPaymentIntentOutcome(
        status as Parameters<typeof getManagedPaymentIntentOutcome>[0],
      ),
    ),
    [
      "succeeded",
      "canceled",
      "failed",
      "processing",
      "processing",
      "requires_action",
      "requires_action",
    ],
  );
});

test("allows polling only for the checkout session stored in Stripe metadata", async () => {
  const paymentIntent = createStripePaymentIntent({
    id: "pi_fixture123",
    metadata: {
      checkout_session_id: "checkout_fixture",
    },
  });
  const { retrieveCalls, stripe } = createStripeFake({
    [paymentIntent.id]: paymentIntent,
  });

  const allowed = await getCheckoutOwnedPaymentIntent({
    checkoutSessionId: "checkout_fixture",
    paymentIntentId: paymentIntent.id,
    stripe,
  });
  const denied = await getCheckoutOwnedPaymentIntent({
    checkoutSessionId: "checkout_other",
    paymentIntentId: paymentIntent.id,
    stripe,
  });

  assert.equal(allowed.paymentIntent?.id, paymentIntent.id);
  assert.deepEqual(denied, {
    errorCode: "payment_intent_access_denied",
    status: 403,
  });
  assert.deepEqual(retrieveCalls, [paymentIntent.id, paymentIntent.id]);
});

test("normalizes customer data without adding new checkout fields", () => {
  assert.deepEqual(
    normalizePaymentIntentCustomerData({
      address: "  Main   Street 1 ",
      city: "  Warsaw ",
      country: " pl ",
      email: " CUSTOMER@Example.COM ",
      fullName: "  Anna   Test ",
      lessonLanguage: "EN-us",
      nickname: " @anna_test ",
      postalCode: " 00-001 ",
    }),
    {
      address: "Main Street 1",
      city: "Warsaw",
      country: "PL",
      email: "customer@example.com",
      fullName: "Anna Test",
      lessonLanguage: "en",
      nickname: "@anna_test",
      postalCode: "00-001",
    },
  );
});
