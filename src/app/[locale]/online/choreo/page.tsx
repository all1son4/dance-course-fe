import type { Metadata } from "next";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import ChoreoCard from "@/components/cards/ChoreoCard";
import TextContentCard from "@/components/cards/TextContentCard";
import Button from "@/components/common/Button";
import StructuredData from "@/components/common/StructuredData";
import SvgAsset from "@/components/common/SvgAsset";
import Contacts from "@/components/other/Contacts";
import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";
import { buildPageMetadata, normalizedSiteUrl, seoTargetLocale } from "@/lib/seo";

import { buildCheckoutOffersStructuredData } from "../_shared/structured-data";
import { getChoreos, getOnlineSuggestions } from "./constants";
import {
  AboutChoreoCards,
  AboutChoreoSection,
  AboutChoreoTitle,
  ButtonBox,
  ChoreoSection,
  Date,
  DateBox,
  Description,
  DescriptionParagraph,
  From,
  IconBox,
  ImageBox,
  IntroductionSection,
  MobileImagesBox,
  SpecialWrapper,
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
    namespace: "Metadata.pages.choreo",
  });

  return buildPageMetadata({
    locale: seoTargetLocale,
    path: "/online/choreo",
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

export default function ChoreoPage() {
  const locale = useLocale();
  const t = useTranslations("ChoreoPage");
  const productT = useTranslations("SellableProducts");
  const onlineSuggestions = getOnlineSuggestions(
    (key) => t(key),
    (key) =>
      t.rich(key, {
        p: (chunks) => <p>{chunks}</p>,
        strong: (chunks) => <strong>{chunks}</strong>,
      }),
  );
  const choreos = getChoreos((key) => productT(key));
  const sellableChoreoProducts = SELLABLE_PRODUCTS_LIST.filter(
    (product) => product.type === "choreo",
  );
  const choreographyProductsStructuredData = sellableChoreoProducts.map((product) => ({
    "@context": "https://schema.org",
    "@type": "Product",
    name: productT(product.titleKey),
    description: product.descriptionKeys.map((key) => productT(key)).join(" "),
    category: "Dance choreography tutorial",
    inLanguage: locale,
    brand: {
      "@type": "Brand",
      name: "Anna Strok",
    },
    offers: product.offers.flatMap((offer) =>
      buildCheckoutOffersStructuredData({
        offer,
        offerName: productT(offer.labelKey),
        productId: product.id,
      }),
    ),
    url: `${normalizedSiteUrl}/online/choreo`,
  }));

  return (
    <>
      <StructuredData data={choreographyProductsStructuredData} />
      <IntroductionSection>
        <TextBox>
          <Title>{t("hero.title")}</Title>

          <Description>
            <DescriptionParagraph>{t("hero.description.1")}</DescriptionParagraph>
            <DescriptionParagraph>{t("hero.description.2")}</DescriptionParagraph>
          </Description>

          <DateBox>
            <From>{t("hero.startLabel")}</From>
            <Date>{t("hero.startValue")}</Date>
          </DateBox>

          <ButtonBox>
            <Button buttonText={t("hero.button")} href="#choreo-section" />
          </ButtonBox>
        </TextBox>

        <MobileImagesBox>
          <ImageBox id="mobile-only-image-box">
            <SvgAsset
              src="/svg/OnlineChoreoPageBackgroundPhoto.webp"
              width={794}
              height={989}
              sizes="(max-width: 767px) 100vw, 0px"
              priority
              unoptimized
            />
          </ImageBox>

          <IconBox id="mobile-only-icon-box">
            <SvgAsset
              src="/svg/TelegramChoreo.webp"
              width={401}
              height={421}
              sizes="(max-width: 767px) 50vw, 0px"
            />
          </IconBox>
        </MobileImagesBox>

        <ImageBox id="desktop-only-image-box">
          <SvgAsset
            src="/svg/OnlineChoreoPageBackgroundPhoto.webp"
            width={794}
            height={989}
            sizes="(max-width: 767px) 0px, (max-width: 880px) 490px, (max-width: 1140px) 540px, (max-width: 1240px) 640px, 794px"
            priority
            unoptimized
          />
        </ImageBox>

        <IconBox id="desktop-only-icon-box">
          <SvgAsset
            src="/svg/TelegramChoreo.webp"
            width={401}
            height={421}
            sizes="(max-width: 767px) 0px, (max-width: 880px) 240px, (max-width: 1140px) 260px, (max-width: 1240px) 320px, 401px"
          />
        </IconBox>
      </IntroductionSection>
      <SpecialWrapper>
        <AboutChoreoSection>
          <AboutChoreoTitle>{t("about.title")}</AboutChoreoTitle>
          <AboutChoreoCards>
            {onlineSuggestions.map(({ id, ...suggestion }) => (
              <TextContentCard key={id} {...suggestion} />
            ))}
          </AboutChoreoCards>
        </AboutChoreoSection>
        <ChoreoSection id="choreo-section">
          {choreos.map(({ id, ...choreo }) => (
            <ChoreoCard key={id} {...choreo} />
          ))}
        </ChoreoSection>
        <Contacts bgColor="rgba(200, 204, 210, 0.4)" />
      </SpecialWrapper>
    </>
  );
}
