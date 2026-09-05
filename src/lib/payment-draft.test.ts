import assert from "node:assert/strict";
import test from "node:test";

import { isCheckoutDraftPathname, isCheckoutPaymentPathname } from "./payment-draft";

test("the checkout form is recognised in every locale, with or without a trailing slash", () => {
  for (const pathname of ["/payment", "/payment/", "/en/payment", "/pl/payment/"]) {
    assert.equal(isCheckoutPaymentPathname(pathname), true, pathname);
    assert.equal(isCheckoutDraftPathname(pathname), true, pathname);
  }
});

test("the result pages keep the draft: back-to-payment must restore the filled form", () => {
  for (const pathname of [
    "/payment/failed",
    "/payment/success",
    "/ru/payment/failed/",
    "/en/payment/success",
  ]) {
    assert.equal(isCheckoutPaymentPathname(pathname), false, pathname);
    assert.equal(isCheckoutDraftPathname(pathname), true, pathname);
  }
});

test("any other route discards the draft", () => {
  for (const pathname of [
    "/",
    "/en",
    "/online",
    "/en/online/birthday-drop",
    "/payment-terms",
    "/payment/unknown",
    "/en/payments",
  ]) {
    assert.equal(isCheckoutDraftPathname(pathname), false, pathname);
  }
});
