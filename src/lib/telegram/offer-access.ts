import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";

const WITHOUT_MENTOR_OFFER_IDS = new Set(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.offers
      .filter((offer) => offer.code === "without-mentor")
      .map((offer) => offer.id),
  ),
);
const WITH_MENTOR_OFFER_IDS = new Set(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.offers
      .filter((offer) => offer.code === "with-mentor")
      .map((offer) => offer.id),
  ),
);
const CHOREO_CHANNEL_OFFER_IDS = new Set(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.type === "choreo"
      ? product.offers
          .filter(
            (offer) => offer.code === "with-mentor" || offer.code === "without-mentor",
          )
          .map((offer) => offer.id)
      : [],
  ),
);
const FIRST_TOUCH_OFFER_IDS = new Set(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.code === "first-touch" ? product.offers.map((offer) => offer.id) : [],
  ),
);
const RENEWAL_DISCOUNT_OFFER_IDS = new Set(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.offers
      .filter(
        (offer) =>
          offer.code === "renewal-discount" || offer.code === "renewal-library-access",
      )
      .map((offer) => offer.id),
  ),
);
const ONLINE_GROUP_OFFER_IDS = new Set(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.code === "online-group-anna-strok"
      ? product.offers.map((offer) => offer.id)
      : [],
  ),
);
const OFFER_ACCESS_DURATION_DAYS_BY_ID = new Map(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.offers.map((offer) => [offer.id, offer.telegramAccessDurationDays] as const),
  ),
);

const OFFER_METADATA_BY_ID = new Map(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.offers.map((offer) => [
      offer.id,
      {
        accessWorkflow: offer.accessWorkflow ?? "",
        deliveryChannel: offer.deliveryChannel ?? "",
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

export const isWithMentorOfferId = (offerId: string) =>
  WITH_MENTOR_OFFER_IDS.has(offerId);

export const isChoreoChannelOfferId = (offerId: string) =>
  CHOREO_CHANNEL_OFFER_IDS.has(offerId);

export const isFirstTouchOfferId = (offerId: string) =>
  FIRST_TOUCH_OFFER_IDS.has(offerId);

export const isRenewalDiscountOfferId = (offerId: string) =>
  RENEWAL_DISCOUNT_OFFER_IDS.has(offerId);

export const isOnlineGroupAccessOfferId = (offerId: string) =>
  ONLINE_GROUP_OFFER_IDS.has(offerId);

export const getOfferMetadataById = (offerId: string) =>
  OFFER_METADATA_BY_ID.get(offerId) ?? null;

export const getOfferAccessDurationDaysByOfferId = (offerId: string) =>
  OFFER_ACCESS_DURATION_DAYS_BY_ID.get(offerId) ?? null;
