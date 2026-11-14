import assert from "node:assert/strict";
import test from "node:test";

import { getCheckoutSelectionFromSearch } from "@/app/[locale]/payment/payment.helpers";
import {
  INSPIRATION_HUB_PRODUCT_ID,
  INSPIRATION_HUB_RENEWAL_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";

const select = (query: string) =>
  getCheckoutSelectionFromSearch(new URLSearchParams(query));

test("the Hub's short special-price link opens the Hub renewal offer", () => {
  assert.deepEqual(select("renewal=inspiration-hub"), {
    offerId: INSPIRATION_HUB_RENEWAL_OFFER_ID,
    productId: INSPIRATION_HUB_PRODUCT_ID,
  });
  assert.equal(SELLABLE_PRODUCTS["inspiration-hub"].id, INSPIRATION_HUB_PRODUCT_ID);
  assert.ok(
    SELLABLE_PRODUCTS["inspiration-hub"].offers.some(
      (offer) => offer.id === INSPIRATION_HUB_RENEWAL_OFFER_ID,
    ),
  );
});

test("an explicit product and offer always win", () => {
  assert.deepEqual(select("product=prd_a&offer=off_b&renewal=inspiration-hub"), {
    offerId: "off_b",
    productId: "prd_a",
  });
});

test("other renewal links and plain links are read as they are", () => {
  assert.deepEqual(select("renewal=rnw_123"), { offerId: null, productId: null });
  assert.deepEqual(select("product=prd_a&offer=off_b"), {
    offerId: "off_b",
    productId: "prd_a",
  });
  assert.deepEqual(select(""), { offerId: null, productId: null });
});
