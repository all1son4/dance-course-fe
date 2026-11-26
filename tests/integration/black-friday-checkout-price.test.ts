import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before, type TestContext } from "node:test";

import postgres from "postgres";

import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import { getDatabaseClient } from "@/db/client";
import { getSellableProductsWithDatabaseCommercialData } from "@/db/sellable-products";
import { applyBlackFridayToProducts, BLACK_FRIDAY_ENDS_AT } from "@/lib/black-friday";
import { INITIAL_AGREEMENTS } from "@/lib/checkout/payment.constants";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.STRIPE_SECRET_KEY ||= "sk_test_black_friday_price_fixture";

const applicationClient = getDatabaseClient();
const client = postgres(databaseUrl, { max: 2, prepare: false });

// A tutorial on sale: 15 € regular, 10 € inside the campaign window.
const HER_LIES = SELLABLE_PRODUCTS["choreo-her-lies"];
const OFFER = HER_LIES.offers[0];
const BEFORE_END = BLACK_FRIDAY_ENDS_AT.getTime() - 30_000;
const AFTER_END = BLACK_FRIDAY_ENDS_AT.getTime() + 5_000;
let catalogProductId: string | null = null;

before(async () => {
  const [product] = await client<{ id: string }[]>`
    INSERT INTO products (code, external_product_id, slug, type, title, description,
      description_keys, default_offer_external_id, is_active, sales_enabled)
    VALUES (${HER_LIES.code}, ${HER_LIES.id}, ${HER_LIES.slug}, 'choreo', ${HER_LIES.title},
      '[]'::jsonb, '[]'::jsonb, ${OFFER.id}, true, true)
    RETURNING id
  `;
  assert.ok(product);
  catalogProductId = product.id;
  const [offer] = await client<{ id: string }[]>`
    INSERT INTO product_offers (external_offer_id, product_id, code, label,
      telegram_access_duration_days, sort_order)
    VALUES (${OFFER.id}, ${product.id}, ${OFFER.code}, ${OFFER.label}, 60, 0)
    RETURNING id
  `;
  assert.ok(offer);
  await client`INSERT INTO offer_prices (offer_id, currency, amount_minor)
    VALUES (${offer.id}, 'eur', 1500), (${offer.id}, 'pln', 6500)`;
});

after(async () => {
  if (catalogProductId) {
    await client`DELETE FROM products WHERE id = ${catalogProductId}`;
  }
  await Promise.all([client.end(), applicationClient.end()]);
});

/** What the checkout page shows for the tutorial when it renders at `now`. */
const renderShownOffer = async (t: TestContext, now: number) => {
  t.mock.timers.setTime(now);
  const catalogue = applyBlackFridayToProducts(
    await getSellableProductsWithDatabaseCommercialData(),
  );
  const offer = catalogue
    .find((product) => product.id === HER_LIES.id)
    ?.offers.find((item) => item.id === OFFER.id);
  assert.ok(offer);
  return { shownCampaign: offer.campaign ?? "", shownPrice: offer.prices.eur };
};

const mockStripeCreate = async (t: TestContext) => {
  const { getStripeServer } = await import("@/lib/stripe-checkout");
  const stripe = getStripeServer();
  assert.ok(stripe);
  return t.mock.method(stripe.paymentIntents, "create", async (params: never) => {
    const { metadata } = params as { metadata: Record<string, string> };
    return {
      client_secret: "pi_secret_black_friday",
      created: Math.floor(Date.now() / 1000),
      id: `pi_black_friday_${randomUUID()}`,
      metadata,
    };
  });
};

const requestPaymentIntent = async (shown: {
  shownCampaign: string;
  shownPrice: number;
}) => {
  const { POST } = await import("@/app/api/stripe/payment-intent/route");
  return POST(
    new Request("http://localhost/api/stripe/payment-intent", {
      body: JSON.stringify({
        agreements: Object.fromEntries(
          Object.keys(INITIAL_AGREEMENTS).map((key) => [key, true]),
        ),
        checkoutLocale: "en",
        checkoutSessionId: randomUUID(),
        currency: "eur",
        customerData: {
          address: "Main Street 1",
          city: "Warsaw",
          country: "PL",
          email: "black-friday-price@example.test",
          fullName: "Test Buyer",
          instagram: "test.buyer",
          lessonLanguage: "en",
          nickname: "",
          postalCode: "00-001",
        },
        offerId: OFFER.id,
        productId: HER_LIES.id,
        ...shown,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
};

test("a checkout opened before the campaign ends is never charged the regular price it did not show", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: BEFORE_END });
  const create = await mockStripeCreate(t);
  const shownBeforeEnd = await renderShownOffer(t, BEFORE_END);
  assert.deepEqual(shownBeforeEnd, {
    shownCampaign: "black-friday-2026",
    shownPrice: 10,
  });

  // The buyer completes the form only after midnight, on the page rendered before it.
  t.mock.timers.setTime(AFTER_END);
  const response = await requestPaymentIntent(shownBeforeEnd);

  for (const call of create.mock.calls) {
    const { amount } = call.arguments[0] as { amount: number };
    assert.equal(amount, shownBeforeEnd.shownPrice * 100, "charged ≠ shown");
  }
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { errorCode: "offer_changed" });
  assert.equal(create.mock.callCount(), 0);

  // The price alone is not the offer: a Hub inside the window is the same price for
  // twice the weeks, so a campaign that is no longer on is refused as well.
  const sameRegularPriceStillMarked = await requestPaymentIntent({
    shownCampaign: "black-friday-2026",
    shownPrice: 15,
  });
  assert.equal(sameRegularPriceStillMarked.status, 409);
  assert.equal(create.mock.callCount(), 0);

  // The page reloads its catalogue and shows the regular price: that one is charged.
  const shownAfterEnd = await renderShownOffer(t, AFTER_END);
  assert.deepEqual(shownAfterEnd, { shownCampaign: "", shownPrice: 15 });
  const repriced = await requestPaymentIntent(shownAfterEnd);

  assert.equal(repriced.status, 200);
  assert.equal(create.mock.callCount(), 1);
  const params = create.mock.calls[0]?.arguments[0] as {
    amount: number;
    metadata: Record<string, string>;
  };
  assert.equal(params.amount, 1500);
  assert.equal(params.metadata.campaign, undefined);
});

test("inside the window the campaign price that is shown is the one charged", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: BEFORE_END });
  const create = await mockStripeCreate(t);
  const shown = await renderShownOffer(t, BEFORE_END);

  const response = await requestPaymentIntent(shown);

  assert.equal(response.status, 200);
  const params = create.mock.calls[0]?.arguments[0] as {
    amount: number;
    metadata: Record<string, string>;
  };
  assert.equal(params.amount, 1000);
  assert.equal(params.metadata.campaign, "black-friday-2026");
});
