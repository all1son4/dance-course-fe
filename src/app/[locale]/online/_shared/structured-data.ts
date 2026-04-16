import type { SellableProductOffer } from "@/constants/sellable-products";
import { buildCheckoutHref } from "@/constants/sellable-products";
import { normalizedSiteUrl } from "@/lib/seo";

type BuildCheckoutOffersStructuredDataOptions = {
  offer: Pick<SellableProductOffer, "id" | "prices">;
  offerName?: string;
  productId: string;
};

export const buildCheckoutOffersStructuredData = ({
  offer,
  offerName,
  productId,
}: BuildCheckoutOffersStructuredDataOptions) => {
  const checkoutHref = buildCheckoutHref({
    offerId: offer.id,
    productId,
  });

  return [
    {
      "@type": "Offer",
      ...(offerName ? { name: offerName } : {}),
      availability: "https://schema.org/InStock",
      price: offer.prices.eur,
      priceCurrency: "EUR",
      url: `${normalizedSiteUrl}${checkoutHref}&currency=eur`,
    },
    {
      "@type": "Offer",
      ...(offerName ? { name: offerName } : {}),
      availability: "https://schema.org/InStock",
      price: offer.prices.pln,
      priceCurrency: "PLN",
      url: `${normalizedSiteUrl}${checkoutHref}&currency=pln`,
    },
  ];
};
