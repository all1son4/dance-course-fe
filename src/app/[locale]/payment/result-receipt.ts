import {
  formatCheckoutPrice,
  type SellableProduct,
  type SellableProductOffer,
} from "@/constants/sellable-products";

import { getCompactSummaryTitle } from "./payment.helpers";

export type ResultReceiptLine = { amount: string; title: string };

/**
 * The one-line receipt of a result page: the product under the short name the
 * checkout bar uses, and the amount in the currency of the attempt. Null when
 * the link does not say what was bought or in which currency.
 */
export const getResultReceipt = ({
  currency,
  offer,
  product,
  translateProduct,
}: {
  currency?: "eur" | "pln";
  offer?: SellableProductOffer | null;
  product?: SellableProduct | null;
  translateProduct: (key: string) => string;
}): ResultReceiptLine | null => {
  if (!product || !offer || !currency) {
    return null;
  }

  const title = product.checkoutTitleKey
    ? translateProduct(product.checkoutTitleKey)
    : getCompactSummaryTitle(translateProduct(product.titleKey));

  return { amount: formatCheckoutPrice(offer.prices[currency], currency), title };
};
