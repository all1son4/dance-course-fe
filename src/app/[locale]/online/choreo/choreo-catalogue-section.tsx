import { getTranslations } from "next-intl/server";

import ChoreoCard from "@/components/cards/ChoreoCard";
import StructuredData from "@/components/common/StructuredData";
import StickyCta from "@/components/other/StickyCta";
import { getStorefrontSellableProducts } from "@/lib/sales-availability";
import { stickyCtaAnchorProps } from "@/lib/sticky-cta";

import {
  buildCourseOffersStructuredData,
  buildCourseStructuredData,
} from "../_shared/structured-data";
import { getChoreos, getChoreoStartingPrice, getOpenChoreoCourses } from "./constants";
import { ChoreoCatalogue, ChoreoCatalogueTitle, ChoreoSection } from "./page.styles";

export default async function ChoreoCatalogueSection() {
  // Every string the cards need - product titles, offer labels, the bundle's
  // heading - is catalogue copy, so the translator is bound to SellableProducts
  // rather than to this page's own namespace.
  const [t, pageT, metadataT, catalogProducts] = await Promise.all([
    getTranslations("SellableProducts"),
    getTranslations("ChoreoPage"),
    getTranslations("Metadata.pages.choreo"),
    getStorefrontSellableProducts(),
  ]);
  const translate = (key: string) => t(key);
  const choreos = getChoreos(translate, catalogProducts);
  if (choreos.length === 0) return null;
  const coursesStructuredData = getOpenChoreoCourses(translate, catalogProducts).map(
    ({ name, offers }) =>
      buildCourseStructuredData({
        name,
        description: metadataT("description"),
        path: "/online/choreo",
        offers: offers.flatMap((offer) =>
          buildCourseOffersStructuredData({
            landingPath: "/online/choreo",
            offer,
            offerName: t(offer.labelKey),
          }),
        ),
      }),
  );

  return (
    // The whole catalogue counts as the sticky bar's anchor: while any card is
    // on screen there is nothing to "choose" further down.
    <ChoreoCatalogue id="choreo-section" {...stickyCtaAnchorProps}>
      <StructuredData data={coursesStructuredData} />
      <ChoreoCatalogueTitle>{pageT("catalogue.title")}</ChoreoCatalogueTitle>
      <ChoreoSection>
        {choreos.map(({ id, ...choreo }) => (
          <ChoreoCard key={id} {...choreo} />
        ))}
      </ChoreoSection>
      {/* Mirrors the hero's "choose a choreography" button. */}
      <StickyCta
        analytics={{ id: "select_choreo", placement: "choreo_sticky" }}
        label={pageT("hero.button")}
        href="#choreo-section"
        title={pageT("hero.stickyTitle")}
        note={getChoreoStartingPrice(translate, catalogProducts)}
      />
    </ChoreoCatalogue>
  );
}
