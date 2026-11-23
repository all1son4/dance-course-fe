import assert from "node:assert/strict";
import test from "node:test";

import {
  AUSTRIA_PAYMENT_METHOD_ORDER,
  createPaymentElementOptions,
} from "./StripePaymentTabs.appearance";
import {
  resolvePaymentDeclineHintKey,
  resolvePaymentDeclineKind,
} from "./StripePaymentTabs.helpers";

test("a bank decline gets a panel, field errors stay inline", () => {
  assert.equal(
    resolvePaymentDeclineKind({
      type: "card_error",
      code: "card_declined",
      decline_code: "generic_decline",
    }),
    "declined",
  );
  // Fraud codes look like any other decline to the buyer (Stripe's advice).
  assert.equal(
    resolvePaymentDeclineKind({
      type: "card_error",
      code: "card_declined",
      decline_code: "fraudulent",
    }),
    "declined",
  );
  assert.equal(
    resolvePaymentDeclineKind({
      type: "card_error",
      code: "card_declined",
      decline_code: "insufficient_funds",
    }),
    "insufficientFunds",
  );
  assert.equal(
    resolvePaymentDeclineKind({
      type: "invalid_request_error",
      code: "payment_intent_authentication_failure",
    }),
    "authentication",
  );
  for (const code of ["incorrect_number", "expired_card", "incorrect_cvc"]) {
    assert.equal(resolvePaymentDeclineKind({ type: "card_error", code }), null);
  }
  assert.equal(resolvePaymentDeclineKind({ type: "validation_error" }), null);
  assert.equal(resolvePaymentDeclineKind(undefined), null);
});

test("the decline hint names the quickest local method only where it exists", () => {
  assert.equal(resolvePaymentDeclineHintKey("eur", "AT"), "decline.hintEps");
  assert.equal(resolvePaymentDeclineHintKey("eur", " at "), "decline.hintEps");
  assert.equal(resolvePaymentDeclineHintKey("eur", "CZ"), null);
  assert.equal(resolvePaymentDeclineHintKey("pln", "PL"), "decline.hintBlik");
  assert.equal(resolvePaymentDeclineHintKey(null, "AT"), null);
});

test("Austrian buyers see wallets and EPS before the card; everyone else keeps Stripe's order", () => {
  assert.deepEqual(
    createPaymentElementOptions(null, null, "at").paymentMethodOrder,
    AUSTRIA_PAYMENT_METHOD_ORDER,
  );
  assert.equal(
    createPaymentElementOptions(null, null, "PL").paymentMethodOrder,
    undefined,
  );
  assert.equal(createPaymentElementOptions().paymentMethodOrder, undefined);
});
