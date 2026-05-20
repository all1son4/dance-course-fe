import type {
  SellableProduct,
  SellableProductOffer,
} from "@/constants/sellable-products";
import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";
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
  productId: string;
  productSlug: string;
  productTitle: string;
};

const SELLABLE_PRODUCTS_COPY = {
  en: enMessages.SellableProducts,
  pl: plMessages.SellableProducts,
  ru: ruMessages.SellableProducts,
} as const;

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

export const getLocalizedSellableProductTitle = (
  product: SellableProduct,
  locale: string | null | undefined,
) => {
  const resolvedLocale = resolveSellableProductsLocale(locale);

  return (
    getNestedString(SELLABLE_PRODUCTS_COPY[resolvedLocale], product.titleKey) ??
    product.title
  );
};

export const getLocalizedSellableProductOfferLabel = (
  offer: SellableProductOffer,
  locale: string | null | undefined,
) => {
  const resolvedLocale = resolveSellableProductsLocale(locale);

  return (
    getNestedString(SELLABLE_PRODUCTS_COPY[resolvedLocale], offer.labelKey) ?? offer.label
  );
};

export const getLocalizedOfferMetadataByOfferId = (
  offerId: string,
  locale: string | null | undefined,
): LocalizedOfferMetadata | null => {
  const defaultMetadata = OFFER_METADATA_BY_ID.get(offerId);

  if (!defaultMetadata) {
    return null;
  }

  const resolvedLocale = resolveSellableProductsLocale(locale);
  const product = SELLABLE_PRODUCTS_LIST.find(
    (item) => item.id === defaultMetadata.productId,
  );
  const offer = product?.offers.find((item) => item.id === offerId);
  const productTitle = product
    ? getLocalizedSellableProductTitle(product, resolvedLocale)
    : defaultMetadata.productTitle;
  const offerLabel = offer
    ? getLocalizedSellableProductOfferLabel(offer, resolvedLocale)
    : defaultMetadata.offerLabel;

  return {
    ...defaultMetadata,
    offerLabel,
    productTitle,
  };
};
