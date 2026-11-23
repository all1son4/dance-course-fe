/**
 * Black Friday 2026 — the whole campaign in one place.
 *
 * Inside the window the storefront and the checkout sell the current choreography
 * tutorials at 10 € / 45 PLN and the Inspiration Hub at its full price for 16 weeks
 * instead of 8. Outside it everything is exactly as before: the window closes on its
 * own at 30.11 23:59:59 Warsaw time, without a deploy. To stop the campaign earlier,
 * set BLACK_FRIDAY_ENABLED to false.
 *
 * What stays after the end, on purpose: periods already bought for 112 days keep
 * their length (the Hub engine reads it from each right), and those purchases keep
 * their Black Friday mark in «Мой доступ» until their access ends.
 */
import {
  HER_LIES_WITHOUT_MENTOR_OFFER_ID,
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  LOVE_ME_IN_THE_MORNING_OFFER_ID,
  type SellableProduct,
  type SellableProductOffer,
  type SellableProductPrices,
} from "@/constants/sellable-products";

/** Master switch. False ends the campaign at once, whatever the dates say. */
export const BLACK_FRIDAY_ENABLED = true;

export const BLACK_FRIDAY_STARTS_AT = new Date("2026-11-24T00:00:00+01:00");
/** Exclusive: the last moment of the campaign is 30.11.2026 23:59:59 in Warsaw. */
export const BLACK_FRIDAY_ENDS_AT = new Date("2026-12-01T00:00:00+01:00");

/** Stored on the payment so receipts, alerts and reports can tell these sales apart. */
export const BLACK_FRIDAY_CAMPAIGN = "black-friday-2026";

/** The Hub length of a full-price purchase inside the window: 16 weeks. */
export const BLACK_FRIDAY_HUB_PERIOD_DAYS = 112;
export const BLACK_FRIDAY_HUB_WEEKS = 16;

/** The tutorials on sale now, all at one price. */
const BLACK_FRIDAY_CHOREO_PRICES: Readonly<Record<string, SellableProductPrices>> = {
  [HER_LIES_WITHOUT_MENTOR_OFFER_ID]: { eur: 10, pln: 45 },
  [LOVE_ME_IN_THE_MORNING_OFFER_ID]: { eur: 10, pln: 45 },
};

export const isBlackFridayActive = (now: Date = new Date()) =>
  BLACK_FRIDAY_ENABLED &&
  now.getTime() >= BLACK_FRIDAY_STARTS_AT.getTime() &&
  now.getTime() < BLACK_FRIDAY_ENDS_AT.getTime();

/** Only the full price: the special-price Hub link stays at 8 weeks. */
export const isBlackFridayHubOffer = (offerId: string, now: Date = new Date()) =>
  offerId === INSPIRATION_HUB_ACCESS_OFFER_ID && isBlackFridayActive(now);

export const isBlackFridayChoreoOffer = (offerId: string, now: Date = new Date()) =>
  offerId in BLACK_FRIDAY_CHOREO_PRICES && isBlackFridayActive(now);

/**
 * The offer as the storefront sells it right now: inside the window a tutorial gets
 * its campaign price (the regular one moves to `compareAtPrices`, for the struck
 * price) and the full-price Hub gets 112 days. Outside it the offer is unchanged.
 */
export const applyBlackFridayToOffer = (
  offer: SellableProductOffer,
  now: Date = new Date(),
): SellableProductOffer => {
  if (isBlackFridayChoreoOffer(offer.id, now)) {
    return {
      ...offer,
      campaign: BLACK_FRIDAY_CAMPAIGN,
      compareAtPrices: offer.prices,
      prices: BLACK_FRIDAY_CHOREO_PRICES[offer.id],
    };
  }

  if (isBlackFridayHubOffer(offer.id, now)) {
    return {
      ...offer,
      campaign: BLACK_FRIDAY_CAMPAIGN,
      telegramAccessDurationDays: BLACK_FRIDAY_HUB_PERIOD_DAYS,
    };
  }

  return offer;
};

export const applyBlackFridayToProducts = (
  products: SellableProduct[],
  now: Date = new Date(),
): SellableProduct[] =>
  isBlackFridayActive(now)
    ? products.map((product) => ({
        ...product,
        offers: product.offers.map((offer) => applyBlackFridayToOffer(offer, now)),
      }))
    : products;

export const isBlackFridayOffer = (offer: Pick<SellableProductOffer, "campaign">) =>
  offer.campaign === BLACK_FRIDAY_CAMPAIGN;

/**
 * A purchase made on the campaign's terms: one of its offers, bought inside the
 * window. A fact of the purchase, so «Мой доступ» keeps the mark after the end,
 * for as long as the access runs, whatever the master switch says later.
 */
export const isBlackFridayPurchase = (offerId: string, boughtAt: Date) =>
  (offerId in BLACK_FRIDAY_CHOREO_PRICES ||
    offerId === INSPIRATION_HUB_ACCESS_OFFER_ID) &&
  boughtAt.getTime() >= BLACK_FRIDAY_STARTS_AT.getTime() &&
  boughtAt.getTime() < BLACK_FRIDAY_ENDS_AT.getTime();
