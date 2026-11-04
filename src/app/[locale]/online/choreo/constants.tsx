import type { ReactNode } from "react";

import type {
  ChoreoCardButtonProps,
  ChoreoCardPriceAnchor,
  ChoreoCardProps,
} from "@/components/cards/ChoreoCard";
import SvgAsset from "@/components/common/SvgAsset";
import {
  CHOREO_HER_LIES_REEL_URL,
  CHOREO_LOVE_ME_IN_THE_MORNING_REEL_URL,
  CHOREO_STILL_ALIVE_REEL_URL,
} from "@/constants/links";
import {
  buildCheckoutHref,
  CHOREO_CATALOGUE_PRODUCT_CODES,
  formatOfferPrice,
  isOfferSaleOpen,
  type SellableProduct,
  type SellableProductCode,
  type SellableProductOffer,
} from "@/constants/sellable-products";
import { shouldShowOfferLabel } from "@/lib/choreo-offer-presentation";
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

/**
 * Poster, Instagram reel and optional hover/in-view preview per card.
 *
 * Preview clips: add `previewSrc: "/videos/choreo/<slug>-preview.mp4"` and put
 * the file in `public/videos/choreo/`. Keep it short and light - about 5 s,
 * 720 px wide, H.264, no audio track, under ~600 KB, first frame close to the
 * poster - e.g.
 *   ffmpeg -ss <start> -t 5 -i reel.mp4 -map 0:v:0 -an -map_metadata -1
 *     -vf "scale=720:-2,fps=30" -c:v libx264 -profile:v high -crf 28
 *     -preset slow -pix_fmt yuv420p -movflags +faststart
 *     public/videos/choreo/<slug>-preview.mp4
 * Without one, the card shows its poster exactly as before.
 */
const CHOREO_PRESENTATIONS = {
  "choreo-still-alive": {
    posterSrc: "/images/still_alive_poster.webp",
    posterColor: "#4a7391",
    videoSrc: CHOREO_STILL_ALIVE_REEL_URL,
  },
  "choreo-her-lies": {
    posterSrc: "/images/her_lies_poster.webp",
    posterColor: "#27170b",
    videoSrc: CHOREO_HER_LIES_REEL_URL,
  },
  "choreo-bundle": {
    posterSrc: "/images/bundle_poster.webp",
    posterColor: "#40434c",
  },
  "choreo-love-me-in-the-morning": {
    posterSrc: "/images/love_me_in_the_morning_poster.webp",
    posterColor: "#160d0d",
    videoSrc: CHOREO_LOVE_ME_IN_THE_MORNING_REEL_URL,
  },
} satisfies Partial<
  Record<
    SellableProductCode,
    Pick<ChoreoCardProps, "posterColor" | "posterSrc" | "previewSrc" | "videoSrc">
  >
>;

/** The tutorials a bundle contains, for its "bought separately" price. */
const CHOREO_BUNDLE_PARTS: Partial<
  Record<SellableProductCode, readonly SellableProductCode[]>
> = {
  "choreo-bundle": ["choreo-still-alive", "choreo-her-lies"],
};

const CHOREO_CARD_HIGHLIGHT_KEYS = ["choreoCard.highlights.level"] as const;

/**
 * The sum of the bundled tutorials' prices for the same tariff, when every
 * part is in the catalogue and the sum really is higher in both currencies.
 */
const getBundleCompareAtPrices = (
  code: SellableProductCode,
  offer: SellableProductOffer,
  catalogProducts: readonly SellableProduct[],
) => {
  const parts = CHOREO_BUNDLE_PARTS[code];
  if (!parts) return undefined;

  const partOffers = parts.map((partCode) =>
    catalogProducts
      .find((candidate) => candidate.code === partCode)
      ?.offers.find((candidate) => candidate.code === offer.code),
  );
  if (partOffers.some((partOffer) => !partOffer)) return undefined;

  const sum = (currency: keyof SellableProductOffer["prices"]) =>
    partOffers.reduce(
      (total, partOffer) => total + (partOffer?.prices[currency] ?? 0),
      0,
    );
  const prices = { pln: sum("pln"), eur: sum("eur") };

  return prices.pln > offer.prices.pln && prices.eur > offer.prices.eur
    ? prices
    : undefined;
};

const getChoreoPriceAnchor = (
  code: SellableProductCode,
  t: Translate,
  catalogProducts: readonly SellableProduct[],
  anchorOffer: SellableProductOffer,
  hasSingleOffer: boolean,
): ChoreoCardPriceAnchor | undefined => {
  const compareAtPrices = getBundleCompareAtPrices(code, anchorOffer, catalogProducts);
  if (!compareAtPrices) return undefined;

  return {
    label: t("choreoCard.compareAtLabel"),
    compareAt: formatOfferPrice(compareAtPrices),
    current: hasSingleOffer
      ? undefined
      : `${t("choreoCard.priceFrom")} ${formatOfferPrice(anchorOffer.prices)}`,
  };
};

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
        text: shouldShowOfferLabel(product, offer.id)
          ? formatOfferButtonText(t, offer)
          : t("buyButton"),
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
    const anchorOffer = withoutMentorOffer ?? withMentorOffer;
    if (!anchorOffer) return [];

    const singleOffer =
      withoutMentorOffer && withMentorOffer
        ? undefined
        : (withoutMentorOffer ?? withMentorOffer);
    const presentation = getChoreoPresentation(code);
    const copy = getChoreoCardCopy(code, t(product.titleKey), t);

    return [
      {
        id: code,
        analyticsId: code,
        price: singleOffer ? formatOfferPrice(singleOffer.prices) : undefined,
        priceLabel: singleOffer ? t("priceLabel") : undefined,
        highlights: CHOREO_CARD_HIGHLIGHT_KEYS.map((key) => t(key)),
        priceAnchor: getChoreoPriceAnchor(
          code,
          t,
          catalogProducts,
          anchorOffer,
          Boolean(singleOffer),
        ),
        ...presentation,
        ...copy,
        firstButtonOptions: buildChoreoButtonOptions(product, t, withoutMentorOffer),
        secondButtonOptions: buildChoreoButtonOptions(product, t, withMentorOffer),
      },
    ];
  });

const getOpenChoreoOffers = (catalogProducts: readonly SellableProduct[]) =>
  CHOREO_CATALOGUE_PRODUCT_CODES.flatMap((code) => {
    const product = catalogProducts.find((candidate) => candidate.code === code);
    if (!product || !product.salesEnabled) return [];

    return product.offers.filter(
      (offer) =>
        (offer.code === "without-mentor" || offer.code === "with-mentor") &&
        isOfferSaleOpen(product, offer),
    );
  });

/** "from 65 PLN / 15 €" for the sticky bar: the cheapest open catalogue tariff. */
export const getChoreoStartingPrice = (
  t: Translate,
  catalogProducts: readonly SellableProduct[],
) => {
  const offers = getOpenChoreoOffers(catalogProducts);
  if (offers.length === 0) return undefined;

  const cheapest = offers.reduce((min, offer) =>
    offer.prices.pln < min.prices.pln ? offer : min,
  );
  const hasSeveralPrices = offers.some(
    (offer) => offer.prices.pln !== cheapest.prices.pln,
  );
  const price = formatOfferPrice(cheapest.prices);

  return hasSeveralPrices ? `${t("choreoCard.priceFrom")} ${price}` : price;
};
