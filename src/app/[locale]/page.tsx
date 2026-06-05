import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import ContactCard from "@/components/cards/ContactCard";
import CourseCard from "@/components/cards/CourseCard";
import Button from "@/components/common/Button";
import SvgAsset from "@/components/common/SvgAsset";
import Contacts from "@/components/other/Contacts";
import FAQ from "@/components/other/FAQ";
import {
  INSTAGRAM_DIB_GALA_URL,
  INSTAGRAM_PROFILE_HANDLE,
  INSTAGRAM_PROFILE_URL,
  INSTAGRAM_STAGE18_URL,
  INSTAGRAM_WORLD_OF_DANCE_POLAND_URL,
} from "@/constants/links";
import { buildPageMetadata, seoTargetLocale } from "@/lib/seo";
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
  ContactSection,
  CourseList,
  CourseOptionsBox,
  CourseSection,
  CourseTitle,
  DescriptionBox,
  DescriptionText,
  DescriptionTitle,
  FAQSection,
  HighlightText,
  IconPositionWrap,
  ImageDescriptionBox,
  ImageDescriptionCard,
  InteractiveBox,
  InteractiveHint,
  IntroduceSection,
  MainTextBox,
  MainTitle,
  StyledImage,
} from "./page.styles";

export async function generateMetadata(): Promise<Metadata> {
  const metadataT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata",
  });
  const pageT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata.pages.home",
  });

  return buildPageMetadata({
    locale: seoTargetLocale,
    path: "/",
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

export default function Home() {
  const t = useTranslations("HomePage");
  const commonT = useTranslations("Common");

  return (
    <>
      <IntroduceSection>
        <AbsolutePageImage>
          <SvgAsset
            src="/svg/MainPageBackgroundPhoto.webp"
            width={775}
            height={900}
            sizes="(max-width: 1240px) 0px, (max-width: 1440px) 52vw, 775px"
            priority
            unoptimized
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
              <Button buttonText={t("hero.buttons.online")} href="/online" />
              <Button buttonText={t("hero.buttons.offline")} href="/offline" />
            </ButtonsBox>
          </InteractiveBox>
        </MainTextBox>
        <AbsolutePageLogo>
          <SvgAsset
            src="/svg/MainPageBackgroundPhoto.webp"
            width={775}
            height={900}
            className="hero-mobile-bg"
            sizes="(max-width: 450px) 100vw, (max-width: 680px) 80vw, (max-width: 767px) 65vw, (max-width: 920px) 420px, (max-width: 1110px) 480px, (max-width: 1240px) 550px, 0px"
            priority
            unoptimized
          />
          <div className="hero-brand-logo">
            <Logo width={350} height={77} />
          </div>
        </AbsolutePageLogo>
      </IntroduceSection>
      <AboutMeSection>
        <AboutMeTextBox>
          <AboutMeTitle>{t("about.title")}</AboutMeTitle>
          <ContactCard
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
                  <HighlightText>{t("courses.offline.items.3.highlight")}</HighlightText>{" "}
                  - {t("courses.offline.items.3.text")}
                </li>
              </CourseList>
            }
            buttonText={commonT("details")}
            buttonHref="/offline"
          />
          <CourseCard
            icon={<SvgAsset src="/svg/TelegramGlass.webp" width={169} height={190} />}
            title={t("courses.online.title")}
            subtitle={t("courses.online.subtitle")}
            cardContent={
              <CourseList>
                <li>
                  {t("courses.online.items.1.prefix")}{" "}
                  <HighlightText>
                    &quot;{t("courses.online.items.1.highlight")}&quot;
                  </HighlightText>
                </li>
                <li>{t("courses.online.items.2")}</li>
              </CourseList>
            }
            buttonText={commonT("details")}
            buttonHref="/online"
          />
        </CourseOptionsBox>
      </CourseSection>
      <FAQSection>
        <FAQ />
      </FAQSection>
      <ContactSection>
        <Contacts />
      </ContactSection>
    </>
  );
}
