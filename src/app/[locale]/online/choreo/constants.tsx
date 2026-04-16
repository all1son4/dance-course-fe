import type { ReactNode } from "react";

import { CHOREO_HER_LIES_REEL_URL, CHOREO_STILL_ALIVE_REEL_URL } from "@/constants/links";
import {
  buildCheckoutHref,
  SELLABLE_PRODUCTS_LIST,
  type SellableProductCode,
  type SellableProductOffer,
} from "@/constants/sellable-products";
import {
  OnlineCalendar,
  OnlineCreditCard,
  OnlineGroup,
  OnlineStructure,
  OnlineTelegram,
  OnlineVideo,
} from "@/svg";

export type TOnlineSuggestion = {
  id: number;
  icon?: ReactNode;
  title?: ReactNode;
  text?: ReactNode;
};

export type TChoreoCard = {
  id: number;
  videoSrc?: string;
  posterSrc?: string;
  title?: string;
  firstButtonOptions?: {
    href?: string;
    text?: string;
  };
  secondButtonOptions?: {
    href?: string;
    text?: string;
  };
};

type Translate = (key: string) => string;
type RichTranslate = (key: string) => ReactNode;

const getCompactChoreoTitle = (title: string) => {
  const quotedMatches = Array.from(
    title.matchAll(/["“”«»]([^"“”«»]+)["“”«»]/gu),
    (match) => match[1]?.trim() ?? "",
  ).filter(Boolean);

  if (quotedMatches.length > 0) {
    return quotedMatches.join(" + ");
  }

  return title;
};

const getChoreoPresentation = (code: SellableProductCode) => {
  if (code === "choreo-still-alive") {
    return {
      posterSrc: "/images/still_alive_poster.webp",
      videoSrc: CHOREO_STILL_ALIVE_REEL_URL,
    };
  }

  if (code === "choreo-her-lies") {
    return {
      posterSrc: "/images/her_lies_poster.webp",
      videoSrc: CHOREO_HER_LIES_REEL_URL,
    };
  }

  if (code === "choreo-bundle") {
    return {
      posterSrc: "",
    };
  }

  return {};
};

const formatOfferButtonText = (t: Translate, offer: SellableProductOffer) =>
  `${t(offer.labelKey)} ${offer.prices.pln} PLN / ${offer.prices.eur} €`;

export const getOnlineSuggestions = (
  t: Translate,
  tRich: RichTranslate,
): TOnlineSuggestion[] => [
  {
    id: 1,
    icon: <OnlineVideo />,
    title: t("suggestions.1.title"),
    text: t("suggestions.1.text"),
  },
  {
    id: 2,
    icon: <OnlineStructure />,
    title: t("suggestions.2.title"),
    text: t("suggestions.2.text"),
  },
  {
    id: 3,
    icon: <OnlineCalendar />,
    title: t("suggestions.3.title"),
    text: t("suggestions.3.text"),
  },
  {
    id: 4,
    icon: <OnlineTelegram />,
    title: t("suggestions.4.title"),
    text: t("suggestions.4.text"),
  },
  {
    id: 5,
    icon: <OnlineGroup />,
    title: t("suggestions.5.title"),
    text: t("suggestions.5.text"),
  },
  {
    id: 6,
    icon: <OnlineCreditCard />,
    title: t("suggestions.6.title"),
    text: tRich("suggestions.6.text"),
  },
];

export const getChoreos = (t: Translate): TChoreoCard[] =>
  SELLABLE_PRODUCTS_LIST.filter((product) => product.type === "choreo").map(
    (product, index) => {
      const presentation = getChoreoPresentation(product.code);
      const withoutMentorOffer = product.offers.find(
        (offer) => offer.code === "without-mentor",
      );
      const withMentorOffer = product.offers.find(
        (offer) => offer.code === "with-mentor",
      );

      return {
        id: index + 1,
        posterSrc: presentation.posterSrc,
        title: getCompactChoreoTitle(t(product.titleKey)),
        videoSrc: presentation.videoSrc,
        firstButtonOptions: withoutMentorOffer
          ? {
              href: buildCheckoutHref({
                offerId: withoutMentorOffer.id,
                productId: product.id,
              }),
              text: formatOfferButtonText(t, withoutMentorOffer),
            }
          : undefined,
        secondButtonOptions: withMentorOffer
          ? {
              href: buildCheckoutHref({
                offerId: withMentorOffer.id,
                productId: product.id,
              }),
              text: formatOfferButtonText(t, withMentorOffer),
            }
          : undefined,
      };
    },
  );
