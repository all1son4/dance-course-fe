import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { Button, ContactCard, Contacts, CourseCard, FAQ } from "@/components";
import SvgAsset from "@/components/common/SvgAsset";
import {
  INSTAGRAM_DIB_GALA_URL,
  INSTAGRAM_PROFILE_HANDLE,
  INSTAGRAM_PROFILE_URL,
  INSTAGRAM_STAGE18_URL,
  INSTAGRAM_WORLD_OF_DANCE_POLAND_URL,
} from "@/constants/links";
import { buildPageMetadata } from "@/lib/seo";
import { Insta, Logo, Quote } from "@/svg";

import {
  AboutMeImageBox,
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

type HomePageMetadataProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: HomePageMetadataProps): Promise<Metadata> {
  const { locale } = await params;
  const metadataT = await getTranslations({ locale, namespace: "Metadata" });
  const pageT = await getTranslations({ locale, namespace: "Metadata.pages.home" });

  return buildPageMetadata({
    locale,
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
          <StyledImage
            src={"/images/main_page_second.webp"}
            alt={t("about.imageAlt")}
            width={560}
            height={635}
            sizes="(max-width: 880px) 100vw, 560px"
          />
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
                <li>
                  <span style={{ fontWeight: 600 }}>
                    {t("courses.offline.items.1.highlight")}
                  </span>{" "}
                  - {t("courses.offline.items.1.text")}
                </li>
                <li>
                  <span style={{ fontWeight: 600 }}>
                    {t("courses.offline.items.2.highlight")}
                  </span>{" "}
                  - {t("courses.offline.items.2.text")}
                </li>
                <li>
                  <span style={{ fontWeight: 600 }}>
                    {t("courses.offline.items.3.highlight")}
                  </span>{" "}
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
                  <span style={{ fontWeight: 600 }}>
                    &quot;{t("courses.online.items.1.highlight")}&quot;
                  </span>
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
