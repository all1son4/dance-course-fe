import assert from "node:assert/strict";
import test from "node:test";

import type { PaymentIntent } from "@stripe/stripe-js";

import { installJsonFetchFixture } from "../../../../tests/fixtures/providers";
import {
  cancelUnusedPaymentIntents,
  createResultPageUrl,
  PAYMENT_RESULT_PATHS,
  resolvePaymentCompletion,
} from "./StripePaymentTabs.completion";

// The module targets the browser; the tests provide the minimal window surface
// it touches (timers for retries and the origin for result URLs).
(globalThis as { window?: unknown }).window = {
  clearTimeout: (id: number) => clearTimeout(id),
  location: { origin: "https://dance.example" },
  setTimeout: (handler: () => void, delayMs?: number) => setTimeout(handler, delayMs),
};

const RESULT_PAGE_CONTEXT = {
  checkoutSessionId: "cs_test_1",
  resultCurrency: "pln",
  resultOfferId: "off_test",
  resultProductId: "prd_test",
};

test("result URL keeps a stable parameter order and skips empty values", () => {
  const fullUrl = createResultPageUrl(
    PAYMENT_RESULT_PATHS.success,
    RESULT_PAGE_CONTEXT,
    "pi_test_1",
  );

  assert.equal(
    fullUrl,
    "https://dance.example/payment/success?product=prd_test&offer=off_test&currency=pln&checkout=cs_test_1&payment_intent=pi_test_1",
  );

  const sparseUrl = createResultPageUrl(PAYMENT_RESULT_PATHS.failed, {
    checkoutSessionId: null,
    resultCurrency: null,
    resultOfferId: null,
    resultProductId: "prd_test",
  });

  assert.equal(sparseUrl, "https://dance.example/payment/failed?product=prd_test");
});

test("a server-confirmed success redirects and cancels unused intents", async (t) => {
  const calls = installJsonFetchFixture(t, [
    {
      body: {
        outcome: "succeeded",
        paymentIntentId: "pi_test_1",
        status: "succeeded",
      },
    },
  ]);

  const completion = await resolvePaymentCompletion({
    checkoutSessionId: "cs_test_1",
    fallbackPaymentIntentId: "pi_test_1",
  });

  assert.deepEqual(completion, {
    cancelUnusedIntents: true,
    kind: "redirect",
    pathname: PAYMENT_RESULT_PATHS.success,
    paymentIntentId: "pi_test_1",
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), {
    checkoutSessionId: "cs_test_1",
    paymentIntentId: "pi_test_1",
  });
});

test("a failed or canceled outcome redirects without touching sibling intents", async (t) => {
  installJsonFetchFixture(t, [
    {
      body: {
        outcome: "failed",
        paymentIntentId: "pi_test_1",
        status: "requires_payment_method",
      },
    },
  ]);

  const completion = await resolvePaymentCompletion({
    checkoutSessionId: "cs_test_1",
    fallbackPaymentIntentId: "pi_test_1",
  });

  assert.deepEqual(completion, {
    cancelUnusedIntents: false,
    kind: "redirect",
    pathname: PAYMENT_RESULT_PATHS.failed,
    paymentIntentId: "pi_test_1",
  });
});

test("a still-processing outcome keeps the customer on the payment page", async (t) => {
  installJsonFetchFixture(t, [
    {
      body: {
        outcome: "processing",
        paymentIntentId: "pi_test_1",
        status: "processing",
      },
    },
  ]);

  const completion = await resolvePaymentCompletion({
    checkoutSessionId: "cs_test_1",
    fallbackPaymentIntentId: "pi_test_1",
  });

  assert.deepEqual(completion, { kind: "confirmed" });
});

test("a transient status failure is retried until the server answers", async (t) => {
  installJsonFetchFixture(t, [
    { body: {}, status: 503 },
    {
      body: {
        outcome: "succeeded",
        paymentIntentId: "pi_test_1",
        status: "succeeded",
      },
    },
  ]);

  const completion = await resolvePaymentCompletion({
    checkoutSessionId: "cs_test_1",
    fallbackPaymentIntentId: "pi_test_1",
  });

  assert.equal(completion.kind, "redirect");
});

test("a non-retryable status failure surfaces as an error", async (t) => {
  installJsonFetchFixture(t, [{ body: {}, status: 403 }]);

  await assert.rejects(
    resolvePaymentCompletion({
      checkoutSessionId: "cs_test_1",
      fallbackPaymentIntentId: "pi_test_1",
    }),
    /payment_intent_status_failed/u,
  );
});

test("without a checkout session Stripe's own success state decides", async (t) => {
  // Zero fixture responses: any network call would fail the test.
  installJsonFetchFixture(t, []);

  const completion = await resolvePaymentCompletion({
    checkoutSessionId: null,
    paymentIntent: { id: "pi_test_1", status: "succeeded" } as PaymentIntent,
  });

  assert.deepEqual(completion, {
    cancelUnusedIntents: true,
    kind: "redirect",
    pathname: PAYMENT_RESULT_PATHS.success,
    paymentIntentId: "pi_test_1",
  });

  const pending = await resolvePaymentCompletion({
    checkoutSessionId: null,
    paymentIntent: { id: "pi_test_1", status: "processing" } as PaymentIntent,
  });

  assert.deepEqual(pending, { kind: "confirmed" });
});

test("unused intents are canceled once each, excluding the used one", async (t) => {
  const calls = installJsonFetchFixture(t, [{ body: {} }, { body: {} }]);

  cancelUnusedPaymentIntents({
    allPaymentIntentIds: [" pi_a ", "pi_a", "pi_used", "pi_b", ""],
    checkoutSessionId: "cs_test_1",
    usedPaymentIntentId: "pi_used",
  });

  // The requests are fire-and-forget; give the microtask queue one turn.
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(calls.map((call) => JSON.parse(call.body).paymentIntentId).sort(), [
    "pi_a",
    "pi_b",
  ]);
});

test("cancellation without a checkout session never reaches the network", async (t) => {
  installJsonFetchFixture(t, []);

  cancelUnusedPaymentIntents({
    allPaymentIntentIds: ["pi_a"],
    checkoutSessionId: null,
    usedPaymentIntentId: "pi_used",
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
});
