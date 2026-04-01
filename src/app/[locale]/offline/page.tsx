import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import CourseCard from "@/components/cards/CourseCard";
import InteractiveCard from "@/components/cards/InteractiveCard";
import SvgAsset from "@/components/common/SvgAsset";
import Contacts from "@/components/other/Contacts";
import { buildPageMetadata, seoTargetLocale } from "@/lib/seo";

import { getOfflineCoursesArray } from "./constants";
import {
  CardBlock,
  ContactSection,
  CourseList,
  CoursesSection,
  Description,
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

type OfflinePageMetadataProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: OfflinePageMetadataProps): Promise<Metadata> {
  await params;
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
      <IntroductionSection>
        <TextBox>
          <Title>{t("hero.title")}</Title>
          <Location>{t("hero.location")}</Location>
          <Description>{t("hero.description")}</Description>
        </TextBox>
        <MobileImagesBox>
          <ImageBox id="mobile-only-image-box">
            <SvgAsset
              src="/svg/OfflinePageBackgroundPhoto.webp"
              width={558}
              height={738}
              sizes="(max-width: 767px) 100vw, 0px"
              loading="eager"
            />
          </ImageBox>
          <IconBox id="mobile-only-icon-box">
            <SvgAsset
              src="/svg/WarsawMap.webp"
              width={379}
              height={568}
              sizes="(max-width: 550px) 58vw, (max-width: 767px) 95vw, 0px"
            />
          </IconBox>
        </MobileImagesBox>
        <ImageBox id="desktop-only-image-box">
          <SvgAsset
            src="/svg/OfflinePageBackgroundPhoto.webp"
            width={558}
            height={738}
            sizes="(max-width: 767px) 0px, (max-width: 880px) 400px, (max-width: 960px) 460px, (max-width: 1240px) 500px, 558px"
            priority
          />
        </ImageBox>
        <IconBox id="desktop-only-icon-box">
          <SvgAsset
            src="/svg/WarsawMap.webp"
            width={379}
            height={568}
            sizes="(max-width: 767px) 0px, (max-width: 880px) 250px, (max-width: 1100px) 310px, 379px"
          />
        </IconBox>
      </IntroductionSection>
      <CoursesSection>
        {offlineCoursesArray.map((course) => (
          <InteractiveCard
            key={course.id}
            title={course.title}
            topRowContent={course.topRowContent}
            bottomRowContent={course.bottomRowContent}
            buttonText={course.buttonText}
            buttonHref={course.buttonHref}
            buttonTarget={course.buttonTarget}
            buttonRel={course.buttonRel}
          />
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
                  <span style={{ fontWeight: 600 }}>
                    &quot;{t("promo.card.items.1.highlight")}&quot;
                  </span>
                </li>
                <li>{t("promo.card.items.2")}</li>
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
