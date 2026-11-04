import assert from "node:assert/strict";
import test from "node:test";

import { getCompactSummaryTitle } from "@/app/[locale]/payment/payment.helpers";
import { getResultReceipt } from "@/app/[locale]/payment/result-receipt";
import { formatCheckoutPrice, SELLABLE_PRODUCTS } from "@/constants/sellable-products";

const translate = (key: string) => key;
const byCode = (code: string) =>
  Object.values(SELLABLE_PRODUCTS).find((product) => product.code === code);

test("the short name keeps every name of a bundle, not just the first", () => {
  assert.equal(
    getCompactSummaryTitle('Бандл разборов "Still Alive" + "Her Lies"'),
    "Still Alive + Her Lies",
  );
  assert.equal(getCompactSummaryTitle('Видео-разбор хореографии "Her Lies"'), "Her Lies");
  assert.equal(getCompactSummaryTitle("Online Group\nby Anna Strok"), "Online Group");
  assert.equal(
    getCompactSummaryTitle("The Birthday Drop „Love me in the morning”"),
    "Love me in the morning",
  );
});

test("the receipt names the Online Group tariff and skips it where there is none", () => {
  const group = SELLABLE_PRODUCTS["online-group-anna-strok"];
  const plus = group.offers.find((offer) => offer.code === "library-access");
  const firstTouch = SELLABLE_PRODUCTS["first-touch"];

  const groupReceipt = getResultReceipt({
    currency: "pln",
    offer: plus,
    product: group,
    translateProduct: translate,
  });

  assert.ok(groupReceipt?.title.endsWith(` · ${plus?.labelKey}`));
  assert.equal(groupReceipt?.amount, formatCheckoutPrice(plus?.prices.pln ?? 0, "pln"));

  const courseReceipt = getResultReceipt({
    currency: "eur",
    offer: firstTouch.offers[0],
    product: firstTouch,
    translateProduct: translate,
  });

  assert.ok(courseReceipt);
  assert.ok(!courseReceipt.title.includes("·"));
});

test("without a product, an offer or a currency there is no receipt to show", () => {
  const firstTouch = byCode("first-touch");

  assert.equal(
    getResultReceipt({
      offer: firstTouch?.offers[0],
      product: firstTouch,
      translateProduct: translate,
    }),
    null,
  );
  assert.equal(
    getResultReceipt({ currency: "pln", product: null, translateProduct: translate }),
    null,
  );
});
