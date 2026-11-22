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
/**
 * Offers whose Telegram access never expires. They are declared by workflow
 * rather than by id, and deliberately stay out of the timed buckets above: the
 * revocation sweep only looks at choreo-channel and first-touch offers, so an
 * offer listed here is never given an expiry and never revoked.
 */
const LIFETIME_CHANNEL_OFFER_IDS = new Set(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.offers
      .filter((offer) => offer.accessWorkflow === "telegram-channel-lifetime")
      .map((offer) => offer.id),
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

export const isLifetimeChannelOfferId = (offerId: string) =>
  LIFETIME_CHANNEL_OFFER_IDS.has(offerId);

export const getOfferMetadataById = (offerId: string) =>
  OFFER_METADATA_BY_ID.get(offerId) ?? null;

export const getOfferAccessDurationDaysByOfferId = (offerId: string) =>
  OFFER_ACCESS_DURATION_DAYS_BY_ID.get(offerId) ?? null;

const DEFAULT_TELEGRAM_CHOREO_ACCESS_DAYS = 60;

/** A positive number from the environment, or null when it is unset or not positive. */
export const parsePositiveEnvNumber = (name: string) => {
  const parsedValue = Number.parseFloat(process.env[name]?.trim() ?? "");

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const getTimedTelegramAccessDurationDays = (offerId: string) => {
  if (isChoreoChannelOfferId(offerId)) {
    return (
      parsePositiveEnvNumber("TELEGRAM_CHOREO_ACCESS_DAYS") ??
      getOfferAccessDurationDaysByOfferId(offerId) ??
      DEFAULT_TELEGRAM_CHOREO_ACCESS_DAYS
    );
  }

  if (isFirstTouchOfferId(offerId)) {
    return getOfferAccessDurationDaysByOfferId(offerId);
  }

  return null;
};

/** How long timed channel access runs after joining, in ms; 0 for offers without it. */
export const getTelegramChannelAccessDurationMs = (offerId: string) => {
  const durationDays = getTimedTelegramAccessDurationDays(offerId);

  if (!durationDays) {
    return 0;
  }

  // Duration controls how long timed Telegram access stays active after joining.
  // Example: 60 -> 60 days, 0.01 -> ~14.4 minutes (testing).
  return durationDays * 24 * 60 * 60 * 1000;
};
