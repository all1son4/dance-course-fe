import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Fragment } from "react";

import { buildPageMetadata, seoTargetLocale } from "@/lib/seo";

import { getPrivacyPolicyItems } from "./constants";
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
} from "./page.styles";

type PrivacyPolicyPageMetadataProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: PrivacyPolicyPageMetadataProps): Promise<Metadata> {
  await params;
  const metadataT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata",
  });
  const pageT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata.pages.privacyPolicy",
  });

  return buildPageMetadata({
    locale: seoTargetLocale,
    path: "/privacy-policy",
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

export default function PrivacyPolicy() {
  const t = useTranslations("PrivacyPolicyPage");
  const privacyPolicyItems = getPrivacyPolicyItems((key) => t(key));
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
    <PrivacyPolicySection>
      <PrivacyPolicyContent>
        <PrivacyPolicyTitle>{t("title")}</PrivacyPolicyTitle>
        <PrivacyPolicyDescription>
          {renderTextWithEmail(t("description"))}
        </PrivacyPolicyDescription>
        <PrivacyPolicyItems>
          {privacyPolicyItems.map((item) => (
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
  );
}
