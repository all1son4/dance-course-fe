import { getTranslations } from "next-intl/server";

import HeroMedia from "@/app/[locale]/_shared/hero-media";
import Button from "@/components/common/Button";
import StructuredData from "@/components/common/StructuredData";
import ClosedSalesNotice from "@/components/other/ClosedSalesNotice";
import Contacts from "@/components/other/Contacts";
import { HERO_MEDIA } from "@/constants/hero-media";
import {
  CHOREO_CATALOGUE_PRODUCT_CODES,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { buildLocalizedPageMetadata } from "@/lib/page-metadata";
import { getProductsSaleState } from "@/lib/sales-availability";
import { buildBreadcrumbStructuredData } from "@/lib/seo";
import { stickyCtaAnchorProps } from "@/lib/sticky-cta";

import { createRichText } from "../_shared/content";
import ProductHero from "../_shared/product-hero";
import {
  AboutChoreoCards,
  AboutChoreoSection,
  AboutChoreoTitle,
  Date,
  DateBox,
  Description,
  DescriptionParagraph,
  From,
  InfoBoxGroup,
  SpecialWrapper,
} from "../_shared/section.styles";
import SuggestionGrid from "../_shared/suggestion-grid";
import ChoreoCatalogueSection from "./choreo-catalogue-section";
import { getChoreoSuggestions } from "./constants";
import {
  ButtonBox,
  IconBox,
  ImageBox,
  IntroductionSection,
  MobileImagesBox,
  TextBox,
  Title,
} from "./page.styles";

export const generateMetadata = () =>
  buildLocalizedPageMetadata({ pageKey: "choreo", path: "/online/choreo" });

export const dynamic = "force-dynamic";

export default async function ChoreoPage() {
  const [t, commonT, saleState] = await Promise.all([
    getTranslations("ChoreoPage"),
    getTranslations("Common"),
    getProductsSaleState(
      CHOREO_CATALOGUE_PRODUCT_CODES.map((code) => SELLABLE_PRODUCTS[code].id),
    ),
  ]);
  const hasOpenSales = saleState === "open";
  const onlineSuggestions = getChoreoSuggestions((key) => t(key), createRichText(t));

  return (
    <>
      <StructuredData
        data={buildBreadcrumbStructuredData([
          { name: "Home", path: "/" },
          { name: "Online classes", path: "/online" },
          { name: t("hero.title"), path: "/online/choreo" },
        ])}
      />
      <ProductHero
        components={{ Section: IntroductionSection, TextBox }}
        media={
          <HeroMedia
            boxes={{ MobileImagesBox, ImageBox, IconBox }}
            photo={{
              asset: HERO_MEDIA.choreo,
              mobileSizes: "(max-width: 767px) 100vw, 0px",
              desktopSizes:
                "(max-width: 767px) 0px, (max-width: 880px) 490px, (max-width: 1140px) 540px, (max-width: 1240px) 640px, 794px",
            }}
            icon={{
              asset: HERO_MEDIA.choreoTelegram,
              mobileSizes: "(max-width: 767px) 50vw, 0px",
              desktopSizes:
                "(max-width: 767px) 0px, (max-width: 880px) 240px, (max-width: 1140px) 260px, (max-width: 1240px) 320px, 401px",
            }}
          />
        }
      >
        <Title>{t("hero.title")}</Title>
        <Description>
          {/* description.1 repeated the title ("online tutorials of my
              choreographies"), so the hero keeps only the explanatory line. */}
          <DescriptionParagraph>{t("hero.description.2")}</DescriptionParagraph>
        </Description>

        <InfoBoxGroup>
          {hasOpenSales ? (
            <DateBox>
              <From>{t("hero.startLabel")}</From>
              <Date>{t("hero.startValue")}</Date>
            </DateBox>
          ) : (
            <DateBox>
              <ClosedSalesNotice text={commonT("salesUnavailable")} />
            </DateBox>
          )}
        </InfoBoxGroup>
        {hasOpenSales && (
          <ButtonBox>
            <Button
              buttonText={t("hero.button")}
              href="#choreo-section"
              analytics={{ id: "select_choreo", placement: "choreo_hero" }}
              {...stickyCtaAnchorProps}
            />
          </ButtonBox>
        )}
      </ProductHero>

      <SpecialWrapper>
        {hasOpenSales && <ChoreoCatalogueSection />}
        <SuggestionGrid
          components={{
            Section: AboutChoreoSection,
            Title: AboutChoreoTitle,
            Cards: AboutChoreoCards,
          }}
          title={t("about.title")}
          items={onlineSuggestions}
        />
        <Contacts />
      </SpecialWrapper>
    </>
  );
}
