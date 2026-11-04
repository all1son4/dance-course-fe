import type { SellableProductOffer } from "@/constants/sellable-products";
import { normalizedSiteUrl } from "@/lib/seo";

type BuildCourseOffersStructuredDataOptions = {
  landingPath: string;
  offer: Pick<SellableProductOffer, "prices">;
  offerName?: string;
  isAvailable?: boolean;
};

export const buildCourseOffersStructuredData = ({
  landingPath,
  offer,
  offerName,
  isAvailable = true,
}: BuildCourseOffersStructuredDataOptions) => [
  {
    "@type": "Offer",
    ...(offerName ? { name: offerName } : {}),
    availability: `https://schema.org/${isAvailable ? "InStock" : "OutOfStock"}`,
    price: offer.prices.eur,
    priceCurrency: "EUR",
    url: `${normalizedSiteUrl}${landingPath}`,
  },
  {
    "@type": "Offer",
    ...(offerName ? { name: offerName } : {}),
    availability: `https://schema.org/${isAvailable ? "InStock" : "OutOfStock"}`,
    price: offer.prices.pln,
    priceCurrency: "PLN",
    url: `${normalizedSiteUrl}${landingPath}`,
  },
];
