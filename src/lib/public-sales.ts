import {
  CHOREO_CATALOGUE_PRODUCT_CODES,
  type SellableProduct,
} from "@/constants/sellable-products";

/** Renewal offers have their own verified links and cannot open public sales. */
export const getPublicProductOffers = (product: SellableProduct) =>
  product.offers.filter((offer) =>
    product.code === "online-group-anna-strok"
      ? offer.code === "standard" || offer.code === "library-access"
      : true,
  );

export const getOpenPublicProductOffers = (product: SellableProduct) =>
  product.salesEnabled
    ? getPublicProductOffers(product).filter((offer) => offer.salesEnabled)
    : [];

export const getAlternativeTariffHref = (product: SellableProduct, offerId: string) => {
  if (!getOpenPublicProductOffers(product).some((offer) => offer.id !== offerId)) {
    return null;
  }
  if (product.code === "online-group-anna-strok") return "/online/group#tariffs";
  if (CHOREO_CATALOGUE_PRODUCT_CODES.includes(product.code)) {
    return "/online/choreo#choreo-section";
  }
  return null;
};
