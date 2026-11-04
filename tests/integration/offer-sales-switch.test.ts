import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import {
  isOfferSaleOpen,
  LOVE_ME_IN_THE_MORNING_PRODUCT_ID,
} from "@/constants/sellable-products";
import { getDatabaseClient } from "@/db/client";
import {
  getCheckoutSelectionFromDatabase,
  getSellableProductsWithDatabaseCommercialData,
  setOfferSalesEnabled,
  setProductSalesEnabled,
} from "@/db/sellable-products";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
const client = postgres(databaseUrl, { max: 2, prepare: false });
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

test("persists independent tariff switches without removing historical catalogue data", async () => {
  const suffix = randomUUID();
  const productId = `prd_offer_switch_${suffix}`;
  const offerId = `off_offer_switch_${suffix}`;
  const [product] = await client<{ id: string }[]>`
    INSERT INTO products (external_product_id, code, slug, type, title, description, description_keys, default_offer_external_id)
    VALUES (${productId}, ${suffix}, ${suffix}, 'choreo', 'Tariff switch fixture', '[]'::jsonb, '[]'::jsonb, ${offerId})
    RETURNING id
  `;
  const [offer] = await client<{ id: string }[]>`
    INSERT INTO product_offers (external_offer_id, product_id, code, label, telegram_access_duration_days)
    VALUES (${offerId}, ${product.id}, 'without-mentor', 'Without mentor', 60)
    RETURNING id
  `;
  await client`
    INSERT INTO offer_prices (offer_id, currency, amount_minor)
    VALUES (${offer.id}, 'pln', 6500), (${offer.id}, 'eur', 1500)
  `;

  const selection = () =>
    getCheckoutSelectionFromDatabase({ currency: "pln", productId, offerId });
  try {
    const open = await selection();
    assert.ok(open);
    assert.equal(isOfferSaleOpen(open.product, open.offer), true);
    assert.equal(
      await setOfferSalesEnabled({
        productId: "wrong_product",
        offerId,
        salesEnabled: false,
      }),
      null,
    );
    await setOfferSalesEnabled({ productId, offerId, salesEnabled: false });

    const closedOffer = await selection();
    assert.ok(closedOffer);
    assert.equal(closedOffer.product.salesEnabled, true);
    assert.equal(closedOffer.amountMinor, 6500);
    assert.equal(isOfferSaleOpen(closedOffer.product, closedOffer.offer), false);
    const historicalOffer = (await getSellableProductsWithDatabaseCommercialData())
      .find((item) => item.id === productId)
      ?.offers.find((item) => item.id === offerId);
    assert.equal(historicalOffer?.salesEnabled, false);
    assert.equal(historicalOffer?.telegramAccessDurationDays, 60);

    await setProductSalesEnabled({ productId, salesEnabled: false });
    await setOfferSalesEnabled({ productId, offerId, salesEnabled: true });
    const paused = await selection();
    assert.ok(paused);
    assert.equal(isOfferSaleOpen(paused.product, paused.offer), false);
    await setProductSalesEnabled({ productId, salesEnabled: true });
    const reopened = await selection();
    assert.ok(reopened);
    assert.equal(isOfferSaleOpen(reopened.product, reopened.offer), true);
  } finally {
    await client`DELETE FROM products WHERE id = ${product.id}`;
  }
});

test("migration creates a separate 60-day tutorial with sales closed until launch", async () => {
  const product = (await getSellableProductsWithDatabaseCommercialData()).find(
    (item) => item.id === LOVE_ME_IN_THE_MORNING_PRODUCT_ID,
  );
  assert.ok(product);
  assert.equal(product.salesEnabled, false);
  assert.equal(product.offers.length, 1);
  assert.equal(product.offers[0].code, "without-mentor");
  assert.equal(product.offers[0].salesEnabled, true);
  assert.equal(product.offers[0].telegramAccessDurationDays, 60);
  assert.deepEqual(product.offers[0].prices, { pln: 65, eur: 15 });
});
