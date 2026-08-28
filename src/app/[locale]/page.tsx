import { useTranslations } from "next-intl";

import CourseCard from "@/components/cards/CourseCard";
import IconTextCard from "@/components/cards/IconTextCard";
import Button from "@/components/common/Button";
import HeroPicture from "@/components/common/HeroPicture";
import StructuredData from "@/components/common/StructuredData";
import SvgAsset from "@/components/common/SvgAsset";
import Contacts from "@/components/other/Contacts";
import FAQ from "@/components/other/FAQ";
import { getQuestionsArray } from "@/components/other/FAQ/FAQ.constants";
import OnlinePromoCard, {
  CourseList,
  HighlightText,
} from "@/components/other/OnlinePromoCard";
import Reviews from "@/components/other/Reviews";
import { HERO_MEDIA } from "@/constants/hero-media";
import {
  INSTAGRAM_DIB_GALA_URL,
  INSTAGRAM_PROFILE_HANDLE,
  INSTAGRAM_PROFILE_URL,
  INSTAGRAM_STAGE18_URL,
  INSTAGRAM_WORLD_OF_DANCE_POLAND_URL,
} from "@/constants/links";
import PageClientMessages from "@/i18n/PageClientMessages";
import { buildLocalizedPageMetadata } from "@/lib/page-metadata";
import { imageFadeProps } from "@/lib/reveal";
import { buildWebsiteStructuredData } from "@/lib/seo";
import { Insta, Logo, Quote } from "@/svg";

import {
  AboutMeImageBox,
  AboutMeImageFrame,
  AboutMeList,
  AboutMeParagraph,
  AboutMeParagraphs,
  AboutMeSection,
  AboutMeTextBox,
  AboutMeTitle,
  AbsolutePageImage,
  AbsolutePageLogo,
  ButtonsBox,
  CourseOptionsBox,
  CourseSection,
  CourseTitle,
  DescriptionBox,
  DescriptionText,
  DescriptionTitle,
  FAQSection,
  IconPositionWrap,
  ImageDescriptionBox,
  ImageDescriptionCard,
  InteractiveBox,
  InteractiveHint,
  IntroduceSection,
  MainTextBox,
  MainTitle,
  ReviewsSection,
  StyledImage,
} from "./page.styles";

export const generateMetadata = () =>
  buildLocalizedPageMetadata({ pageKey: "home", path: "/" });

export default function Home() {
  const t = useTranslations("HomePage");
  const commonT = useTranslations("Common");
  const faqT = useTranslations("FAQ");
  const metadataT = useTranslations("Metadata");
  const questions = getQuestionsArray((key) => faqT(key));
  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((question) => ({
      "@type": "Question",
      name: question.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: question.answer,
      },
    })),
  };

  const renderIntroductionSection = () => (
    <IntroduceSection>
      <AbsolutePageImage>
        <HeroPicture
          asset={HERO_MEDIA.home}
          media="(min-width: 1241px)"
          sizes="(max-width: 1240px) 0px, (max-width: 1440px) 52vw, 775px"
          priority
        />
      </AbsolutePageImage>
      <MainTextBox>
        <MainTitle>{t("hero.title")}</MainTitle>
        <DescriptionBox>
          <DescriptionTitle>{t("hero.subtitle")}</DescriptionTitle>
          <DescriptionText>{t("hero.description")}</DescriptionText>
        </DescriptionBox>
        <InteractiveBox>
          <InteractiveHint>{t("hero.hint")}</InteractiveHint>
          <ButtonsBox>
            {/* Hero sits on the background photo, so these two get real frost. */}
            <Button buttonText={t("hero.buttons.online")} href="/online" frost="live" />
            <Button buttonText={t("hero.buttons.offline")} href="/offline" frost="live" />
          </ButtonsBox>
        </InteractiveBox>
      </MainTextBox>
      <AbsolutePageLogo>
        <HeroPicture
          asset={HERO_MEDIA.home}
          media="(max-width: 1240px)"
          sizes="(max-width: 450px) 100vw, (max-width: 680px) 80vw, (max-width: 767px) 65vw, (max-width: 920px) 420px, (max-width: 1110px) 480px, (max-width: 1240px) 550px, 0px"
          className="hero-mobile-bg"
          priority
        />
        <div className="hero-brand-logo">
          <Logo width={350} height={77} />
        </div>
      </AbsolutePageLogo>
    </IntroduceSection>
  );

  const renderAboutMeSection = () => (
    <AboutMeSection>
      <AboutMeTextBox>
        <AboutMeTitle>{t("about.title")}</AboutMeTitle>
        <IconTextCard
          variant="contact"
          icon={<Insta />}
          title={t("about.instagram")}
          text={INSTAGRAM_PROFILE_HANDLE}
          link={INSTAGRAM_PROFILE_URL}
        />
        <AboutMeParagraphs>
          <AboutMeParagraph>{t("about.bio.1")}</AboutMeParagraph>
          <AboutMeParagraph>{t("about.bio.2")}</AboutMeParagraph>
        </AboutMeParagraphs>

        <AboutMeList>
          <li>
            {t("about.achievements.stage18Solo.prefix")}{" "}
            <a href={INSTAGRAM_STAGE18_URL} target="_blank" rel="noopener noreferrer">
              @stage_18
            </a>{" "}
            {t("about.achievements.stage18Solo.suffix")}
          </li>
          <li>
            {t("about.achievements.stage18Team.prefix")}{" "}
            <a href={INSTAGRAM_STAGE18_URL} target="_blank" rel="noopener noreferrer">
              @stage_18
            </a>{" "}
            {t("about.achievements.stage18Team.suffix")}
          </li>
          <li>
            {t("about.achievements.wod.prefix")}{" "}
            <a
              href={INSTAGRAM_WORLD_OF_DANCE_POLAND_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              @worldofdancepoland
            </a>{" "}
            {t("about.achievements.wod.suffix")}
          </li>
          <li>
            {t("about.achievements.dib.prefix")}{" "}
            <a href={INSTAGRAM_DIB_GALA_URL} target="_blank" rel="noopener noreferrer">
              @dib.gala
            </a>
          </li>
        </AboutMeList>
      </AboutMeTextBox>
      <AboutMeImageBox>
        <AboutMeImageFrame>
          <StyledImage
            {...imageFadeProps}
            src={"/images/main_page_second.webp"}
            alt={t("about.imageAlt")}
            fill
            sizes="(max-width: 880px) 100vw, 560px"
          />
        </AboutMeImageFrame>
        <ImageDescriptionBox>
          <IconPositionWrap>
            <Quote />
          </IconPositionWrap>
          <ImageDescriptionCard>
            <AboutMeParagraph>{t("about.quote.1")}</AboutMeParagraph>
            <AboutMeParagraph>{t("about.quote.2")}</AboutMeParagraph>
          </ImageDescriptionCard>
        </ImageDescriptionBox>
      </AboutMeImageBox>
    </AboutMeSection>
  );

  const renderCourseSection = () => (
    <CourseSection>
      <CourseTitle>{t("courses.title")}</CourseTitle>
      <CourseOptionsBox>
        <CourseCard
          icon={<SvgAsset src="/svg/Map.webp" width={132} height={210} />}
          title={t("courses.offline.title")}
          subtitle={t("courses.offline.subtitle")}
          cardContent={
            <CourseList>
              {/* <li>
                  <HighlightText>{t("courses.offline.items.1.highlight")}</HighlightText>{" "}
                  - {t("courses.offline.items.1.text")}
                </li> */}
              {/* <li>
                  <HighlightText>{t("courses.offline.items.2.highlight")}</HighlightText>{" "}
                  - {t("courses.offline.items.2.text")}
                </li> */}
              <li>
                <HighlightText>{t("courses.offline.items.3.highlight")}</HighlightText> -{" "}
                {t("courses.offline.items.3.text")}
              </li>
              <li>{t("courses.offline.items.4")}</li>
            </CourseList>
          }
          buttonText={commonT("details")}
          buttonHref="/offline"
        />
        <OnlinePromoCard
          icon={<SvgAsset src="/svg/TelegramGlass.webp" width={169} height={190} />}
        />
      </CourseOptionsBox>
    </CourseSection>
  );

  return (
    <PageClientMessages namespaces={["FAQ", "Reviews"]}>
      <StructuredData
        data={[buildWebsiteStructuredData(metadataT("siteName")), faqStructuredData]}
      />
      {renderIntroductionSection()}
      {renderAboutMeSection()}
      {renderCourseSection()}
      <FAQSection>
        <FAQ />
      </FAQSection>
      <ReviewsSection>
        <Reviews />
      </ReviewsSection>
      <Contacts layout="inset" />
    </PageClientMessages>
  );
}
