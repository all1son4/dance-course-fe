import type { Metadata } from "next";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import TextContentCard from "@/components/cards/TextContentCard";
import Button from "@/components/common/Button";
import HeroPicture from "@/components/common/HeroPicture";
import StructuredData from "@/components/common/StructuredData";
import Contacts from "@/components/other/Contacts";
import RoadmapContainer from "@/components/other/ProgramRoadmap";
import VideoPlayer from "@/components/other/VideoPlayer";
import { HERO_MEDIA } from "@/constants/hero-media";
import {
  DEFAULT_CHECKOUT_PRODUCT,
  formatOfferPrice,
  getDefaultProductOffer,
} from "@/constants/sellable-products";
import CourseSignupDialog from "@/features/course-signup";
import PageClientMessages from "@/i18n/PageClientMessages";
import {
  annaStrokStructuredDataId,
  buildBreadcrumbStructuredData,
  buildPageMetadata,
  normalizedSiteUrl,
  seoTargetLocale,
} from "@/lib/seo";

import { buildCourseOffersStructuredData } from "../_shared/structured-data";
import { getFirstTouchSuggestions } from "./constants";
import {
  AboutCourseCards,
  AboutCourseSection,
  AboutCourseTitle,
  ButtonBox,
  ContactSection,
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
  StartNote,
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
  const onlineSuggestions = getFirstTouchSuggestions((key) => t(key));
  const defaultOffer = getDefaultProductOffer(DEFAULT_CHECKOUT_PRODUCT);
  const coursePrice = formatOfferPrice(defaultOffer.prices);
  const courseStructuredData = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: t("hero.title"),
    description: `${t("hero.description.1")} ${t("hero.description.2")}`,
    inLanguage: locale,
    provider: {
      "@type": "Person",
      "@id": annaStrokStructuredDataId,
      name: "Anna Strok",
      url: normalizedSiteUrl,
    },
    url: `${normalizedSiteUrl}/online/first-touch`,
    offers: buildCourseOffersStructuredData({
      landingPath: "/online/first-touch",
      offer: defaultOffer,
    }),
  };

  const renderIntroductionSection = () => (
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
            <StartNote>{t("hero.startNote")}</StartNote>
          </DateBox>

          <DateBox>
            <From>{t("hero.priceLabel")}</From>
            <Date>{coursePrice}</Date>
          </DateBox>
        </InfoBoxGroup>

        <ButtonBox>
          <CourseSignupDialog
            triggerText={t("hero.enrollButton")}
            stickyCta={{
              title: t("hero.title"),
              note: coursePrice,
            }}
          />
          {/* <Button
              buttonText={t("hero.enrollButton")}
              href={FIRST_TOUCH_REGISTRATION_FORM_VIEW_URL}
              target="_blank"
            /> */}
          {/* Sits on the flat text column, not on the photo: static frost looks
              identical and skips a backdrop-filter root. */}
          <Button
            buttonText={t("hero.programButton")}
            variant="secondary"
            href="#course-program"
          />
        </ButtonBox>
      </TextBox>

      <MobileImagesBox>
        <ImageBox id="mobile-only-image-box">
          <HeroPicture
            asset={HERO_MEDIA.firstTouch}
            media="(max-width: 767px)"
            sizes="(max-width: 450px) 100vw, (max-width: 767px) 90vw, 0px"
            priority
          />
        </ImageBox>

        <IconBox id="mobile-only-icon-box">
          <HeroPicture
            asset={HERO_MEDIA.firstTouchTelegram}
            media="(max-width: 767px)"
            sizes="(max-width: 767px) 50vw, 0px"
          />
        </IconBox>
      </MobileImagesBox>

      <ImageBox id="desktop-only-image-box">
        <HeroPicture
          asset={HERO_MEDIA.firstTouch}
          media="(min-width: 768px)"
          sizes="(max-width: 767px) 0px, (max-width: 920px) 380px, (max-width: 1100px) 470px, (max-width: 1240px) 500px, 660px"
          priority
        />
      </ImageBox>

      <IconBox id="desktop-only-icon-box">
        <HeroPicture
          asset={HERO_MEDIA.firstTouchTelegram}
          media="(min-width: 768px)"
          sizes="(max-width: 767px) 0px, (max-width: 920px) 210px, (max-width: 1100px) 250px, (max-width: 1240px) 280px, 356px"
        />
      </IconBox>
    </IntroductionSection>
  );

  const renderCourseProgramSection = () => (
    <CourseProgramSection id="course-program">
      <CourseProgramTextBox>
        <CourseProgramTitle>{t("program.title")}</CourseProgramTitle>
        <RoadmapContainer />
        {/* <CourseProgramButtonBox>
              <Button
                buttonText={t("hero.enrollButton")}
                href={FIRST_TOUCH_REGISTRATION_FORM_VIEW_URL}
                target="_blank"
              />
            </CourseProgramButtonBox> */}
      </CourseProgramTextBox>
      <CourseProgramImage
        src={"/images/first_touch_program_photo.webp"}
        alt={t("program.imageAlt")}
        width={473}
        height={709}
        sizes="(max-width: 920px) 100vw, 473px"
      />
    </CourseProgramSection>
  );

  return (
    <PageClientMessages namespaces={["FirstTouchPage.signupDialog"]}>
      <StructuredData
        data={[
          buildBreadcrumbStructuredData([
            { name: "Home", path: "/" },
            { name: "Online classes", path: "/online" },
            { name: t("hero.title"), path: "/online/first-touch" },
          ]),
          courseStructuredData,
        ]}
      />
      {renderIntroductionSection()}

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
        {renderCourseProgramSection()}
        <ContactSection>
          <Contacts bgColor="rgba(200, 204, 210, 0.4)" />
        </ContactSection>
      </SpecialWrapper>
    </PageClientMessages>
  );
}
