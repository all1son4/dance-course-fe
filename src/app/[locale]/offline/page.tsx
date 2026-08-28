import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import CourseCard from "@/components/cards/CourseCard";
import InteractiveCard from "@/components/cards/InteractiveCard";
import HeroPicture from "@/components/common/HeroPicture";
import StructuredData from "@/components/common/StructuredData";
import SvgAsset from "@/components/common/SvgAsset";
import Contacts from "@/components/other/Contacts";
import { HERO_MEDIA } from "@/constants/hero-media";
import {
  buildBreadcrumbStructuredData,
  buildPageMetadata,
  seoTargetLocale,
} from "@/lib/seo";

import { getOfflineCoursesArray } from "./constants";
import {
  CardBlock,
  ContactSection,
  CourseList,
  CoursesSection,
  Description,
  HighlightText,
  IconBox,
  ImageBox,
  IntroductionSection,
  Location,
  MobileImagesBox,
  Paragraph,
  Paragraphs,
  PromoteOnlineSection,
  PromoteTitle,
  TextBlock,
  TextBox,
  Title,
} from "./page.styles";

export async function generateMetadata(): Promise<Metadata> {
  const metadataT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata",
  });
  const pageT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata.pages.offline",
  });

  return buildPageMetadata({
    locale: seoTargetLocale,
    path: "/offline",
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

export default function Offline() {
  const t = useTranslations("OfflinePage");
  const commonT = useTranslations("Common");
  const offlineCoursesArray = getOfflineCoursesArray((key) => t(key));

  return (
    <>
      <StructuredData
        data={buildBreadcrumbStructuredData([
          { name: "Home", path: "/" },
          { name: t("hero.title"), path: "/offline" },
        ])}
      />
      <IntroductionSection>
        <TextBox>
          <Title>{t("hero.title")}</Title>
          <Location>{t("hero.location")}</Location>
          <Description>{t("hero.description")}</Description>
        </TextBox>
        <MobileImagesBox>
          <ImageBox id="mobile-only-image-box">
            <HeroPicture
              asset={HERO_MEDIA.offline}
              media="(max-width: 767px)"
              sizes="(max-width: 767px) 100vw, 0px"
              priority
            />
          </ImageBox>
          <IconBox id="mobile-only-icon-box">
            <HeroPicture
              asset={HERO_MEDIA.warsawMap}
              media="(max-width: 767px)"
              sizes="(max-width: 550px) 58vw, (max-width: 767px) 95vw, 0px"
            />
          </IconBox>
        </MobileImagesBox>
        <ImageBox id="desktop-only-image-box">
          <HeroPicture
            asset={HERO_MEDIA.offline}
            media="(min-width: 768px)"
            sizes="(max-width: 767px) 0px, (max-width: 880px) 400px, (max-width: 960px) 460px, (max-width: 1240px) 500px, 558px"
            priority
          />
        </ImageBox>
        <IconBox id="desktop-only-icon-box">
          <HeroPicture
            asset={HERO_MEDIA.warsawMap}
            media="(min-width: 768px)"
            sizes="(max-width: 767px) 0px, (max-width: 880px) 250px, (max-width: 1100px) 310px, 379px"
          />
        </IconBox>
      </IntroductionSection>
      <CoursesSection>
        {offlineCoursesArray.map(({ id, ...course }) => (
          <InteractiveCard key={id} {...course} />
        ))}
      </CoursesSection>
      <PromoteOnlineSection>
        <TextBlock>
          <PromoteTitle>{t("promo.title")}</PromoteTitle>
          <Paragraphs>
            <Paragraph>{t("promo.description.1")}</Paragraph>
            <Paragraph>{t("promo.description.2")}</Paragraph>
          </Paragraphs>
        </TextBlock>
        <CardBlock>
          <CourseCard
            icon={<SvgAsset src="/svg/TelegramGlass.webp" width={115} height={130} />}
            title={t("promo.card.title")}
            subtitle={t("promo.card.subtitle")}
            cardContent={
              <CourseList>
                <li>
                  {t("promo.card.items.1.prefix")}{" "}
                  <HighlightText>
                    &quot;{t("promo.card.items.1.highlight")}&quot;
                  </HighlightText>
                </li>
                <li>
                  {t("promo.card.items.2.prefix")}{" "}
                  <HighlightText>{t("promo.card.items.2.highlight")}</HighlightText>
                </li>
                <li>{t("promo.card.items.3")}</li>
                <li>
                  <HighlightText>{t("promo.card.items.4")}</HighlightText>
                </li>
              </CourseList>
            }
            buttonText={commonT("details")}
            buttonHref="/online"
            bgColor="rgba(200, 204, 210, 0.4)"
          />
        </CardBlock>
      </PromoteOnlineSection>
      <ContactSection>
        <Contacts bgColor="rgba(200, 204, 210, 0.4)" />
      </ContactSection>
    </>
  );
}
