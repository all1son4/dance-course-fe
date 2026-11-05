import assert from "node:assert/strict";
import test from "node:test";

import { getChoreos, getOpenChoreoCourses } from "@/app/[locale]/online/choreo/constants";
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
import en from "@/messages/en.json";
import pl from "@/messages/pl.json";
import ru from "@/messages/ru.json";

test("structured data lists only open tutorials with their open tariffs", () => {
  const products = structuredClone(SELLABLE_PRODUCTS_LIST);
  const herLies = products.find((product) => product.code === "choreo-her-lies")!;
  const love = products.find(
    (product) => product.code === "choreo-love-me-in-the-morning",
  )!;
  herLies.salesEnabled = true;
  love.salesEnabled = false;

  const courses = getOpenChoreoCourses((key) => key, products);

  assert.equal(courses.length, 1);
  assert.deepEqual(
    courses[0].offers.map((offer) => offer.id),
    herLies.offers
      .filter((offer) => offer.salesEnabled && offer.code === "without-mentor")
      .concat(
        herLies.offers.filter(
          (offer) => offer.salesEnabled && offer.code === "with-mentor",
        ),
      )
      .map((offer) => offer.id),
  );
});

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
  assert.ok(cards[0].price?.includes("70 PLN"));
  assert.equal(cards[0].firstButtonOptions?.text, "buyButton");
  assert.equal(cards[0].secondButtonOptions, undefined);
  assert.ok(cards[1].firstButtonOptions?.href?.includes(LOVE_ME_IN_THE_MORNING_OFFER_ID));

  herLies.offers[0].salesEnabled = false;
  herLies.offers[1].salesEnabled = true;
  const mentorCard = getChoreos((key) => key, products)[0];
  assert.equal(mentorCard.firstButtonOptions, undefined);
  assert.ok(mentorCard.secondButtonOptions?.href?.includes(herLies.offers[1].id));
  assert.equal(mentorCard.secondButtonOptions?.text, "buyButton");
  assert.ok(mentorCard.price?.includes("100 PLN"));

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
        if (withoutMentorEnabled && withMentorEnabled) {
          assert.equal(cards[0].price, undefined, context);
          assert.match(
            cards[0].firstButtonOptions!.text!,
            /offers.withoutMentor.*65/u,
            context,
          );
          assert.match(
            cards[0].secondButtonOptions!.text!,
            /offers.withMentor.*100/u,
            context,
          );
        } else {
          const offer = product.offers.find((offer) => offer.salesEnabled)!;
          assert.ok(cards[0].price?.includes(String(offer.prices.pln)), context);
          const button = cards[0].firstButtonOptions ?? cards[0].secondButtonOptions;
          assert.equal(button?.text, "buyButton", context);
          assert.ok(button?.href?.includes(offer.id), context);
        }
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

test("single-option cards use localized purchase CTAs with a separate price in all languages", () => {
  const product = structuredClone(SELLABLE_PRODUCTS["choreo-love-me-in-the-morning"]);
  product.salesEnabled = true;
  product.offers[0].salesEnabled = true;
  for (const messages of [ru, en, pl]) {
    const t = (key: string) => {
      const value = key
        .split(".")
        .reduce<unknown>(
          (value, part) => (value as Record<string, unknown>)[part],
          messages.SellableProducts,
        );
      assert.equal(typeof value, "string", key);
      return value as string;
    };
    const [card] = getChoreos(t, [product]);
    assert.equal(card.firstButtonOptions?.text, messages.SellableProducts.buyButton);
    assert.match(card.price!, /65.*15/u);
    assert.doesNotMatch(card.firstButtonOptions!.text!, /65|15|mentor|куратор/iu);
  }
});
