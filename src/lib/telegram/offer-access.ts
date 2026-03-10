import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";

const WITHOUT_MENTOR_OFFER_IDS = new Set(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.offers
      .filter((offer) => offer.code === "without-mentor")
      .map((offer) => offer.id),
  ),
);

const OFFER_METADATA_BY_ID = new Map(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.offers.map((offer) => [
      offer.id,
      {
        offerCode: offer.code,
        offerId: offer.id,
        offerLabel: offer.label,
        productId: product.id,
        productSlug: product.slug,
        productTitle: product.title,
      },
    ]),
  ),
);

export const isWithoutMentorOfferId = (offerId: string) =>
  WITHOUT_MENTOR_OFFER_IDS.has(offerId);

export const getOfferMetadataById = (offerId: string) =>
  OFFER_METADATA_BY_ID.get(offerId) ?? null;
