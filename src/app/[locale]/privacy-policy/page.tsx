import { useTranslations } from "next-intl";

import LegalDocument from "@/components/other/LegalDocument";
import { buildLocalizedPageMetadata } from "@/lib/page-metadata";

import { getPrivacyPolicyItems } from "./constants";

export const generateMetadata = () =>
  buildLocalizedPageMetadata({ pageKey: "privacyPolicy", path: "/privacy-policy" });

export default function PrivacyPolicy() {
  const t = useTranslations("PrivacyPolicyPage");

  return (
    <LegalDocument
      path="/privacy-policy"
      title={t("title")}
      description={t("description")}
      linkEmailInDescription
      items={getPrivacyPolicyItems((key) => t(key))}
      contactLine={t("contactLine")}
    />
  );
}
