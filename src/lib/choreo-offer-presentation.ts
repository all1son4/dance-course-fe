import type { SellableProduct } from "@/constants/sellable-products";

export const isChoreoTutorialProduct = (product: SellableProduct) =>
  product.type === "choreo" &&
  product.offers.some(
    (offer) => offer.code === "without-mentor" || offer.code === "with-mentor",
  );

/** Preserve the identity of a historical/closed selection when another tariff is open. */
export const shouldShowOfferLabel = (product: SellableProduct, offerId: string) => {
  if (!isChoreoTutorialProduct(product)) return true;
  if (product.offers.length === 1) return false;

  const enabledOffers = product.offers.filter((offer) => offer.salesEnabled);
  return enabledOffers.length !== 1 || enabledOffers[0].id !== offerId;
};

/** Whether checkout and its result pages name the tariff next to the product. */
export const shouldNameOfferAtCheckout = (product: SellableProduct, offerId: string) =>
  product.code === "online-group-anna-strok" ||
  (isChoreoTutorialProduct(product) && shouldShowOfferLabel(product, offerId));

/** Stored with the payment so later catalogue switches cannot rewrite its presentation. */
export const shouldShowPurchasedOfferLabel = (metadata: Record<string, string>) =>
  metadata.show_offer_label !== "false";
