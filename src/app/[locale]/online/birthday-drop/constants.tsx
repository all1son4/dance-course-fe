import type { ReactNode } from "react";

import {
  BIRTHDAY_DROP_OFFER_ID,
  BIRTHDAY_DROP_PRODUCT_ID,
  buildCheckoutHref,
  getSellableProductById,
  getSellableProductOfferById,
} from "@/constants/sellable-products";
import {
  OnlineCalendar,
  OnlineCreditCard,
  OnlineInspiration,
  OnlineMusic,
  OnlineQuestion,
  OnlineTelegram,
  OnlineVideo,
} from "@/svg";

import {
  buildOnlineSuggestionCards,
  type OnlineSuggestionCard,
  type OnlineSuggestionDefinition,
} from "../_shared/content";

type Translate = (key: string) => string;
type RichTranslate = (key: string) => ReactNode;

/** Anchor targets: the hero button and the drop's own call to action link here. */
export const BIRTHDAY_ABOUT_SECTION_ID = "birthday-special-offer-about";

/** Reel shown inside the drop block. */
export const BIRTHDAY_DROP_VIDEO_SRC =
  "https://www.instagram.com/reel/DbLsw9eNbai/?igsh=bW82Yzg1M3R5dWFx";

const BIRTHDAY_SUGGESTION_DEFINITIONS = [
  {
    id: "video",
    icon: OnlineVideo,
    titleKey: "suggestions.video.title",
    textKey: "suggestions.video.text",
  },
  {
    id: "playlist",
    icon: OnlineMusic,
    titleKey: "suggestions.playlist.title",
    textKey: "suggestions.playlist.text",
  },
  {
    id: "moodboard",
    icon: OnlineInspiration,
    titleKey: "suggestions.moodboard.title",
    textKey: "suggestions.moodboard.text",
    textResolver: "rich",
  },
  {
    id: "questions",
    icon: OnlineQuestion,
    titleKey: "suggestions.questions.title",
    textKey: "suggestions.questions.text",
  },
  {
    id: "access",
    icon: OnlineCalendar,
    titleKey: "suggestions.access.title",
    textKey: "suggestions.access.text",
  },
  {
    id: "telegram",
    icon: OnlineTelegram,
    titleKey: "suggestions.telegram.title",
    textKey: "suggestions.telegram.text",
  },
  {
    id: "payment",
    icon: OnlineCreditCard,
    titleKey: "suggestions.payment.title",
    textKey: "suggestions.payment.text",
    textResolver: "rich",
  },
] satisfies readonly OnlineSuggestionDefinition[];

/**
 * Checkout details for The Birthday Drop button: the link and the price both
 * come from the catalogue, so the page never carries a second copy of a price.
 */
export const getBirthdayDropCheckout = () => {
  const product = getSellableProductById(BIRTHDAY_DROP_PRODUCT_ID);
  const offer = product
    ? getSellableProductOfferById(product, BIRTHDAY_DROP_OFFER_ID)
    : null;

  if (!product || !offer) {
    return null;
  }

  return {
    href: buildCheckoutHref({ offerId: offer.id, productId: product.id }),
    price: `${offer.prices.pln} PLN / ${offer.prices.eur} €`,
  };
};

export const getBirthdaySuggestions = (
  t: Translate,
  tRich: RichTranslate,
): OnlineSuggestionCard[] =>
  buildOnlineSuggestionCards({
    definitions: BIRTHDAY_SUGGESTION_DEFINITIONS,
    t,
    tRich,
  });
