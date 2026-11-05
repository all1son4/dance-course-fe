import { getTranslations } from "next-intl/server";

import HeroMedia from "@/app/[locale]/_shared/hero-media";
import InteractiveCard from "@/components/cards/InteractiveCard";
import Button from "@/components/common/Button";
import StructuredData from "@/components/common/StructuredData";
import Contacts from "@/components/other/Contacts";
import { HERO_MEDIA } from "@/constants/hero-media";
import {
  CHOREO_CATALOGUE_PRODUCT_CODES,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { buildLocalizedPageMetadata } from "@/lib/page-metadata";
import { imageFadeProps } from "@/lib/reveal";
import { getProductsSaleState } from "@/lib/sales-availability";
import { buildBreadcrumbStructuredData, normalizedSiteUrl } from "@/lib/seo";

import { toPlainTitle } from "./_shared/content";
import ProductHero from "./_shared/product-hero";
import { DescriptionParagraph } from "./_shared/section.styles";
import { getOnlineCoursesArray } from "./constants";
import {
  CoursesSection,
  Description,
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

export const generateMetadata = () =>
  buildLocalizedPageMetadata({ pageKey: "online", path: "/online" });

export const dynamic = "force-dynamic";

export default async function Online() {
  const [t, metadataT, commonT, choreoSaleState] = await Promise.all([
    getTranslations("OnlinePage"),
    getTranslations("Metadata"),
    getTranslations("Common"),
    getProductsSaleState(
      CHOREO_CATALOGUE_PRODUCT_CODES.map((code) => SELLABLE_PRODUCTS[code].id),
    ),
  ]);
  const onlineCoursesArray = getOnlineCoursesArray(
    (key) => t(key),
    (key) => commonT(key),
    choreoSaleState,
  );
  const onlineCoursesStructuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("hero.title"),
    itemListElement: onlineCoursesArray.map((course, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: toPlainTitle(String(course.title)),
      url: `${normalizedSiteUrl}${course.buttonHref}`,
    })),
  };

  return (
    <>
      <StructuredData
        data={[
          buildBreadcrumbStructuredData([
            { name: metadataT("breadcrumbHome"), path: "/" },
            { name: t("hero.title"), path: "/online" },
          ]),
          onlineCoursesStructuredData,
        ]}
      />
      <ProductHero
        components={{ Section: IntroductionSection, TextBox }}
        media={
          <HeroMedia
            boxes={{ MobileImagesBox, ImageBox, IconBox }}
            photo={{
              asset: HERO_MEDIA.online,
              alt: metadataT("pages.online.heroImageAlt"),
              mobileSizes: "(max-width: 767px) calc(100vw - 40px), 0px",
              desktopSizes:
                "(max-width: 767px) 0px, (max-width: 920px) 400px, (max-width: 1140px) 550px, 598px",
            }}
            icon={{
              asset: HERO_MEDIA.onlineTelegram,
              mobileSizes: "(max-width: 767px) calc((100vw - 40px) * 0.62), 0px",
              desktopSizes:
                "(max-width: 767px) 0px, (max-width: 920px) 250px, (max-width: 1140px) 350px, 453px",
            }}
          />
        }
      >
        <Title>{t("hero.title")}</Title>
        <Location>{t("hero.location")}</Location>
        <Description>
          <DescriptionParagraph>{t("hero.description.1")}</DescriptionParagraph>
          <DescriptionParagraph>{t("hero.description.2")}</DescriptionParagraph>
        </Description>
      </ProductHero>
      <CoursesSection>
        {onlineCoursesArray.map(({ id, ...course }) => (
          <InteractiveCard
            key={id}
            {...course}
            analyticsCollection="online_courses"
            analyticsId={id}
          />
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
          <Button
            buttonText={t("studio.button")}
            width="284px"
            href="/offline"
            analytics={{ id: "online_to_offline", placement: "online_studio" }}
          />
        </StudioDanceTextBox>
        <StudioDanceImage
          {...imageFadeProps}
          src={"/images/online_page_photo.webp"}
          width={502}
          height={628}
          alt={t("studio.imageAlt")}
          sizes="(max-width: 880px) 100vw, 502px"
        />
      </StudioDanceSection>
      <Contacts layout="slab" />
    </>
  );
}
