import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Fragment } from "react";

import StructuredData from "@/components/common/StructuredData";
import {
  buildBreadcrumbStructuredData,
  buildPageMetadata,
  seoTargetLocale,
} from "@/lib/seo";

import {
  PrivacyPolicyContactLine,
  PrivacyPolicyContent,
  PrivacyPolicyDescription,
  PrivacyPolicyEmail,
  PrivacyPolicyItem,
  PrivacyPolicyItems,
  PrivacyPolicyItemText,
  PrivacyPolicyItemTitle,
  PrivacyPolicySection,
  PrivacyPolicyTitle,
} from "../privacy-policy/page.styles";
import { getCookiePolicyItems } from "./constants";

type CookiePolicyPageMetadataProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: CookiePolicyPageMetadataProps): Promise<Metadata> {
  await params;
  const metadataT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata",
  });
  const pageT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata.pages.cookiePolicy",
  });

  return buildPageMetadata({
    locale: seoTargetLocale,
    path: "/cookie-policy",
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

export default function CookiePolicy() {
  const t = useTranslations("CookiePolicyPage");
  const cookiePolicyItems = getCookiePolicyItems((key) => t(key));
  const email = "kroxxxxx92@gmail.com";

  const renderTextWithEmail = (text: string) =>
    text.split(email).map((part, index, parts) => (
      <Fragment key={`${part}-${index}`}>
        {part}
        {index < parts.length - 1 && (
          <PrivacyPolicyEmail href={`mailto:${email}`}>{email}</PrivacyPolicyEmail>
        )}
      </Fragment>
    ));

  return (
    <>
      <StructuredData
        data={buildBreadcrumbStructuredData([
          { name: "Home", path: "/" },
          { name: t("title"), path: "/cookie-policy" },
        ])}
      />
      <PrivacyPolicySection>
        <PrivacyPolicyContent>
          <PrivacyPolicyTitle>{t("title")}</PrivacyPolicyTitle>
          <PrivacyPolicyDescription>{t("description")}</PrivacyPolicyDescription>
          <PrivacyPolicyItems>
            {cookiePolicyItems.map((item) => (
              <PrivacyPolicyItem key={item.id}>
                <PrivacyPolicyItemTitle>{item.title}</PrivacyPolicyItemTitle>
                <PrivacyPolicyItemText>{item.text}</PrivacyPolicyItemText>
              </PrivacyPolicyItem>
            ))}
          </PrivacyPolicyItems>
          <PrivacyPolicyContactLine>
            {renderTextWithEmail(t("contactLine"))}
          </PrivacyPolicyContactLine>
        </PrivacyPolicyContent>
      </PrivacyPolicySection>
    </>
  );
}
