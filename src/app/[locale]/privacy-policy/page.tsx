import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Fragment } from "react";
import styled from "styled-components";

import { buildPageMetadata } from "@/lib/seo";

import { getPrivacyPolicyItems } from "./constants";

type PrivacyPolicyPageMetadataProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: PrivacyPolicyPageMetadataProps): Promise<Metadata> {
  const { locale } = await params;
  const metadataT = await getTranslations({ locale, namespace: "Metadata" });
  const pageT = await getTranslations({
    locale,
    namespace: "Metadata.pages.privacyPolicy",
  });

  return buildPageMetadata({
    locale,
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

const PrivacyPolicySection = styled.section`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  padding: 180px 0 100px;
  box-sizing: border-box;

  @media (max-width: 880px) {
    padding: 160px 0 60px;
  }

  @media (max-width: 767px) {
    padding: 110px 0 60px;
  }
`;

const PrivacyPolicyContent = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 100px;
  box-sizing: border-box;
  border-radius: 100px;
  background: rgba(255, 255, 255, 1);

  @media (max-width: 1100px) {
    padding: 50px;
  }

  @media (max-width: 880px) {
    border-radius: 40px;
    padding: 40px 20px;
  }
`;

const PrivacyPolicyTitle = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: 36px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0 0 40px;
  color: #000000;

  @media (max-width: 880px) {
    font-size: 28px;
    margin: 0 0 30px;
  }
`;

const PrivacyPolicyDescription = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0 0 40px;
  color: rgba(72, 72, 72, 1);
  white-space: pre-line;

  @media (max-width: 880px) {
    margin: 0 0 30px;
  }
`;

const PrivacyPolicyEmail = styled.a`
  color: rgba(72, 72, 72, 1);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.2s ease;

  @media (hover: hover) {
    &:hover {
      color: rgba(152, 0, 0, 1);
    }
  }
`;

const PrivacyPolicyItems = styled.div`
  display: flex;
  flex-direction: column;
  gap: 40px;

  @media (max-width: 880px) {
    gap: 30px;
  }
`;

const PrivacyPolicyItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
`;

const PrivacyPolicyItemTitle = styled.p`
  font-weight: 600;
  font-style: normal;
  font-size: 17px;
  line-height: 130%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

const PrivacyPolicyItemText = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);
  white-space: pre-line;
`;

const PrivacyPolicyContactLine = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 32px 0 0;
  color: rgba(72, 72, 72, 1);
  white-space: pre-line;
`;

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
