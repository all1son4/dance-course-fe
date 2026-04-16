import type { Metadata } from "next";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import TextContentCard from "@/components/cards/TextContentCard";
import Button from "@/components/common/Button";
import StructuredData from "@/components/common/StructuredData";
import SvgAsset from "@/components/common/SvgAsset";
import Contacts from "@/components/other/Contacts";
import RoadmapContainer from "@/components/other/ProgramRoadmap";
import VideoPlayer from "@/components/other/VideoPlayer";
import { FIRST_TOUCH_REGISTRATION_FORM_VIEW_URL } from "@/constants/links";
import {
  DEFAULT_CHECKOUT_PRODUCT,
  getDefaultProductOffer,
} from "@/constants/sellable-products";
import { buildPageMetadata, normalizedSiteUrl, seoTargetLocale } from "@/lib/seo";

import { buildCheckoutOffersStructuredData } from "../_shared/structured-data";
import { getOnlineSuggestions } from "./constants";
import {
  AboutCourseCards,
  AboutCourseSection,
  AboutCourseTitle,
  ButtonBox,
  ContactSection,
  CourseProgramButtonBox,
  CourseProgramImage,
  CourseProgramSection,
  CourseProgramTextBox,
  CourseProgramTitle,
  Date,
  DateBox,
  Description,
  DescriptionParagraph,
  From,
  IconBox,
  ImageBox,
  InfoBoxGroup,
  IntroductionSection,
  MobileImagesBox,
  SpecialWrapper,
  Subtitle,
  TextBox,
  Title,
  VideoSection,
} from "./page.styles";

export async function generateMetadata(): Promise<Metadata> {
  const metadataT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata",
  });
  const pageT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata.pages.firstTouch",
  });

  return buildPageMetadata({
    locale: seoTargetLocale,
    path: "/online/first-touch",
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
  const locale = useLocale();
  const t = useTranslations("FirstTouchPage");
  const onlineSuggestions = getOnlineSuggestions((key) => t(key));
  const defaultOffer = getDefaultProductOffer(DEFAULT_CHECKOUT_PRODUCT);
  const coursePrice = `${defaultOffer.prices.pln} PLN / ${defaultOffer.prices.eur} €`;
  const courseStructuredData = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: t("hero.title"),
    description: `${t("hero.description.1")} ${t("hero.description.2")}`,
    inLanguage: locale,
    provider: {
      "@type": "Person",
      name: "Anna Strok",
      url: normalizedSiteUrl,
    },
    url: `${normalizedSiteUrl}/online/first-touch`,
    offers: buildCheckoutOffersStructuredData({
      offer: defaultOffer,
      productId: DEFAULT_CHECKOUT_PRODUCT.id,
    }),
  };

  return (
    <>
      <StructuredData data={courseStructuredData} />
      <IntroductionSection>
        <TextBox>
          <Title>{t("hero.title")}</Title>
          <Subtitle>{t("hero.subtitle")}</Subtitle>

          <Description>
            <DescriptionParagraph>{t("hero.description.1")}</DescriptionParagraph>
            <DescriptionParagraph>{t("hero.description.2")}</DescriptionParagraph>
          </Description>

          <InfoBoxGroup>
            <DateBox>
              <From>{t("hero.startLabel")}</From>
              <Date>{t("hero.startDate")}</Date>
            </DateBox>

            <DateBox>
              <From>{t("hero.priceLabel")}</From>
              <Date>{coursePrice}</Date>
            </DateBox>
          </InfoBoxGroup>

          <ButtonBox>
            <Button
              buttonText={t("hero.enrollButton")}
              href={FIRST_TOUCH_REGISTRATION_FORM_VIEW_URL}
              target="_blank"
            />
            <Button
              buttonText={t("hero.programButton")}
              variant="secondary"
              href="#course-program"
            />
          </ButtonBox>
        </TextBox>

        <MobileImagesBox>
          <ImageBox id="mobile-only-image-box">
            <SvgAsset
              src="/svg/FirstTouchPageBackgroundPhoto.webp"
              width={660}
              height={826}
              sizes="(max-width: 450px) 100vw, (max-width: 767px) 90vw, 0px"
              priority
              unoptimized
            />
          </ImageBox>

          <IconBox id="mobile-only-icon-box">
            <SvgAsset
              src="/svg/FirstTouchTelegram.webp"
              width={356}
              height={534}
              sizes="(max-width: 767px) 50vw, 0px"
            />
          </IconBox>
        </MobileImagesBox>

        <ImageBox id="desktop-only-image-box">
          <SvgAsset
            src="/svg/FirstTouchPageBackgroundPhoto.webp"
            width={660}
            height={826}
            sizes="(max-width: 767px) 0px, (max-width: 920px) 380px, (max-width: 1100px) 470px, (max-width: 1240px) 500px, 660px"
            priority
            unoptimized
          />
        </ImageBox>

        <IconBox id="desktop-only-icon-box">
          <SvgAsset
            src="/svg/FirstTouchTelegram.webp"
            width={356}
            height={534}
            sizes="(max-width: 767px) 0px, (max-width: 920px) 210px, (max-width: 1100px) 250px, (max-width: 1240px) 280px, 356px"
          />
        </IconBox>
      </IntroductionSection>

      <SpecialWrapper>
        <VideoSection>
          <VideoPlayer
            src={t("hero.introductionVideoSrc")}
            playLabel={t("hero.playLabel")}
            poster="/images/first_touch_poster.webp"
            radius="0px"
          />
        </VideoSection>
        <AboutCourseSection>
          <AboutCourseTitle>{t("about.title")}</AboutCourseTitle>
          <AboutCourseCards>
            {onlineSuggestions.map(({ id, ...suggestion }) => (
              <TextContentCard key={id} {...suggestion} />
            ))}
          </AboutCourseCards>
        </AboutCourseSection>
        <CourseProgramSection id="course-program">
          <CourseProgramTextBox>
            <CourseProgramTitle>{t("program.title")}</CourseProgramTitle>
            <RoadmapContainer />
            <CourseProgramButtonBox>
              <Button
                buttonText={t("hero.enrollButton")}
                href={FIRST_TOUCH_REGISTRATION_FORM_VIEW_URL}
                target="_blank"
              />
            </CourseProgramButtonBox>
          </CourseProgramTextBox>
          <CourseProgramImage
            src={"/images/first_touch_program_photo.webp"}
            alt={t("program.imageAlt")}
            width={473}
            height={709}
            sizes="(max-width: 920px) 100vw, 473px"
          />
        </CourseProgramSection>
        <ContactSection>
          <Contacts bgColor="rgba(200, 204, 210, 0.4)" />
        </ContactSection>
      </SpecialWrapper>
    </>
  );
}
