import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_AGREEMENTS,
  INITIAL_CUSTOMER_DATA,
} from "@/app/[locale]/payment/payment.constants";
import { SELLABLE_PRODUCTS, SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";
import { PaymentStore } from "@/stores/payment-store";

test("blocks Stripe until the authoritative catalog is ready", () => {
  const store = new PaymentStore();

  store.customerData = {
    ...INITIAL_CUSTOMER_DATA,
    address: "Main Street 1",
    city: "Warsaw",
    country: "PL",
    email: "buyer@example.com",
    fullName: "Anna Test",
    nickname: "@anna_test",
    postalCode: "00-001",
  };
  store.agreements = Object.fromEntries(
    Object.keys(INITIAL_AGREEMENTS).map((key) => [key, true]),
  ) as typeof INITIAL_AGREEMENTS;

  assert.equal(store.catalogStatus, "loading");
  assert.equal(store.canShowStripe, false);

  store.setSellableProducts(SELLABLE_PRODUCTS_LIST);

  assert.equal(store.catalogStatus, "ready");
  assert.equal(store.canShowStripe, true);

  store.setCatalogUnavailable();

  assert.equal(store.catalogStatus, "unavailable");
  assert.equal(store.canShowStripe, false);
  assert.equal(store.isCatalogUnavailable, true);
});

test("marks a known code-only selection unavailable after database catalog load", () => {
  const store = new PaymentStore();
  const databaseProducts = [SELLABLE_PRODUCTS["choreo-still-alive"]];

  store.setSellableProducts(databaseProducts);

  assert.equal(store.catalogStatus, "unavailable");
  assert.equal(store.isCatalogUnavailable, true);
  assert.equal(store.canShowStripe, false);
});
