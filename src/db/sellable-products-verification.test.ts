import assert from "node:assert/strict";
import test from "node:test";

import {
  BIRTHDAY_DROP_OFFER_ID,
  BIRTHDAY_DROP_PRODUCT_ID,
  SELLABLE_PRODUCTS_LIST,
  type SellableProduct,
} from "@/constants/sellable-products";

import { getCommercialCatalogDrift } from "./sellable-products-verification";

const cloneCatalog = () => structuredClone(SELLABLE_PRODUCTS_LIST);

test("accepts matching deploy-owned commercial catalog data", () => {
  assert.deepEqual(
    getCommercialCatalogDrift({
      actualProducts: cloneCatalog(),
      expectedProducts: SELLABLE_PRODUCTS_LIST,
    }),
    [],
  );
});

test("reports a database price mismatch", () => {
  const actualProducts = cloneCatalog();
  const birthdayDrop = actualProducts.find(
    (product) => product.id === BIRTHDAY_DROP_PRODUCT_ID,
  );
  const birthdayOffer = birthdayDrop?.offers.find(
    (offer) => offer.id === BIRTHDAY_DROP_OFFER_ID,
  );

  assert.ok(birthdayOffer);
  birthdayOffer.prices.eur = 20;

  assert.deepEqual(
    getCommercialCatalogDrift({
      actualProducts,
      expectedProducts: SELLABLE_PRODUCTS_LIST,
    }),
    [
      {
        actual: { eur: 20 },
        expected: { eur: 15 },
        fields: ["eur"],
        key: `${BIRTHDAY_DROP_PRODUCT_ID}:${BIRTHDAY_DROP_OFFER_ID}`,
        kind: "mismatch",
      },
    ],
  );
});

test("ignores the operator-owned sales switch", () => {
  const actualProducts: SellableProduct[] = cloneCatalog();

  actualProducts[0].salesEnabled = !actualProducts[0].salesEnabled;

  assert.deepEqual(
    getCommercialCatalogDrift({
      actualProducts,
      expectedProducts: SELLABLE_PRODUCTS_LIST,
    }),
    [],
  );
});
