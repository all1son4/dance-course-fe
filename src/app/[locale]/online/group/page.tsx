import { getLocale, getTranslations } from "next-intl/server";

import HeroMedia from "@/app/[locale]/_shared/hero-media";
import CourseCard from "@/components/cards/CourseCard";
import Button from "@/components/common/Button";
import StructuredData from "@/components/common/StructuredData";
import ClosedSalesNotice from "@/components/other/ClosedSalesNotice";
import Contacts from "@/components/other/Contacts";
import StickyCta from "@/components/other/StickyCta";
import VideoPlayer from "@/components/other/VideoPlayer";
import { HERO_MEDIA } from "@/constants/hero-media";
import {
  buildCheckoutHref,
  formatOfferPrice,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { buildLocalizedPageMetadata } from "@/lib/page-metadata";
import { getProductSaleState } from "@/lib/sales-availability";
import {
  annaStrokStructuredDataId,
  buildBreadcrumbStructuredData,
  normalizedSiteUrl,
} from "@/lib/seo";
import { stickyCtaAnchorProps } from "@/lib/sticky-cta";

import ProductFact from "../_shared/product-fact";
import ProductHero from "../_shared/product-hero";
import {
  AboutCourseCards,
  AboutCourseTitle,
  Description,
  DescriptionParagraph,
  InfoBoxGroup,
  SpecialWrapper,
  VideoSection,
} from "../_shared/section.styles";
import { buildCourseOffersStructuredData } from "../_shared/structured-data";
import SuggestionGrid from "../_shared/suggestion-grid";
import { getGroupSuggestions } from "./constants";
import {
  AboutCourseSection,
  ButtonBox,
  IconBox,
  ImageBox,
  IntroductionSection,
  MobileImagesBox,
  TarifContentBox,
  TariffContentList,
  TariffOptionsBox,
  TariffSection,
  TariffTitle,
  TextBox,
  Title,
} from "./page.styles";

export const generateMetadata = () =>
  buildLocalizedPageMetadata({ pageKey: "onlineGroup", path: "/online/group" });

// The buy buttons follow the admin sales switch, so this page is rendered per
// request instead of being prerendered with a stale answer baked in.
export const dynamic = "force-dynamic";

export default async function OnlineGroupPage() {
  const product = SELLABLE_PRODUCTS["online-group-anna-strok"];
  const [locale, t, commonT, saleState] = await Promise.all([
    getLocale(),
    getTranslations("OnlineGroupPage"),
    getTranslations("Common"),
    getProductSaleState(product.id),
  ]);
  const onlineSuggestions = getGroupSuggestions((key) => t(key));
  const purchaseOffers = product.offers.filter(
    (offer) => offer.code === "standard" || offer.code === "library-access",
  );
  const standardOffer = product.offers.find((offer) => offer.code === "standard");
  const plusOffer = product.offers.find((offer) => offer.code === "library-access");
  const courseStructuredData = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: t("hero.titlePlain"),
    description: `${t("hero.description.1")} ${t("hero.description.2")}`,
    inLanguage: locale,
    provider: {
      "@type": "Person",
      "@id": annaStrokStructuredDataId,
      name: "Anna Strok",
      url: normalizedSiteUrl,
    },
    url: `${normalizedSiteUrl}/online/group`,
    offers: purchaseOffers.flatMap((offer) =>
      buildCourseOffersStructuredData({
        landingPath: "/online/group#tariffs",
        offer,
        offerName:
          offer.code === "standard"
            ? t("tariffs.standard.title")
            : t("tariffs.plus.title"),
      }),
    ),
  };

  const renderIntroductionSection = () => (
    <ProductHero
      components={{ Section: IntroductionSection, TextBox }}
      media={
        <HeroMedia
          boxes={{ MobileImagesBox, ImageBox, IconBox }}
          photo={{
            asset: HERO_MEDIA.online,
            mobileSizes: "(max-width: 767px) 100vw, 0px",
            desktopSizes:
              "(max-width: 767px) 0px, (max-width: 920px) 400px, (max-width: 1140px) 550px, 598px",
          }}
          icon={{
            asset: HERO_MEDIA.onlineTelegram,
            mobileSizes: "(max-width: 767px) 65vw, 0px",
            desktopSizes:
              "(max-width: 767px) 0px, (max-width: 920px) 250px, (max-width: 1140px) 350px, 453px",
          }}
        />
      }
    >
      <Title>{t("hero.title")}</Title>
      <Description>
        <DescriptionParagraph>{t("hero.description.1")}</DescriptionParagraph>
        <DescriptionParagraph>{t("hero.description.2")}</DescriptionParagraph>
      </Description>

      <InfoBoxGroup>
        <ProductFact label={t("hero.startLabel")} value={t("hero.startDate")} />
      </InfoBoxGroup>

      <ButtonBox>
        <Button
          buttonText={t("tariffs.selectButton")}
          href="#tariffs"
          analytics={{ id: "select_tariff", placement: "online_group_hero" }}
          {...stickyCtaAnchorProps}
        />
        {saleState === "open" ? (
          <StickyCta
            analytics={{ id: "select_tariff", placement: "online_group_sticky" }}
            label={t("tariffs.selectButton")}
            href="#tariffs"
            title={t("hero.titlePlain")}
            note={standardOffer ? formatOfferPrice(standardOffer.prices) : undefined}
          />
        ) : null}
      </ButtonBox>
    </ProductHero>
  );

  const renderTariffSection = () => (
    <TariffSection id="tariffs">
      <TariffTitle>{t("tariffs.title")}</TariffTitle>
      {saleState === "open" ? null : (
        <ClosedSalesNotice
          text={
            saleState === "closed" ? commonT("salesClosed") : commonT("salesUnavailable")
          }
        />
      )}
      <TariffOptionsBox>
        {standardOffer ? (
          <CourseCard
            analyticsId={`${product.code}:${standardOffer.code}`}
            title={t("tariffs.standard.title")}
            subtitle={t("tariffs.standard.subtitle")}
            cardContent={
              <TarifContentBox>
                <TariffContentList>
                  <li>{t("tariffs.standard.features.1")}</li>
                  <li>{t("tariffs.standard.features.2")}</li>
                  <li>{t("tariffs.standard.features.3")}</li>
                  <li>{t("tariffs.standard.features.4")}</li>
                  <li>{t("tariffs.standard.features.5")}</li>
                  <li>{t("tariffs.standard.features.6")}</li>
                </TariffContentList>
                <ProductFact
                  label={t("tariffs.priceLabel")}
                  value={formatOfferPrice(standardOffer.prices)}
                />
              </TarifContentBox>
            }
            buttonText={saleState === "open" ? t("tariffs.buyButton") : undefined}
            buttonAnalytics={{
              id: "buy_online_group",
              offer_code: standardOffer.code,
              offer_id: standardOffer.id,
              placement: "tariff_standard",
              product_code: product.code,
              product_id: product.id,
            }}
            buttonPrefetch={false}
            buttonRel="nofollow"
            buttonIsStickyAnchor
            buttonHref={
              saleState === "open"
                ? buildCheckoutHref({
                    offerId: standardOffer.id,
                    productId: product.id,
                  })
                : undefined
            }
          />
        ) : null}
        {plusOffer ? (
          <CourseCard
            analyticsId={`${product.code}:${plusOffer.code}`}
            title={t("tariffs.plus.title")}
            subtitle={t("tariffs.plus.subtitle")}
            cardContent={
              <TarifContentBox>
                <TariffContentList>
                  <li>{t("tariffs.plus.features.1")}</li>
                  <li>{t("tariffs.plus.features.2")}</li>
                  <li>{t("tariffs.plus.features.3")}</li>
                  <li>{t("tariffs.plus.features.4")}</li>
                  <li>{t("tariffs.plus.features.5")}</li>
                  <li>{t("tariffs.plus.features.6")}</li>
                  <li>{t("tariffs.plus.features.7")}</li>
                  <li>{t("tariffs.plus.features.8")}</li>
                  <li>{t("tariffs.plus.features.9")}</li>
                  <li>{t("tariffs.plus.features.10")}</li>
                </TariffContentList>
                <ProductFact
                  label={t("tariffs.priceLabel")}
                  value={formatOfferPrice(plusOffer.prices)}
                />
              </TarifContentBox>
            }
            buttonText={saleState === "open" ? t("tariffs.buyButton") : undefined}
            buttonAnalytics={{
              id: "buy_online_group",
              offer_code: plusOffer.code,
              offer_id: plusOffer.id,
              placement: "tariff_plus",
              product_code: product.code,
              product_id: product.id,
            }}
            buttonPrefetch={false}
            buttonRel="nofollow"
            buttonIsStickyAnchor
            buttonHref={
              saleState === "open"
                ? buildCheckoutHref({
                    offerId: plusOffer.id,
                    productId: product.id,
                  })
                : undefined
            }
          />
        ) : null}
      </TariffOptionsBox>
    </TariffSection>
  );

  return (
    <>
      <StructuredData
        data={[
          buildBreadcrumbStructuredData([
            { name: "Home", path: "/" },
            { name: "Online classes", path: "/online" },
            {
              name: t("hero.titlePlain"),
              path: "/online/group",
            },
          ]),
          courseStructuredData,
        ]}
      />
      {renderIntroductionSection()}

      <SpecialWrapper $compactAt={1100} $stacked={false}>
        <VideoSection>
          <VideoPlayer
            analyticsId="online-group-example"
            src="/videos/online_example.mp4"
            poster="/images/online_example_poster.webp"
            radius="0px"
          />
        </VideoSection>
        {renderTariffSection()}
        <SuggestionGrid
          components={{
            Section: AboutCourseSection,
            Title: AboutCourseTitle,
            Cards: AboutCourseCards,
          }}
          id="course-program"
          title={t("about.title")}
          items={onlineSuggestions}
        />
        <Contacts layout="spaced" />
      </SpecialWrapper>
    </>
  );
}
