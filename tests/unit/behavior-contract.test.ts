import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_AGREEMENTS,
  PAYMENT_CHECKBOXES,
} from "@/app/[locale]/payment/payment.constants";
import {
  buildCheckoutHref,
  getDefaultCheckoutCurrencyByLocale,
  SELLABLE_PRODUCTS_LIST,
} from "@/constants/sellable-products";

test("keeps the accepted product, offer, price, and access-duration matrix", () => {
  const actualMatrix = SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.offers.map((offer) => ({
      durationDays: offer.telegramAccessDurationDays,
      eur: offer.prices.eur,
      offer: offer.code,
      pln: offer.prices.pln,
      product: product.code,
    })),
  );

  assert.deepEqual(actualMatrix, [
    {
      durationDays: 120,
      eur: 50,
      offer: "standard",
      pln: 250,
      product: "first-touch",
    },
    {
      durationDays: 60,
      eur: 15,
      offer: "without-mentor",
      pln: 60,
      product: "choreo-still-alive",
    },
    {
      durationDays: 60,
      eur: 25,
      offer: "with-mentor",
      pln: 100,
      product: "choreo-still-alive",
    },
    {
      durationDays: 60,
      eur: 15,
      offer: "without-mentor",
      pln: 60,
      product: "choreo-her-lies",
    },
    {
      durationDays: 60,
      eur: 25,
      offer: "with-mentor",
      pln: 100,
      product: "choreo-her-lies",
    },
    {
      durationDays: 60,
      eur: 20,
      offer: "without-mentor",
      pln: 85,
      product: "choreo-bundle",
    },
    {
      durationDays: 60,
      eur: 40,
      offer: "with-mentor",
      pln: 170,
      product: "choreo-bundle",
    },
    {
      durationDays: 0,
      eur: 15,
      offer: "standard",
      pln: 65,
      product: "choreo-birthday-drop",
    },
    {
      durationDays: 0,
      eur: 50,
      offer: "standard",
      pln: 220,
      product: "online-group-anna-strok",
    },
    {
      durationDays: 0,
      eur: 65,
      offer: "library-access",
      pln: 280,
      product: "online-group-anna-strok",
    },
    {
      durationDays: 0,
      eur: 40,
      offer: "renewal-discount",
      pln: 175,
      product: "online-group-anna-strok",
    },
    {
      durationDays: 0,
      eur: 50,
      offer: "renewal-library-access",
      pln: 220,
      product: "online-group-anna-strok",
    },
  ]);
});

test("keeps all four agreements explicit and unchecked for every new checkout", () => {
  assert.deepEqual(
    PAYMENT_CHECKBOXES.map(({ name }) => name),
    [
      "immediateAccessConsent",
      "withdrawalNoticeAcknowledgement",
      "privacyPolicyAcknowledgement",
      "digitalContentAgreement",
    ],
  );
  assert.deepEqual(Object.values(INITIAL_AGREEMENTS), [false, false, false, false]);
});

test("keeps locale currency defaults and internal checkout context", () => {
  assert.equal(getDefaultCheckoutCurrencyByLocale("en"), "eur");
  assert.equal(getDefaultCheckoutCurrencyByLocale("en-GB"), "eur");
  assert.equal(getDefaultCheckoutCurrencyByLocale("pl"), "pln");
  assert.equal(getDefaultCheckoutCurrencyByLocale("ru"), "pln");
  assert.equal(
    buildCheckoutHref({
      offerId: "off_fixture",
      productId: "prd_fixture",
    }),
    "/payment?product=prd_fixture&offer=off_fixture",
  );
});
