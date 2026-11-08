import type { SellableProduct } from "@/constants/sellable-products";

export const isChoreoTutorialProduct = (product: SellableProduct) =>
  product.type === "choreo" &&
  product.offers.some(
    (offer) => offer.code === "without-mentor" || offer.code === "with-mentor",
  );

/**
 * The tariff is named to the buyer only when there was a choice: a product with
 * one tariff, or one open tariff, stays neutral. A closed tariff keeps its name
 * so a historical or exceptional selection is still recognisable. Online Group
 * always names it: Standard and Plus give different access, and the buyer
 * should see which one she paid for.
 */
export const shouldShowOfferLabel = (product: SellableProduct, offerId: string) => {
  if (product.code === "online-group-anna-strok") return true;
  if (product.offers.length === 1) return false;

  const enabledOffers = product.offers.filter((offer) => offer.salesEnabled);
  return enabledOffers.length !== 1 || enabledOffers[0].id !== offerId;
};

/** Whether checkout and its result pages name the tariff next to the product. */
export const shouldNameOfferAtCheckout = (product: SellableProduct, offerId: string) =>
  product.code === "online-group-anna-strok" ||
  (isChoreoTutorialProduct(product) && shouldShowOfferLabel(product, offerId));
