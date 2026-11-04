import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { getOnlineCoursesArray } from "@/app/[locale]/online/constants";
import { isCheckoutLinkStale } from "@/app/[locale]/payment/payment.helpers";
import {
  isOfferSaleOpen,
  SELLABLE_PRODUCTS,
  SELLABLE_PRODUCTS_LIST,
} from "@/constants/sellable-products";
import { getAlternativeTariffHref, getOpenPublicProductOffers } from "@/lib/public-sales";

test("the online overview keeps the next group start and follows choreography availability", () => {
  const cardsFor = (state: "open" | "closed" | "unavailable") =>
    getOnlineCoursesArray(
      (key) => key,
      (key) => key,
      state,
    );
  for (const code of ["choreo", "online-group"]) {
    const open = renderToStaticMarkup(
      cardsFor("open").find((card) => card.id === code)!.bottomRowContent,
    );
    assert.match(open, /startLabel/u);
    assert.match(open, /startValue/u);
    assert.doesNotMatch(open, /salesUnavailable|salesValue/u);
    const closed = renderToStaticMarkup(
      cardsFor("closed").find((card) => card.id === code)!.bottomRowContent,
    );
    const unavailable = renderToStaticMarkup(
      cardsFor("unavailable").find((card) => card.id === code)!.bottomRowContent,
    );
    assert.equal(closed, unavailable);
    if (code === "online-group") {
      assert.equal(closed, open);
    } else {
      assert.match(closed, /salesUnavailable/u);
      assert.doesNotMatch(closed, /startValue/u);
    }
  }
});

test("renewal-only availability does not advertise public Online Group sales", () => {
  const product = structuredClone(SELLABLE_PRODUCTS["online-group-anna-strok"]);
  product.salesEnabled = true;
  for (const offer of product.offers)
    offer.salesEnabled = offer.code.startsWith("renewal-");
  assert.deepEqual(getOpenPublicProductOffers(product), []);
  const renewal = product.offers.find((offer) => offer.code === "renewal-discount")!;
  assert.equal(isOfferSaleOpen(product, renewal), true);
  assert.equal(getAlternativeTariffHref(product, product.offers[0].id), null);
});

test("a disabled tariff offers a route to an available public plan", () => {
  const product = structuredClone(SELLABLE_PRODUCTS["choreo-her-lies"]);
  product.salesEnabled = true;
  assert.equal(
    getAlternativeTariffHref(product, product.offers[1].id),
    "/online/choreo#choreo-section",
  );
  product.offers[0].salesEnabled = false;
  assert.equal(getAlternativeTariffHref(product, product.offers[1].id), null);
  product.offers[0].salesEnabled = true;
  product.salesEnabled = false;
  assert.equal(getAlternativeTariffHref(product, product.offers[1].id), null);
});

test("unknown checkout IDs cannot silently use the default product or tariff", () => {
  const check = (productId: string, offerId: string) =>
    isCheckoutLinkStale({ products: SELLABLE_PRODUCTS_LIST, productId, offerId });
  const product = SELLABLE_PRODUCTS["choreo-her-lies"];
  assert.equal(check("", ""), false);
  assert.equal(check(product.id, ""), false);
  assert.equal(check(product.id, product.offers[0].id), false);
  // A disabled historical tariff is a closed purchase, rather than a broken link.
  assert.equal(check(product.id, product.offers[1].id), false);
  assert.equal(check("unknown-product", ""), true);
  assert.equal(check(product.id, "unknown-offer"), true);
  assert.equal(check("", "unknown-offer"), true);
  assert.equal(check("", product.offers[0].id), true);
});
