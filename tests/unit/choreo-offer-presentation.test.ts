import assert from "node:assert/strict";
import test from "node:test";

import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import { shouldShowOfferLabel } from "@/lib/choreo-offer-presentation";
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

test("a product with one configured tariff stays neutral even with sales paused", () => {
  const product = structuredClone(SELLABLE_PRODUCTS["choreo-love-me-in-the-morning"]);
  for (const salesEnabled of [false, true]) {
    product.salesEnabled = salesEnabled;
    product.offers[0].salesEnabled = salesEnabled;
    assert.equal(shouldShowOfferLabel(product, product.offers[0].id), false);
  }
  for (const code of ["first-touch", "choreo-birthday-drop"] as const) {
    const singleTariffProduct = SELLABLE_PRODUCTS[code];
    assert.equal(
      shouldShowOfferLabel(singleTariffProduct, singleTariffProduct.offers[0].id),
      false,
    );
  }
  const onlineGroup = SELLABLE_PRODUCTS["online-group-anna-strok"];
  for (const offer of onlineGroup.offers) {
    assert.equal(shouldShowOfferLabel(onlineGroup, offer.id), true);
  }
  // Standard and Plus give different access, so the name stays even when only
  // one of them is on sale.
  const [firstOnlineGroupOffer] = onlineGroup.offers;
  const onlyOneOnSale = {
    ...onlineGroup,
    offers: onlineGroup.offers.map((offer) => ({
      ...offer,
      salesEnabled: offer.id === firstOnlineGroupOffer.id,
    })),
  };
  assert.equal(shouldShowOfferLabel(onlyOneOnSale, firstOnlineGroupOffer.id), true);
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
