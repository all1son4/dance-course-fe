import type { SellableProductOffer } from "@/constants/sellable-products";
import { annaStrokStructuredDataId, normalizedSiteUrl } from "@/lib/seo";

type BuildCourseOffersStructuredDataOptions = {
  landingPath: string;
  offer: Pick<SellableProductOffer, "prices">;
  offerName?: string;
  availability?: "InStock" | "OutOfStock" | "PreOrder";
};

export const buildCourseOffersStructuredData = ({
  landingPath,
  offer,
  offerName,
  availability = "InStock",
}: BuildCourseOffersStructuredDataOptions) => [
  {
    "@type": "Offer",
    ...(offerName ? { name: offerName } : {}),
    availability: `https://schema.org/${availability}`,
    price: offer.prices.eur,
    priceCurrency: "EUR",
    url: `${normalizedSiteUrl}${landingPath}`,
  },
  {
    "@type": "Offer",
    ...(offerName ? { name: offerName } : {}),
    availability: `https://schema.org/${availability}`,
    price: offer.prices.pln,
    priceCurrency: "PLN",
    url: `${normalizedSiteUrl}${landingPath}`,
  },
];

/**
 * A course as search engines read it. Lessons come in Russian or English
 * whatever language the page is read in - the buyer picks one at checkout.
 */
export const buildCourseStructuredData = ({
  description,
  name,
  offers,
  path,
}: {
  description: string;
  name: string;
  offers: ReturnType<typeof buildCourseOffersStructuredData>;
  path: string;
}) => ({
  "@context": "https://schema.org",
  "@type": "Course",
  name,
  description,
  inLanguage: ["ru", "en"],
  provider: {
    "@type": "Person",
    "@id": annaStrokStructuredDataId,
    name: "Anna Strok",
    url: normalizedSiteUrl,
  },
  url: `${normalizedSiteUrl}${path}`,
  hasCourseInstance: { "@type": "CourseInstance", courseMode: "online" },
  offers,
});
