import assert from "node:assert/strict";
import test from "node:test";

import { getChoreos } from "@/app/[locale]/online/choreo/constants";
import {
  BIRTHDAY_DROP_OFFER_ID,
  LOVE_ME_IN_THE_MORNING_OFFER_ID,
  SELLABLE_PRODUCTS,
  SELLABLE_PRODUCTS_LIST,
} from "@/constants/sellable-products";
import {
  getOfferAccessDurationDaysByOfferId,
  isChoreoChannelOfferId,
  isLifetimeChannelOfferId,
} from "@/lib/telegram/offer-access";

test("shows only the two current tutorials and the database-enabled tariffs and prices", () => {
  const products = structuredClone(SELLABLE_PRODUCTS_LIST);
  const herLies = products.find((product) => product.code === "choreo-her-lies")!;
  const love = products.find(
    (product) => product.code === "choreo-love-me-in-the-morning",
  )!;
  herLies.salesEnabled = true;
  herLies.offers[0].prices.pln = 70;
  love.salesEnabled = true;

  const cards = getChoreos((key) => key, products);
  assert.deepEqual(
    cards.map((card) => card.id),
    ["choreo-her-lies", "choreo-love-me-in-the-morning"],
  );
  assert.ok(cards[0].firstButtonOptions?.text?.includes("70 PLN"));
  assert.equal(cards[0].secondButtonOptions, undefined);
  assert.ok(cards[1].firstButtonOptions?.href?.includes(LOVE_ME_IN_THE_MORNING_OFFER_ID));

  herLies.offers[0].salesEnabled = false;
  herLies.offers[1].salesEnabled = true;
  const mentorCard = getChoreos((key) => key, products)[0];
  assert.equal(mentorCard.firstButtonOptions, undefined);
  assert.ok(mentorCard.secondButtonOptions?.href?.includes(herLies.offers[1].id));

  herLies.salesEnabled = false;
  assert.deepEqual(
    getChoreos((key) => key, products).map((card) => card.id),
    ["choreo-love-me-in-the-morning"],
  );
  love.salesEnabled = false;
  assert.deepEqual(
    getChoreos((key) => key, products),
    [],
  );
  assert.deepEqual(
    getChoreos((key) => key, []),
    [],
  );
});

test("shows a card and its exact tariff buttons only when both levels of sales allow it", () => {
  for (const productEnabled of [false, true]) {
    for (const withoutMentorEnabled of [false, true]) {
      for (const withMentorEnabled of [false, true]) {
        const product = structuredClone(SELLABLE_PRODUCTS["choreo-her-lies"]);
        product.salesEnabled = productEnabled;
        product.offers[0].salesEnabled = withoutMentorEnabled;
        product.offers[1].salesEnabled = withMentorEnabled;

        const cards = getChoreos((key) => key, [product]);
        const context = JSON.stringify({
          productEnabled,
          withoutMentorEnabled,
          withMentorEnabled,
        });
        if (!productEnabled || (!withoutMentorEnabled && !withMentorEnabled)) {
          assert.deepEqual(cards, [], context);
          continue;
        }

        assert.equal(cards.length, 1, context);
        assert.equal(Boolean(cards[0].firstButtonOptions), withoutMentorEnabled, context);
        assert.equal(Boolean(cards[0].secondButtonOptions), withMentorEnabled, context);
      }
    }
  }
});

test("keeps the new timed tutorial independent from historical lifetime Birthday Drop access", () => {
  const product = SELLABLE_PRODUCTS["choreo-love-me-in-the-morning"];
  assert.notEqual(product.id, SELLABLE_PRODUCTS["choreo-birthday-drop"].id);
  assert.deepEqual(
    product.offers.map((offer) => offer.code),
    ["without-mentor"],
  );
  assert.deepEqual(product.offers[0].prices, { pln: 65, eur: 15 });
  assert.equal(product.salesEnabled, false);
  assert.equal(getOfferAccessDurationDaysByOfferId(LOVE_ME_IN_THE_MORNING_OFFER_ID), 60);
  assert.equal(isChoreoChannelOfferId(LOVE_ME_IN_THE_MORNING_OFFER_ID), true);
  assert.equal(isLifetimeChannelOfferId(LOVE_ME_IN_THE_MORNING_OFFER_ID), false);
  assert.equal(isLifetimeChannelOfferId(BIRTHDAY_DROP_OFFER_ID), true);
  assert.equal(isChoreoChannelOfferId(BIRTHDAY_DROP_OFFER_ID), false);
});
