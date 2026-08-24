import { getTranslations } from "next-intl/server";

import ChoreoCard from "@/components/cards/ChoreoCard";
import { getOpenSaleProductIds } from "@/lib/sales-availability";

import { getChoreos } from "./constants";
import { ChoreoSection } from "./page.styles";

/**
 * Not rendered yet - it is kept ready for the day the preserved catalogue layout
 * in `page.tsx` is uncommented, so restoring it is one line and not a rewiring.
 *
 * The catalogue of regular choreography breakdowns. Buy buttons follow the admin
 * sales switch, so a closed breakdown still shows its card and simply cannot be
 * bought. The page that renders this must stay dynamic, otherwise the switch
 * would be read once at build time.
 */
export default async function ChoreoCatalogueSection() {
  // Every string the cards need - product titles, offer labels, the bundle's
  // heading - is catalogue copy, so the translator is bound to SellableProducts
  // rather than to this page's own namespace.
  const t = await getTranslations("SellableProducts");
  const choreos = getChoreos((key) => t(key), await getOpenSaleProductIds());

  return (
    <ChoreoSection id="choreo-section">
      {choreos.map(({ id, ...choreo }) => (
        <ChoreoCard key={id} {...choreo} />
      ))}
    </ChoreoSection>
  );
}
