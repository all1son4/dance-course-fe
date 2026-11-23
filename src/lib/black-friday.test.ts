import assert from "node:assert/strict";
import test from "node:test";

import {
  HER_LIES_WITHOUT_MENTOR_OFFER_ID,
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  INSPIRATION_HUB_RENEWAL_OFFER_ID,
  LOVE_ME_IN_THE_MORNING_OFFER_ID,
  SELLABLE_PRODUCTS_LIST,
} from "@/constants/sellable-products";

import {
  applyBlackFridayToOffer,
  applyBlackFridayToProducts,
  BLACK_FRIDAY_CAMPAIGN,
  getCampaignSavings,
  isBlackFridayActive,
  isBlackFridayHubOffer,
  isBlackFridayPurchase,
} from "./black-friday";

const BEFORE = new Date("2026-11-23T23:59:59+01:00");
const FIRST_SECOND = new Date("2026-11-24T00:00:00+01:00");
const LAST_SECOND = new Date("2026-11-30T23:59:59+01:00");
const AFTER = new Date("2026-12-01T00:00:00+01:00");

const findOffer = (offerId: string) => {
  const offer = SELLABLE_PRODUCTS_LIST.flatMap((product) => product.offers).find(
    (candidate) => candidate.id === offerId,
  );
  assert.ok(offer, offerId);
  return offer;
};

test("the campaign runs from 24.11 00:00 to 30.11 23:59:59 Warsaw time", () => {
  assert.equal(isBlackFridayActive(BEFORE), false);
  assert.equal(isBlackFridayActive(FIRST_SECOND), true);
  assert.equal(isBlackFridayActive(LAST_SECOND), true);
  assert.equal(isBlackFridayActive(AFTER), false);
});

test("inside the window the current tutorials cost 10 € / 45 PLN, the regular price is kept for the strike", () => {
  for (const offerId of [
    HER_LIES_WITHOUT_MENTOR_OFFER_ID,
    LOVE_ME_IN_THE_MORNING_OFFER_ID,
  ]) {
    const regular = findOffer(offerId);
    const offer = applyBlackFridayToOffer(regular, LAST_SECOND);

    assert.deepEqual(offer.prices, { eur: 10, pln: 45 });
    assert.deepEqual(offer.compareAtPrices, regular.prices);
    assert.equal(offer.campaign, BLACK_FRIDAY_CAMPAIGN);
  }
});

test("only the full-price Hub gets 16 weeks; the special-price link stays at 8", () => {
  const full = applyBlackFridayToOffer(
    findOffer(INSPIRATION_HUB_ACCESS_OFFER_ID),
    FIRST_SECOND,
  );
  const special = findOffer(INSPIRATION_HUB_RENEWAL_OFFER_ID);

  assert.equal(full.telegramAccessDurationDays, 112);
  assert.deepEqual(full.prices, findOffer(INSPIRATION_HUB_ACCESS_OFFER_ID).prices);
  assert.equal(full.campaign, BLACK_FRIDAY_CAMPAIGN);
  assert.equal(applyBlackFridayToOffer(special, FIRST_SECOND), special);
  assert.equal(
    isBlackFridayHubOffer(INSPIRATION_HUB_RENEWAL_OFFER_ID, FIRST_SECOND),
    false,
  );
});

test("outside the window the catalogue is returned untouched", () => {
  for (const moment of [BEFORE, AFTER]) {
    assert.equal(
      applyBlackFridayToProducts(SELLABLE_PRODUCTS_LIST, moment),
      SELLABLE_PRODUCTS_LIST,
    );
  }
});

test("inside the window every other offer stays as it is", () => {
  const campaignOfferIds = new Set([
    HER_LIES_WITHOUT_MENTOR_OFFER_ID,
    LOVE_ME_IN_THE_MORNING_OFFER_ID,
    INSPIRATION_HUB_ACCESS_OFFER_ID,
  ]);
  const products = applyBlackFridayToProducts(SELLABLE_PRODUCTS_LIST, FIRST_SECOND);

  for (const offer of products.flatMap((product) => product.offers)) {
    if (!campaignOfferIds.has(offer.id)) assert.equal(offer, findOffer(offer.id));
  }
});

test("a purchase is marked Black Friday by its offer and moment, not by the switch", () => {
  const inside = new Date("2026-11-27T12:00:00+01:00");
  const after = new Date("2026-12-01T00:00:00+01:00");

  assert.equal(isBlackFridayPurchase(INSPIRATION_HUB_ACCESS_OFFER_ID, inside), true);
  assert.equal(isBlackFridayPurchase(HER_LIES_WITHOUT_MENTOR_OFFER_ID, inside), true);
  // The special-price Hub link keeps its 8 weeks and its usual look.
  assert.equal(isBlackFridayPurchase(INSPIRATION_HUB_RENEWAL_OFFER_ID, inside), false);
  assert.equal(isBlackFridayPurchase(INSPIRATION_HUB_ACCESS_OFFER_ID, after), false);
});

test("the saving is the regular price minus the campaign one", () => {
  const offer = applyBlackFridayToOffer(
    findOffer(LOVE_ME_IN_THE_MORNING_OFFER_ID),
    FIRST_SECOND,
  );

  assert.deepEqual(getCampaignSavings(offer), { eur: 5, pln: 20 });
  assert.equal(getCampaignSavings(findOffer(LOVE_ME_IN_THE_MORNING_OFFER_ID)), null);
});
