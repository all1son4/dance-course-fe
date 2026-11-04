import { getTranslations } from "next-intl/server";

import ChoreoCard from "@/components/cards/ChoreoCard";
import StickyCta from "@/components/other/StickyCta";
import { getStorefrontSellableProducts } from "@/lib/sales-availability";
import { stickyCtaAnchorProps } from "@/lib/sticky-cta";

import { getChoreos, getChoreoStartingPrice } from "./constants";
import { ChoreoPaymentMethods, ChoreoSection } from "./page.styles";

export default async function ChoreoCatalogueSection() {
  // Every string the cards need - product titles, offer labels, the bundle's
  // heading - is catalogue copy, so the translator is bound to SellableProducts
  // rather than to this page's own namespace.
  const [t, pageT, catalogProducts] = await Promise.all([
    getTranslations("SellableProducts"),
    getTranslations("ChoreoPage"),
    getStorefrontSellableProducts(),
  ]);
  const translate = (key: string) => t(key);
  const choreos = getChoreos(translate, catalogProducts);
  if (choreos.length === 0) return null;

  return (
    // The whole catalogue counts as the sticky bar's anchor: while any card is
    // on screen there is nothing to "choose" further down.
    <ChoreoSection id="choreo-section" {...stickyCtaAnchorProps}>
      {choreos.map(({ id, ...choreo }) => (
        <ChoreoCard key={id} {...choreo} />
      ))}
      <ChoreoPaymentMethods
        label={pageT("paymentMethods.label")}
        note={pageT("paymentMethods.note")}
      />
      {/* Mirrors the hero's "choose a choreography" button. */}
      <StickyCta
        analytics={{ id: "select_choreo", placement: "choreo_sticky" }}
        label={pageT("hero.button")}
        href="#choreo-section"
        title={pageT("hero.stickyTitle")}
        note={getChoreoStartingPrice(translate, catalogProducts)}
      />
    </ChoreoSection>
  );
}
