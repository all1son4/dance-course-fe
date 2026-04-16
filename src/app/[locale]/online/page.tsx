import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import InteractiveCard from "@/components/cards/InteractiveCard";
import Button from "@/components/common/Button";
import SvgAsset from "@/components/common/SvgAsset";
import Contacts from "@/components/other/Contacts";
import { buildPageMetadata, seoTargetLocale } from "@/lib/seo";

import { getOnlineCoursesArray } from "./constants";
import {
  ContactSection,
  CoursesSection,
  Description,
  DescriptionParagraph,
  IconBox,
  ImageBox,
  IntroductionSection,
  Location,
  MobileImagesBox,
  StudioDanceImage,
  StudioDanceParagraph,
  StudioDanceParagraphs,
  StudioDanceSection,
  StudioDanceTextBox,
  StudioDanceTitle,
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
    namespace: "Metadata.pages.online",
  });

  return buildPageMetadata({
    locale: seoTargetLocale,
    path: "/online",
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

export default function Online() {
  const t = useTranslations("OnlinePage");
  const onlineCoursesArray = getOnlineCoursesArray((key) => t(key));

  return (
    <>
      <IntroductionSection>
        <TextBox>
          <Title>{t("hero.title")}</Title>
          <Location>{t("hero.location")}</Location>
          <Description>
            <DescriptionParagraph>{t("hero.description.1")}</DescriptionParagraph>
            <DescriptionParagraph>{t("hero.description.2")}</DescriptionParagraph>
          </Description>
        </TextBox>
        <MobileImagesBox>
          <ImageBox id="mobile-only-image-box">
            <SvgAsset
              src="/svg/OnlinePageBackgroundPhoto.webp"
              width={598}
              height={846}
              sizes="(max-width: 767px) 100vw, 0px"
              priority
              unoptimized
            />
          </ImageBox>
          <IconBox id="mobile-only-icon-box">
            <SvgAsset
              src="/svg/OnlineTelegramBig.webp"
              width={453}
              height={474}
              sizes="(max-width: 767px) 65vw, 0px"
            />
          </IconBox>
        </MobileImagesBox>
        <ImageBox id="desktop-only-image-box">
          <SvgAsset
            src="/svg/OnlinePageBackgroundPhoto.webp"
            width={598}
            height={846}
            sizes="(max-width: 767px) 0px, (max-width: 920px) 400px, (max-width: 1140px) 550px, 598px"
            priority
            unoptimized
          />
        </ImageBox>
        <IconBox id="desktop-only-icon-box">
          <SvgAsset
            src="/svg/OnlineTelegramBig.webp"
            width={453}
            height={474}
            sizes="(max-width: 767px) 0px, (max-width: 920px) 250px, (max-width: 1140px) 350px, 453px"
          />
        </IconBox>
      </IntroductionSection>
      <CoursesSection>
        {onlineCoursesArray.map(({ id, ...course }) => (
          <InteractiveCard key={id} {...course} />
        ))}
      </CoursesSection>
      <StudioDanceSection>
        <StudioDanceTextBox>
          <StudioDanceTitle>{t("studio.title")}</StudioDanceTitle>
          <StudioDanceParagraphs>
            <StudioDanceParagraph>{t("studio.paragraphs.1")}</StudioDanceParagraph>
            <StudioDanceParagraph>{t("studio.paragraphs.2")}</StudioDanceParagraph>
            <StudioDanceParagraph>{t("studio.paragraphs.3")}</StudioDanceParagraph>
          </StudioDanceParagraphs>
          <Button buttonText={t("studio.button")} width="284px" href="/offline" />
        </StudioDanceTextBox>
        <StudioDanceImage
          src={"/images/online_page_photo.webp"}
          width={502}
          height={628}
          alt={t("studio.imageAlt")}
          sizes="(max-width: 880px) 100vw, 502px"
        />
      </StudioDanceSection>
      <ContactSection>
        <Contacts bgColor="rgba(200, 204, 210, 0.4)" />
      </ContactSection>
    </>
  );
}
