import type {
  SellableProduct,
  SellableProductOffer,
} from "@/constants/sellable-products";
import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";
import { shouldShowOfferLabel } from "@/lib/choreo-offer-presentation";
import enMessages from "@/messages/en.json";
import plMessages from "@/messages/pl.json";
import ruMessages from "@/messages/ru.json";

export type LocalizedSellableProductsLocale = "en" | "pl" | "ru";

type LocalizedOfferMetadata = {
  accessWorkflow: string;
  deliveryChannel: string;
  offerCode: string;
  offerId: string;
  offerLabel: string;
  productCode: string;
  productId: string;
  productShortTitle: string;
  productSlug: string;
  productTitle: string;
  /** Number of tariffs the product has ever had, closed ones included. */
  productOfferCount: number;
};

/** The parts of a product that name it, shared by the catalogue and Payment Links. */
type NamedProduct = Pick<
  SellableProduct,
  "id" | "shortTitle" | "shortTitleKey" | "slug" | "title" | "titleKey"
> & {
  code: string;
  offers: Array<
    Pick<
      SellableProductOffer,
      "accessWorkflow" | "deliveryChannel" | "id" | "label" | "labelKey"
    > & {
      code: string;
    }
  >;
};

/**
 * Sold through a Stripe Payment Link rather than the site checkout, so it is not
 * part of the storefront catalogue; it is named here so every channel calls it
 * the same way.
 */
const PRIVATE_LESSON: NamedProduct = {
  code: "private-lesson",
  id: "prd_private_lesson",
  offers: [
    {
      accessWorkflow: "private-lesson",
      code: "sixty-minutes",
      deliveryChannel: "manual",
      id: "off_private_lesson_standard",
      label: "60 минут",
      labelKey: "privateLesson.offers.sixtyMinutes",
    },
  ],
  shortTitle: "Индивидуальное занятие",
  shortTitleKey: "privateLesson.shortTitle",
  slug: "private-lesson",
  title: "Индивидуальное занятие с Анной Строк",
  titleKey: "privateLesson.title",
};

const NAMED_PRODUCTS: NamedProduct[] = [...SELLABLE_PRODUCTS_LIST, PRIVATE_LESSON];

const SELLABLE_PRODUCTS_COPY = {
  en: enMessages.SellableProducts,
  pl: plMessages.SellableProducts,
  ru: ruMessages.SellableProducts,
} as const;

const NAMED_OFFER_BY_ID = new Map(
  NAMED_PRODUCTS.flatMap((product) =>
    product.offers.map((offer) => [offer.id, { offer, product }] as const),
  ),
);

const getNestedString = (value: unknown, path: string) => {
  const keys = path.split(".").filter(Boolean);
  let currentValue: unknown = value;

  for (const key of keys) {
    if (!currentValue || typeof currentValue !== "object") {
      return null;
    }

    currentValue = (currentValue as Record<string, unknown>)[key];
  }

  return typeof currentValue === "string" && currentValue.trim()
    ? currentValue.trim()
    : null;
};

export const resolveSellableProductsLocale = (
  locale: string | null | undefined,
): LocalizedSellableProductsLocale => {
  const normalizedLocale = (locale ?? "").trim().toLowerCase();

  if (normalizedLocale.startsWith("en")) {
    return "en";
  }

  if (normalizedLocale.startsWith("pl")) {
    return "pl";
  }

  return "ru";
};

const translate = (key: string, fallback: string, locale: string | null | undefined) =>
  getNestedString(SELLABLE_PRODUCTS_COPY[resolveSellableProductsLocale(locale)], key) ??
  fallback;

export const getLocalizedSellableProductTitle = (
  product: Pick<SellableProduct, "title" | "titleKey">,
  locale: string | null | undefined,
) => translate(product.titleKey, product.title, locale);

export const getLocalizedSellableProductShortTitle = (
  product: Pick<SellableProduct, "shortTitle" | "shortTitleKey">,
  locale: string | null | undefined,
) => translate(product.shortTitleKey, product.shortTitle, locale);

export const getLocalizedSellableProductOfferLabel = (
  offer: Pick<SellableProductOffer, "label" | "labelKey">,
  locale: string | null | undefined,
) => translate(offer.labelKey, offer.label, locale);

/** The one way a purchase is named on a single line: "Разбор «Her Lies» · Без куратора". */
export const formatPurchaseLine = (productTitle: string, offerLabel?: string | null) => {
  const title = productTitle.replace(/\s+/gu, " ").trim();
  const offer = (offerLabel ?? "").replace(/\s+/gu, " ").trim();

  return title && offer ? `${title} · ${offer}` : title || offer;
};

export const getLocalizedOfferMetadataByOfferId = (
  offerId: string,
  locale: string | null | undefined,
): LocalizedOfferMetadata | null => {
  const named = NAMED_OFFER_BY_ID.get(offerId);

  if (!named) {
    return null;
  }

  const { offer, product } = named;

  return {
    accessWorkflow: offer.accessWorkflow ?? "",
    deliveryChannel: offer.deliveryChannel ?? "",
    offerCode: offer.code,
    offerId: offer.id,
    offerLabel: getLocalizedSellableProductOfferLabel(offer, locale),
    productCode: product.code,
    productId: product.id,
    productOfferCount: product.offers.length,
    productShortTitle: getLocalizedSellableProductShortTitle(product, locale),
    productSlug: product.slug,
    productTitle: getLocalizedSellableProductTitle(product, locale),
  };
};

/** The catalogue rule for an offer by id; a Payment Link product has one tariff. */
export const shouldShowOfferToBuyerByOfferId = (offerId: string) => {
  const product = SELLABLE_PRODUCTS_LIST.find((item) =>
    item.offers.some((offer) => offer.id === offerId),
  );

  if (product) {
    return shouldShowOfferLabel(product, offerId);
  }

  const named = NAMED_OFFER_BY_ID.get(offerId);

  return named ? named.product.offers.length > 1 : true;
};

/**
 * What the buyer sees: the tariff is named only when there was a choice. The
 * choice is stored with the payment (`show_offer_label`); a payment without it
 * (a Payment Link) falls back to the catalogue rule.
 */
export const shouldShowOfferToBuyer = (
  metadata: Record<string, string | undefined> | null | undefined,
  offerId: string,
) => {
  const storedChoice = metadata?.show_offer_label;

  if (storedChoice === "false") return false;
  if (storedChoice === "true") return true;

  return shouldShowOfferToBuyerByOfferId(offerId);
};

/** The buyer-facing line in the buyer's language, or null for an unknown offer. */
export const getBuyerPurchaseLine = ({
  locale,
  offerId,
  showOfferLabel,
}: {
  locale: string | null | undefined;
  offerId: string;
  showOfferLabel: boolean;
}) => {
  const metadata = getLocalizedOfferMetadataByOfferId(offerId, locale);

  if (!metadata) {
    return null;
  }

  return formatPurchaseLine(
    metadata.productShortTitle,
    showOfferLabel ? metadata.offerLabel : null,
  );
};

/**
 * The line the admin and the reports see: Russian, or English for the CSV that
 * goes to accounting. The tariff is named whenever the product has more than
 * one, so a purchase "Без куратора" stays recognisable while it is the only
 * open tariff.
 */
export const getAdminPurchaseLine = (
  offerId: string,
  locale: LocalizedSellableProductsLocale = "ru",
) => {
  const metadata = getLocalizedOfferMetadataByOfferId(offerId, locale);

  if (!metadata) {
    return null;
  }

  return formatPurchaseLine(
    metadata.productShortTitle,
    metadata.productOfferCount > 1 ? metadata.offerLabel : null,
  );
};
