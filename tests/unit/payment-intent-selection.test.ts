import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_AGREEMENTS,
  INITIAL_CUSTOMER_DATA,
} from "@/app/[locale]/payment/payment.constants";
import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";

test("the payment API rejects unknown product and tariff IDs before contacting Stripe", async (t) => {
  process.env.STRIPE_SECRET_KEY = "sk_test_selection_fixture";
  const { POST } = await import("@/app/api/stripe/payment-intent/route");
  const { getStripeServer } = await import("@/app/api/stripe/payment-intent/lib");
  const stripe = getStripeServer();
  assert.ok(stripe);
  const create = t.mock.method(stripe.paymentIntents, "create", async () => {
    throw new Error("Unexpected Stripe request");
  });
  const agreements = Object.fromEntries(
    Object.keys(INITIAL_AGREEMENTS).map((key) => [key, true]),
  );

  for (const selection of [
    { productId: "unknown-product" },
    { productId: SELLABLE_PRODUCTS["choreo-her-lies"].id, offerId: "unknown-offer" },
    { offerId: "unknown-offer" },
  ]) {
    const response = await POST(
      new Request("http://localhost:3000/api/stripe/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify({
          ...selection,
          checkoutLocale: "en",
          checkoutSessionId: "checkout_selection_fixture",
          agreements,
          customerData: {
            ...INITIAL_CUSTOMER_DATA,
            address: "Main Street 1",
            city: "Warsaw",
            country: "PL",
            email: "buyer@example.com",
            fullName: "Anna Test",
            nickname: "@anna_test",
            postalCode: "00-001",
          },
        }),
      }),
    );
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { errorCode: "catalog_unavailable" });
  }
  assert.equal(create.mock.callCount(), 0);
});
