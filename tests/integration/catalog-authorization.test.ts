import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import {
  getCheckoutSelectionFromDatabase,
  getSellableProductsWithDatabaseCommercialData,
} from "@/db/sellable-products";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, {
  max: 4,
  prepare: false,
});
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

test("authorizes checkout only from active database commercial rows", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const productExternalId = `prd_safe07_${suffix}`;
  const offerExternalId = `off_safe07_${suffix}`;
  const alternateOfferExternalId = `off_safe07_alternate_${suffix}`;
  const [product] = await client<{ id: string }[]>`
    INSERT INTO products (
      code,
      external_product_id,
      slug,
      type,
      title,
      description,
      description_keys,
      default_offer_external_id,
      is_active
    ) VALUES (
      'first-touch',
      ${productExternalId},
      ${`safe07-${suffix}`},
      'course',
      'SAFE-07 fixture',
      '[]'::jsonb,
      '[]'::jsonb,
      ${offerExternalId},
      true
    )
    RETURNING id
  `;

  assert.ok(product);

  const [offer] = await client<{ id: string }[]>`
    INSERT INTO product_offers (
      external_offer_id,
      product_id,
      code,
      label,
      telegram_access_duration_days,
      is_active,
      sort_order
    ) VALUES (
      ${offerExternalId},
      ${product.id},
      'standard',
      'SAFE-07 fixture',
      30,
      true,
      0
    )
    RETURNING id
  `;

  assert.ok(offer);

  const [alternateOffer] = await client<{ id: string }[]>`
    INSERT INTO product_offers (
      external_offer_id,
      product_id,
      code,
      label,
      telegram_access_duration_days,
      is_active,
      sort_order
    ) VALUES (
      ${alternateOfferExternalId},
      ${product.id},
      'standard',
      'SAFE-07 alternate fixture',
      30,
      true,
      1
    )
    RETURNING id
  `;

  assert.ok(alternateOffer);

  await client`
    INSERT INTO offer_prices (offer_id, currency, amount_minor, is_active)
    VALUES
      (${offer.id}, 'pln', 12345, true),
      (${offer.id}, 'eur', 2345, true),
      (${alternateOffer.id}, 'pln', 34567, true),
      (${alternateOffer.id}, 'eur', 4567, true)
  `;

  try {
    const activeSelection = await getCheckoutSelectionFromDatabase({
      currency: "pln",
      offerId: offerExternalId,
      productId: productExternalId,
    });

    assert.equal(activeSelection?.amountMinor, 12345);
    assert.equal(activeSelection?.offer.id, offerExternalId);
    assert.equal(activeSelection?.product.id, productExternalId);

    const activeCatalogProduct = (
      await getSellableProductsWithDatabaseCommercialData()
    ).find((productItem) => productItem.id === productExternalId);

    assert.equal(activeCatalogProduct?.defaultOfferId, offerExternalId);
    assert.equal(activeCatalogProduct?.offers[0]?.prices.pln, 123.45);

    await client`
      UPDATE offer_prices
      SET is_active = false
      WHERE offer_id = ${offer.id} AND currency = 'pln'
    `;

    assert.equal(
      await getCheckoutSelectionFromDatabase({
        currency: "pln",
        offerId: offerExternalId,
        productId: productExternalId,
      }),
      null,
    );
    assert.equal(
      (await getSellableProductsWithDatabaseCommercialData()).some(
        (productItem) => productItem.id === productExternalId,
      ),
      false,
    );

    assert.equal(
      await getCheckoutSelectionFromDatabase({
        currency: "pln",
        productId: productExternalId,
      }),
      null,
    );

    await client`
      UPDATE offer_prices
      SET is_active = true
      WHERE offer_id = ${offer.id} AND currency = 'pln'
    `;
    await client`
      UPDATE product_offers
      SET is_active = false
      WHERE id = ${offer.id}
    `;

    assert.equal(
      await getCheckoutSelectionFromDatabase({
        currency: "pln",
        offerId: offerExternalId,
        productId: productExternalId,
      }),
      null,
    );

    await client`
      UPDATE product_offers
      SET is_active = true
      WHERE id = ${offer.id}
    `;
    await client`
      UPDATE products
      SET is_active = false
      WHERE id = ${product.id}
    `;

    assert.equal(
      await getCheckoutSelectionFromDatabase({
        currency: "pln",
        offerId: offerExternalId,
        productId: productExternalId,
      }),
      null,
    );
  } finally {
    await client`
      DELETE FROM products
      WHERE id = ${product.id}
    `;
  }
});

test("keeps a closed product sellable-shaped but flagged as closed", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const productExternalId = `prd_sales_switch_${suffix}`;
  const offerExternalId = `off_sales_switch_${suffix}`;
  const [product] = await client<{ id: string }[]>`
    INSERT INTO products (
      code,
      external_product_id,
      slug,
      type,
      title,
      description,
      description_keys,
      default_offer_external_id,
      is_active
    ) VALUES (
      'first-touch',
      ${productExternalId},
      ${`sales-switch-${suffix}`},
      'course',
      'Sales switch fixture',
      '[]'::jsonb,
      '[]'::jsonb,
      ${offerExternalId},
      true
    )
    RETURNING id
  `;

  assert.ok(product);

  const [offer] = await client<{ id: string }[]>`
    INSERT INTO product_offers (
      external_offer_id,
      product_id,
      code,
      label,
      telegram_access_duration_days,
      is_active,
      sort_order
    ) VALUES (
      ${offerExternalId},
      ${product.id},
      'standard',
      'Sales switch fixture',
      30,
      true,
      0
    )
    RETURNING id
  `;

  assert.ok(offer);

  await client`
    INSERT INTO offer_prices (offer_id, currency, amount_minor, is_active)
    VALUES
      (${offer.id}, 'pln', 22000, true),
      (${offer.id}, 'eur', 5000, true)
  `;

  try {
    const openSelection = await getCheckoutSelectionFromDatabase({
      currency: "pln",
      offerId: offerExternalId,
      productId: productExternalId,
    });

    assert.equal(openSelection?.product.salesEnabled, true);

    await client`
      UPDATE products
      SET sales_enabled = false
      WHERE id = ${product.id}
    `;

    // Closing sales must not hide the product: the storefront still needs its
    // title and price to render a "closed" state instead of an error.
    const closedCatalogProduct = (
      await getSellableProductsWithDatabaseCommercialData()
    ).find((productItem) => productItem.id === productExternalId);

    assert.equal(closedCatalogProduct?.salesEnabled, false);
    assert.equal(closedCatalogProduct?.offers[0]?.prices.pln, 220);

    // The selection still resolves - the payment route is what refuses it, and
    // it needs the price and offer to report a precise error.
    const closedSelection = await getCheckoutSelectionFromDatabase({
      currency: "pln",
      offerId: offerExternalId,
      productId: productExternalId,
    });

    assert.equal(closedSelection?.product.salesEnabled, false);
    assert.equal(closedSelection?.amountMinor, 22000);
  } finally {
    await client`
      DELETE FROM products
      WHERE id = ${product.id}
    `;
  }
});
