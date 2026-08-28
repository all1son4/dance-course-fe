import { useTranslations } from "next-intl";

import LegalDocument from "@/components/other/LegalDocument";
import { buildLocalizedPageMetadata } from "@/lib/page-metadata";

import { getCookiePolicyItems } from "./constants";

export const generateMetadata = () =>
  buildLocalizedPageMetadata({ pageKey: "cookiePolicy", path: "/cookie-policy" });

export default function CookiePolicy() {
  const t = useTranslations("CookiePolicyPage");

  return (
    <LegalDocument
      path="/cookie-policy"
      title={t("title")}
      description={t("description")}
      items={getCookiePolicyItems((key) => t(key))}
      contactLine={t("contactLine")}
    />
  );
}
