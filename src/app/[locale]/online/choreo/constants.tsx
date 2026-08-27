import type { ReactNode } from "react";

import type {
  ChoreoCardButtonProps,
  ChoreoCardProps,
} from "@/components/cards/ChoreoCard";
import SvgAsset from "@/components/common/SvgAsset";
import { CHOREO_HER_LIES_REEL_URL, CHOREO_STILL_ALIVE_REEL_URL } from "@/constants/links";
import {
  buildCheckoutHref,
  SELLABLE_PRODUCTS_LIST,
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
  "choreo-birthday-drop": {
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
  `${t(offer.labelKey)} ${offer.prices.pln} PLN / ${offer.prices.eur} €`;

const buildChoreoButtonOptions = (
  productId: string,
  t: Translate,
  offer?: SellableProductOffer,
): ChoreoCardButtonProps | undefined =>
  offer
    ? {
        href: buildCheckoutHref({
          offerId: offer.id,
          productId,
        }),
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

/**
 * The regular breakdowns are the ones sold with and without a mentor. The
 * The Birthday Drop is a choreo too, but it has its own section on this page, so it
 * is deliberately kept out of the catalogue instead of being listed twice.
 */
const isRegularChoreoProduct = (product: SellableProduct) =>
  product.type === "choreo" &&
  product.offers.some((offer) => offer.code === "without-mentor");

/**
 * `openProductIds` comes from the admin sales switch: a closed breakdown keeps
 * its card, its video and its copy, and only loses the buy buttons.
 */
export const getChoreos = (
  t: Translate,
  openProductIds: ReadonlySet<string>,
): ChoreoCardData[] =>
  SELLABLE_PRODUCTS_LIST.filter(isRegularChoreoProduct).map((product) => {
    const presentation = getChoreoPresentation(product.code);
    const title = t(product.titleKey);
    const copy = getChoreoCardCopy(product.code, title, t);
    const isSaleOpen = openProductIds.has(product.id);
    const withoutMentorOffer = product.offers.find(
      (offer) => offer.code === "without-mentor",
    );
    const withMentorOffer = product.offers.find((offer) => offer.code === "with-mentor");

    return {
      id: product.code,
      ...presentation,
      ...copy,
      firstButtonOptions: buildChoreoButtonOptions(
        product.id,
        t,
        isSaleOpen ? withoutMentorOffer : undefined,
      ),
      secondButtonOptions: buildChoreoButtonOptions(
        product.id,
        t,
        isSaleOpen ? withMentorOffer : undefined,
      ),
    };
  });
