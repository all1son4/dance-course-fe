import { useLocale, useTranslations } from "next-intl";

import StructuredData from "@/components/common/StructuredData";
import { buildLocalizedPageMetadata } from "@/lib/page-metadata";
import { buildBreadcrumbStructuredData, normalizedSiteUrl } from "@/lib/seo";

import BirthdayDropSection from "./birthday-drop-section";
import { BirthdayDropPageSection } from "./page.styles";

const PAGE_PATH = "/online/birthday-drop";

export const generateMetadata = () =>
  buildLocalizedPageMetadata({ pageKey: "birthdayDrop", path: PAGE_PATH });

// The buy button follows the admin sales switch, so this page is rendered per
// request instead of being prerendered with a stale answer baked in.
export const dynamic = "force-dynamic";

export default function BirthdayDropPage() {
  const locale = useLocale();
  const t = useTranslations("BirthdayDropPage");
  // `title` carries a <br> for the visual line break; `titlePlain` is the
  // same heading as one line, for places that cannot render markup.
  const plainTitle = t("titlePlain");

  const birthdayDropStructuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: plainTitle,
    description: t("description"),
    category: "Dance choreography tutorial",
    inLanguage: locale,
    brand: {
      "@type": "Brand",
      name: "Anna Strok",
    },
    url: `${normalizedSiteUrl}${PAGE_PATH}`,
  };

  return (
    <>
      <StructuredData
        data={[
          buildBreadcrumbStructuredData([
            { name: "Home", path: "/" },
            { name: "Online classes", path: "/online" },
            { name: plainTitle, path: PAGE_PATH },
          ]),
          birthdayDropStructuredData,
        ]}
      />

      <BirthdayDropPageSection>
        <BirthdayDropSection />
      </BirthdayDropPageSection>
    </>
  );
}
