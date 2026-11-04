import type { ReactNode } from "react";

import type {
  ChoreoCardButtonProps,
  ChoreoCardProps,
} from "@/components/cards/ChoreoCard";
import SvgAsset from "@/components/common/SvgAsset";
import { CHOREO_HER_LIES_REEL_URL, CHOREO_STILL_ALIVE_REEL_URL } from "@/constants/links";
import {
  buildCheckoutHref,
  CHOREO_CATALOGUE_PRODUCT_CODES,
  formatOfferPrice,
  isOfferSaleOpen,
  type SellableProduct,
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

import {
  buildOnlineSuggestionCards,
  type OnlineSuggestionCard,
  type OnlineSuggestionDefinition,
} from "../_shared/content";

type Translate = (key: string) => string;
type RichTranslate = (key: string) => ReactNode;
type ChoreoCardData = ChoreoCardProps & {
  id: SellableProductCode;
};

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

const CHOREO_PRESENTATIONS = {
  "choreo-still-alive": {
    posterSrc: "/images/still_alive_poster.webp",
    videoSrc: CHOREO_STILL_ALIVE_REEL_URL,
  },
  "choreo-her-lies": {
    posterSrc: "/images/her_lies_poster.webp",
    videoSrc: CHOREO_HER_LIES_REEL_URL,
  },
  "choreo-bundle": {
    posterSrc: "/images/bundle_poster.webp",
  },
  "choreo-love-me-in-the-morning": {
    posterSrc: "/images/love_me_in_the_morning_poster.webp",
  },
} satisfies Partial<
  Record<SellableProductCode, Pick<ChoreoCardProps, "posterSrc" | "videoSrc">>
>;

const getChoreoPresentation = (code: SellableProductCode) => {
  if (code in CHOREO_PRESENTATIONS) {
    return CHOREO_PRESENTATIONS[code as keyof typeof CHOREO_PRESENTATIONS];
  }

  return {};
};

const getChoreoCardCopy = (
  code: SellableProductCode,
  title: string,
  t: Translate,
): Pick<ChoreoCardProps, "icon" | "specialOffer" | "subtitle" | "title"> => {
  if (code === "choreo-bundle") {
    return {
      icon: <SvgAsset src="/svg/Discount30.png" width={87} height={93} sizes="87px" />,
      specialOffer: true,
      subtitle: getCompactChoreoTitle(title),
      title: t("choreoBundle.cardTitle"),
    };
  }

  return {
    title: getCompactChoreoTitle(title),
  };
};

const CHOREO_SUGGESTION_DEFINITIONS = [
  {
    id: "video",
    icon: OnlineVideo,
    titleKey: "suggestions.1.title",
    textKey: "suggestions.1.text",
  },
  {
    id: "structure",
    icon: OnlineStructure,
    titleKey: "suggestions.2.title",
    textKey: "suggestions.2.text",
  },
  {
    id: "calendar",
    icon: OnlineCalendar,
    titleKey: "suggestions.3.title",
    textKey: "suggestions.3.text",
  },
  {
    id: "telegram",
    icon: OnlineTelegram,
    titleKey: "suggestions.4.title",
    textKey: "suggestions.4.text",
  },
  {
    id: "group",
    icon: OnlineGroup,
    titleKey: "suggestions.5.title",
    textKey: "suggestions.5.text",
  },
  {
    id: "payment",
    icon: OnlineCreditCard,
    titleKey: "suggestions.6.title",
    textKey: "suggestions.6.text",
    textResolver: "rich",
  },
] satisfies readonly OnlineSuggestionDefinition[];

const formatOfferButtonText = (t: Translate, offer: SellableProductOffer) =>
  `${t(offer.labelKey)} ${formatOfferPrice(offer.prices)}`;

const buildChoreoButtonOptions = (
  product: SellableProduct,
  t: Translate,
  offer?: SellableProductOffer,
): ChoreoCardButtonProps | undefined =>
  offer
    ? {
        href: buildCheckoutHref({
          offerId: offer.id,
          productId: product.id,
        }),
        analytics: {
          id: "buy_choreo",
          offer_code: offer.code,
          offer_id: offer.id,
          placement: `choreo_card:${product.code}`,
          product_code: product.code,
          product_id: product.id,
        },
        text: formatOfferButtonText(t, offer),
      }
    : undefined;

export const getChoreoSuggestions = (
  t: Translate,
  tRich: RichTranslate,
): OnlineSuggestionCard[] =>
  buildOnlineSuggestionCards({
    definitions: CHOREO_SUGGESTION_DEFINITIONS,
    t,
    tRich,
  });

/** Show current breakdowns only while their product and at least one tariff are open. */
export const getChoreos = (
  t: Translate,
  catalogProducts: readonly SellableProduct[],
): ChoreoCardData[] =>
  CHOREO_CATALOGUE_PRODUCT_CODES.flatMap((code): ChoreoCardData[] => {
    const product = catalogProducts.find((candidate) => candidate.code === code);
    if (!product || !product.salesEnabled) return [];

    const withoutMentorOffer = product.offers.find(
      (offer) => offer.code === "without-mentor" && isOfferSaleOpen(product, offer),
    );
    const withMentorOffer = product.offers.find(
      (offer) => offer.code === "with-mentor" && isOfferSaleOpen(product, offer),
    );
    if (!withoutMentorOffer && !withMentorOffer) return [];

    const presentation = getChoreoPresentation(code);
    const copy = getChoreoCardCopy(code, t(product.titleKey), t);

    return [
      {
        id: code,
        analyticsId: code,
        ...presentation,
        ...copy,
        firstButtonOptions: buildChoreoButtonOptions(product, t, withoutMentorOffer),
        secondButtonOptions: buildChoreoButtonOptions(product, t, withMentorOffer),
      },
    ];
  });
