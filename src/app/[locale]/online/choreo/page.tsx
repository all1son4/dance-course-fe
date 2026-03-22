import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import ChoreoCard from "@/components/cards/ChoreoCard";
import TextContentCard from "@/components/cards/TextContentCard";
import Button from "@/components/common/Button";
import SvgAsset from "@/components/common/SvgAsset";
import Contacts from "@/components/other/Contacts";
import { buildPageMetadata } from "@/lib/seo";

import { getChoreos, getOnlineSuggestions } from "./constants";
import {
  AboutChoreoCards,
  AboutChoreoSection,
  AboutChoreoTitle,
  ButtonBox,
  ChoreoSection,
  Date,
  DateBox,
  Description,
  DescriptionParagraph,
  From,
  IconBox,
  ImageBox,
  IntroductionSection,
  MobileImagesBox,
  SpecialWrapper,
  TextBox,
  Title,
} from "./page.styles";

type ChoreoPageMetadataProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: ChoreoPageMetadataProps): Promise<Metadata> {
  const { locale } = await params;
  const metadataT = await getTranslations({ locale, namespace: "Metadata" });
  const pageT = await getTranslations({ locale, namespace: "Metadata.pages.choreo" });

  return buildPageMetadata({
    locale,
    path: "/online/choreo",
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

export default function FirstTouch() {
  const t = useTranslations("ChoreoPage");
  const onlineSuggestions = getOnlineSuggestions((key) => t(key));
  const choreos = getChoreos((key) => t(key));

  return (
    <>
      <IntroductionSection>
        <TextBox>
          <Title>{t("hero.title")}</Title>

          <Description>
            <DescriptionParagraph>{t("hero.description.1")}</DescriptionParagraph>
            <DescriptionParagraph>{t("hero.description.2")}</DescriptionParagraph>
          </Description>

          <DateBox>
            <From>{t("hero.startLabel")}</From>
            <Date>{t("hero.startValue")}</Date>
          </DateBox>

          <ButtonBox>
            <Button buttonText={t("hero.button")} href="#choreo-section" />
          </ButtonBox>
        </TextBox>

        <MobileImagesBox>
          <ImageBox id="mobile-only-image-box">
            <SvgAsset
              src="/svg/OnlineChoreoPageBackgroundPhoto.webp"
              width={794}
              height={989}
              sizes="(max-width: 767px) 100vw, 0px"
              priority
            />
          </ImageBox>

          <IconBox id="mobile-only-icon-box">
            <SvgAsset
              src="/svg/TelegramChoreo.webp"
              width={401}
              height={421}
              sizes="(max-width: 767px) 50vw, 0px"
            />
          </IconBox>
        </MobileImagesBox>

        <ImageBox id="desktop-only-image-box">
          <SvgAsset
            src="/svg/OnlineChoreoPageBackgroundPhoto.webp"
            width={794}
            height={989}
            sizes="(max-width: 767px) 0px, (max-width: 880px) 490px, (max-width: 1140px) 540px, (max-width: 1240px) 640px, 794px"
            priority
          />
        </ImageBox>

        <IconBox id="desktop-only-icon-box">
          <SvgAsset
            src="/svg/TelegramChoreo.webp"
            width={401}
            height={421}
            sizes="(max-width: 767px) 0px, (max-width: 880px) 240px, (max-width: 1140px) 260px, (max-width: 1240px) 320px, 401px"
          />
        </IconBox>
      </IntroductionSection>
      <SpecialWrapper>
        <AboutChoreoSection>
          <AboutChoreoTitle>{t("about.title")}</AboutChoreoTitle>
          <AboutChoreoCards>
            {onlineSuggestions.map((suggestion) => (
              <TextContentCard
                key={suggestion.id}
                icon={suggestion.icon}
                title={suggestion.title}
                text={suggestion.text}
              />
            ))}
          </AboutChoreoCards>
        </AboutChoreoSection>
        <ChoreoSection id="choreo-section">
          {choreos.map((choreo) => (
            <ChoreoCard
              key={choreo.id}
              videoSrc={choreo.videoSrc}
              posterSrc={choreo.posterSrc}
              title={choreo.title}
              firstButtonOptions={choreo.firstButtonOptions}
              secondButtonOptions={choreo.secondButtonOptions}
            />
          ))}
        </ChoreoSection>
        <Contacts bgColor="rgba(200, 204, 210, 0.4)" />
      </SpecialWrapper>
    </>
  );
}
