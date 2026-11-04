import assert from "node:assert/strict";
import test from "node:test";

import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import {
  shouldShowOfferLabel,
  shouldShowPurchasedOfferLabel,
} from "@/lib/choreo-offer-presentation";
import { getPurchaseDescription } from "@/lib/invoices/purchase-invoice";
import { createEmptyPaymentRecord } from "@/lib/payment-record";

test("single active choreo tariff hides its label, while other selections retain their identity", () => {
  const product = structuredClone(SELLABLE_PRODUCTS["choreo-her-lies"]);
  const [selfPaced, mentor] = product.offers;
  for (const productEnabled of [true, false]) {
    product.salesEnabled = productEnabled;
    selfPaced.salesEnabled = true;
    mentor.salesEnabled = false;
    assert.equal(shouldShowOfferLabel(product, selfPaced.id), false);
    assert.equal(shouldShowOfferLabel(product, mentor.id), true);
    selfPaced.salesEnabled = false;
    mentor.salesEnabled = true;
    assert.equal(shouldShowOfferLabel(product, mentor.id), false);
    mentor.salesEnabled = false;
    assert.equal(shouldShowOfferLabel(product, mentor.id), true);
    selfPaced.salesEnabled = true;
    mentor.salesEnabled = true;
    assert.equal(shouldShowOfferLabel(product, selfPaced.id), true);
    assert.equal(shouldShowOfferLabel(product, mentor.id), true);
  }
});

test("a tutorial with one configured tariff stays neutral even with sales paused", () => {
  const product = structuredClone(SELLABLE_PRODUCTS["choreo-love-me-in-the-morning"]);
  for (const salesEnabled of [false, true]) {
    product.salesEnabled = salesEnabled;
    product.offers[0].salesEnabled = salesEnabled;
    assert.equal(shouldShowOfferLabel(product, product.offers[0].id), false);
  }
  for (const code of [
    "first-touch",
    "online-group-anna-strok",
    "choreo-birthday-drop",
  ] as const) {
    const otherProduct = SELLABLE_PRODUCTS[code];
    assert.equal(shouldShowOfferLabel(otherProduct, otherProduct.offers[0].id), true);
  }
});

test("purchase presentation uses a snapshot and preserves legacy labels without the flag", () => {
  assert.equal(shouldShowPurchasedOfferLabel({ show_offer_label: "false" }), false);
  assert.equal(shouldShowPurchasedOfferLabel({ show_offer_label: "true" }), true);
  assert.equal(shouldShowPurchasedOfferLabel({}), true);
  assert.equal(shouldShowPurchasedOfferLabel({ show_offer_label: "invalid" }), true);
});

test("invoice descriptions omit a single tariff without changing the stored purchase", () => {
  const product = SELLABLE_PRODUCTS["choreo-her-lies"];
  for (const offer of product.offers) {
    const payment = {
      ...createEmptyPaymentRecord(),
      offer_id: offer.id,
      offer_label: offer.label,
    };
    const before = structuredClone(payment);
    const description = getPurchaseDescription(payment, false);
    assert.match(description, /Her Lies/u);
    assert.doesNotMatch(description, /mentor/iu);
    assert.match(getPurchaseDescription(payment), /mentor/iu);
    assert.deepEqual(payment, before);
  }
});
