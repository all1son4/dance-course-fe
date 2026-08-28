import { useLocale, useTranslations } from "next-intl";

import HeroMedia from "@/app/[locale]/_shared/hero-media";
import Button from "@/components/common/Button";
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
import { buildLocalizedPageMetadata } from "@/lib/page-metadata";
import { imageFadeProps } from "@/lib/reveal";
import {
  annaStrokStructuredDataId,
  buildBreadcrumbStructuredData,
  normalizedSiteUrl,
} from "@/lib/seo";

import ProductFact from "../_shared/product-fact";
import ProductHero from "../_shared/product-hero";
import {
  AboutCourseCards,
  AboutCourseTitle,
  Description,
  DescriptionParagraph,
  InfoBoxGroup,
  SpecialWrapper,
  VideoSection,
} from "../_shared/section.styles";
import { buildCourseOffersStructuredData } from "../_shared/structured-data";
import SuggestionGrid from "../_shared/suggestion-grid";
import { getFirstTouchSuggestions } from "./constants";
import {
  AboutCourseSection,
  ButtonBox,
  CourseProgramImage,
  CourseProgramSection,
  CourseProgramTextBox,
  CourseProgramTitle,
  IconBox,
  ImageBox,
  IntroductionSection,
  MobileImagesBox,
  StartNote,
  Subtitle,
  TextBox,
  Title,
} from "./page.styles";

export const generateMetadata = () =>
  buildLocalizedPageMetadata({ pageKey: "firstTouch", path: "/online/first-touch" });

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
    <ProductHero
      components={{ Section: IntroductionSection, TextBox }}
      media={
        <HeroMedia
          boxes={{ MobileImagesBox, ImageBox, IconBox }}
          photo={{
            asset: HERO_MEDIA.firstTouch,
            mobileSizes: "(max-width: 450px) 100vw, (max-width: 767px) 90vw, 0px",
            desktopSizes:
              "(max-width: 767px) 0px, (max-width: 920px) 380px, (max-width: 1100px) 470px, (max-width: 1240px) 500px, 660px",
          }}
          icon={{
            asset: HERO_MEDIA.firstTouchTelegram,
            mobileSizes: "(max-width: 767px) 50vw, 0px",
            desktopSizes:
              "(max-width: 767px) 0px, (max-width: 920px) 210px, (max-width: 1100px) 250px, (max-width: 1240px) 280px, 356px",
          }}
        />
      }
    >
      <Title>{t("hero.title")}</Title>
      <Subtitle>{t("hero.subtitle")}</Subtitle>

      <Description>
        <DescriptionParagraph>{t("hero.description.1")}</DescriptionParagraph>
        <DescriptionParagraph>{t("hero.description.2")}</DescriptionParagraph>
      </Description>

      <InfoBoxGroup>
        <ProductFact label={t("hero.startLabel")} value={t("hero.startDate")}>
          <StartNote>{t("hero.startNote")}</StartNote>
        </ProductFact>

        <ProductFact label={t("hero.priceLabel")} value={coursePrice} />
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
          analytics={{ id: "view_course_program", placement: "first_touch_hero" }}
        />
      </ButtonBox>
    </ProductHero>
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
        {...imageFadeProps}
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

      <SpecialWrapper $compactAt={1100} $stacked={false}>
        <VideoSection>
          <VideoPlayer
            analyticsId="first-touch-introduction"
            src={t("hero.introductionVideoSrc")}
            poster="/images/first_touch_poster.webp"
            radius="0px"
          />
        </VideoSection>
        <SuggestionGrid
          components={{
            Section: AboutCourseSection,
            Title: AboutCourseTitle,
            Cards: AboutCourseCards,
          }}
          title={t("about.title")}
          items={onlineSuggestions}
        />
        {renderCourseProgramSection()}
        <Contacts layout="spaced" />
      </SpecialWrapper>
    </PageClientMessages>
  );
}
