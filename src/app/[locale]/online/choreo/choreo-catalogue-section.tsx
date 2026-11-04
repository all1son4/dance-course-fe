import { getTranslations } from "next-intl/server";

import ChoreoCard from "@/components/cards/ChoreoCard";
import { getStorefrontSellableProducts } from "@/lib/sales-availability";

import { getChoreos } from "./constants";
import { ChoreoSection } from "./page.styles";

export default async function ChoreoCatalogueSection() {
  // Every string the cards need - product titles, offer labels, the bundle's
  // heading - is catalogue copy, so the translator is bound to SellableProducts
  // rather than to this page's own namespace.
  const t = await getTranslations("SellableProducts");
  const choreos = getChoreos((key) => t(key), await getStorefrontSellableProducts());
  if (choreos.length === 0) return null;

  return (
    <ChoreoSection id="choreo-section">
      {choreos.map(({ id, ...choreo }) => (
        <ChoreoCard key={id} {...choreo} />
      ))}
    </ChoreoSection>
  );
}
