import { getTranslations } from "next-intl/server";

import HeroMedia from "@/app/[locale]/_shared/hero-media";
import Button from "@/components/common/Button";
import StructuredData from "@/components/common/StructuredData";
import ClosedSalesNotice from "@/components/other/ClosedSalesNotice";
import Contacts from "@/components/other/Contacts";
import ProgramRoadmap from "@/components/other/ProgramRoadmap";
import StickyCta from "@/components/other/StickyCta";
import { HERO_MEDIA } from "@/constants/hero-media";
import {
  buildCheckoutHref,
  formatOfferPrice,
  formatPrice,
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { buildLocalizedPageMetadata } from "@/lib/page-metadata";
import { imageFadeProps } from "@/lib/reveal";
import {
  getProductSaleState,
  getStorefrontSellableProducts,
} from "@/lib/sales-availability";
import { buildBreadcrumbStructuredData } from "@/lib/seo";
import { stickyCtaAnchorProps } from "@/lib/sticky-cta";

import ProductFact from "../_shared/product-fact";
import ProductHero from "../_shared/product-hero";
import {
  AboutCourseCards,
  AboutCourseTitle,
  Description,
  DescriptionParagraph,
  SpecialWrapper,
} from "../_shared/section.styles";
import {
  buildCourseOffersStructuredData,
  buildCourseStructuredData,
} from "../_shared/structured-data";
import SuggestionGrid from "../_shared/suggestion-grid";
import { getInspirationHubSuggestions } from "./constants";
import {
  AboutCourseSection,
  ButtonBox,
  FactNote,
  FactsRow,
  ImageBox,
  IntroductionSection,
  MobileImagesBox,
  StepsImage,
  StepsSection,
  StepsTextBox,
  StepsTitle,
  TextBox,
  Title,
} from "./page.styles";

const PATH = "/online/inspiration-hub";
const STEP_COUNT = 4;
const PAID_WEEKS = 8;

export const generateMetadata = () =>
  buildLocalizedPageMetadata({ pageKey: "inspirationHub", path: PATH });

// The buy button follows the admin sales switch, so the page is rendered per request.
export const dynamic = "force-dynamic";

export default async function InspirationHubPage() {
  const configuredProduct = SELLABLE_PRODUCTS["inspiration-hub"];
  // The buy button sits in the first viewport, so the sales state is read before
  // rendering instead of streaming in behind the shell (see SaleStateGate).
  const [t, metadataT, onlineT, commonT, saleState, catalogProducts] = await Promise.all([
    getTranslations("InspirationHubPage"),
    getTranslations("Metadata"),
    getTranslations("OnlinePage"),
    getTranslations("Common"),
    getProductSaleState(configuredProduct.id),
    getStorefrontSellableProducts(),
  ]);
  const product =
    catalogProducts.find((candidate) => candidate.id === configuredProduct.id) ??
    configuredProduct;
  // Only the full price is sold here; the member price has its own verified link.
  const offer =
    product.offers.find(
      (candidate) => candidate.id === INSPIRATION_HUB_ACCESS_OFFER_ID,
    ) ?? configuredProduct.offers[0];
  const price = formatOfferPrice(offer.prices);
  // The usual subscription anchor: what one week costs (40 EUR / 8 weeks = 5 EUR).
  const weeklyPrice = [
    formatPrice(Math.round(offer.prices.pln / PAID_WEEKS), "pln"),
    formatPrice(Math.round((offer.prices.eur / PAID_WEEKS) * 10) / 10, "eur"),
  ].join(" / ");
  const canBuy = saleState === "open" && offer.salesEnabled;
  const checkoutHref = buildCheckoutHref({ offerId: offer.id, productId: product.id });
  const buyAnalytics = {
    id: "buy_inspiration_hub",
    offer_code: offer.code,
    offer_id: offer.id,
    product_code: product.code,
    product_id: product.id,
  };
  const courseStructuredData = buildCourseStructuredData({
    name: t("hero.titlePlain"),
    description: `${t("hero.description.1")} ${t("hero.description.2")}`,
    path: PATH,
    offers: buildCourseOffersStructuredData({
      landingPath: PATH,
      offer,
      availability: canBuy ? "InStock" : "OutOfStock",
    }),
  });

  return (
    <>
      <StructuredData
        data={[
          buildBreadcrumbStructuredData([
            { name: metadataT("breadcrumbHome"), path: "/" },
            { name: onlineT("hero.title"), path: "/online" },
            { name: t("hero.titlePlain"), path: PATH },
          ]),
          courseStructuredData,
        ]}
      />
      <ProductHero
        components={{ Section: IntroductionSection, TextBox }}
        media={
          <HeroMedia
            boxes={{ MobileImagesBox, ImageBox }}
            photo={{
              asset: HERO_MEDIA.inspirationHub,
              alt: metadataT("pages.inspirationHub.heroImageAlt"),
              mobileSizes: "(max-width: 767px) calc((100vw - 40px) * 0.9), 0px",
              desktopSizes:
                "(max-width: 767px) 0px, (max-width: 920px) 400px, (max-width: 1140px) 550px, 598px",
            }}
          />
        }
      >
        <Title>{t("hero.title")}</Title>
        <Description>
          <DescriptionParagraph>{t("hero.description.1")}</DescriptionParagraph>
          <DescriptionParagraph>{t("hero.description.2")}</DescriptionParagraph>
        </Description>

        <FactsRow>
          <ProductFact label={t("hero.accessLabel")} value={t("hero.accessValue")} />
          <ProductFact label={t("hero.priceLabel")} value={price}>
            <FactNote>{t("hero.perWeek", { price: weeklyPrice })}</FactNote>
          </ProductFact>
        </FactsRow>

        <ButtonBox>
          {canBuy ? (
            <>
              <Button
                buttonText={t("hero.buyButton")}
                href={checkoutHref}
                prefetch={false}
                rel="nofollow"
                analytics={{ ...buyAnalytics, placement: "inspiration_hub_hero" }}
                {...stickyCtaAnchorProps}
              />
              <StickyCta
                analytics={{ ...buyAnalytics, placement: "inspiration_hub_sticky" }}
                label={t("hero.buyButton")}
                href={checkoutHref}
                prefetch={false}
                title={t("hero.titlePlain")}
                note={price}
              />
            </>
          ) : (
            // The notice takes the buy button's place, so the hero keeps its height.
            <ClosedSalesNotice
              text={commonT(
                saleState === "unavailable" ? "salesUnavailable" : "salesClosed",
              )}
            />
          )}
          <Button
            buttonText={t("hero.insideButton")}
            variant="secondary"
            href="#inside"
            analytics={{ id: "view_hub_contents", placement: "inspiration_hub_hero" }}
          />
        </ButtonBox>
      </ProductHero>

      <SpecialWrapper $compactAt={1100} $stacked={false}>
        <SuggestionGrid
          compactBelow={920}
          components={{
            Section: AboutCourseSection,
            Title: AboutCourseTitle,
            Cards: AboutCourseCards,
          }}
          id="inside"
          title={t("about.title")}
          items={getInspirationHubSuggestions((key) => t(key))}
          photo="/images/photos/about_inspiration_hub.webp"
        />
        <StepsSection id="how-it-works">
          <StepsTextBox>
            <StepsTitle>{t("steps.title")}</StepsTitle>
            <ProgramRoadmap namespace="InspirationHubPage.steps" count={STEP_COUNT} />
          </StepsTextBox>
          <StepsImage
            {...imageFadeProps}
            src="/images/inspiration_hub_steps_photo.webp"
            alt={t("steps.imageAlt")}
            width={1050}
            height={1314}
            sizes="(max-width: 920px) 100vw, 473px"
          />
        </StepsSection>
        <Contacts layout="spaced" />
      </SpecialWrapper>
    </>
  );
}
