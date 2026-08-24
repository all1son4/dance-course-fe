import type { Metadata } from "next";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import StructuredData from "@/components/common/StructuredData";
import {
  buildBreadcrumbStructuredData,
  buildPageMetadata,
  normalizedSiteUrl,
  seoTargetLocale,
} from "@/lib/seo";

import BirthdayDropSection from "./birthday-drop-section";
import { BirthdayDropPageSection } from "./page.styles";

const PAGE_PATH = "/online/birthday-drop";

export async function generateMetadata(): Promise<Metadata> {
  const metadataT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata",
  });
  const pageT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata.pages.birthdayDrop",
  });

  return buildPageMetadata({
    locale: seoTargetLocale,
    path: PAGE_PATH,
    title: pageT("title"),
    description: pageT("description"),
    siteName: metadataT("siteName"),
    ogImageAlt: pageT("ogImageAlt"),
    keywords: pageT("keywords")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  });
}

// The buy button follows the admin sales switch, so this page is rendered per
// request instead of being prerendered with a stale answer baked in.
export const dynamic = "force-dynamic";

export default function BirthdayDropPage() {
  const locale = useLocale();
  const t = useTranslations("BirthdayDropPage");
  // t.markup keeps the message as a plain string: the title carries a line break
  // tag, which plain t() refuses to render.
  const plainTitle = t
    .markup("title", { br: () => " " })
    .replace(/\s+/gu, " ")
    .trim();

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
