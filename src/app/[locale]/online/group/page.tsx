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
import {
  annaStrokStructuredDataId,
  buildBreadcrumbStructuredData,
  normalizedSiteUrl,
} from "@/lib/seo";
import { stickyCtaAnchorProps } from "@/lib/sticky-cta";

import ProductFact from "../_shared/product-fact";
import ProductHero from "../_shared/product-hero";
import SaleGate from "../_shared/sale-gate";
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
  const locale = await getLocale();
  const t = await getTranslations("OnlineGroupPage");
  const commonT = await getTranslations("Common");
  const onlineSuggestions = getGroupSuggestions((key) => t(key));
  const product = SELLABLE_PRODUCTS["online-group-anna-strok"];
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
          {...stickyCtaAnchorProps}
        />
        {/* Only while there is something to buy: a floating "choose a plan"
              pointing at a closed tariff section would be noise. */}
        <SaleGate productId={product.id}>
          {(isSaleOpen) =>
            isSaleOpen ? (
              <StickyCta
                label={t("tariffs.selectButton")}
                href="#tariffs"
                title={t("hero.titlePlain")}
                note={standardOffer ? formatOfferPrice(standardOffer.prices) : undefined}
              />
            ) : null
          }
        </SaleGate>
      </ButtonBox>
    </ProductHero>
  );

  const renderTariffSection = (isSaleOpen: boolean) => (
    <TariffSection id="tariffs">
      <TariffTitle>{t("tariffs.title")}</TariffTitle>
      {/* Without this card, closed sales leave the tariff cards buttonless and
          the hero call to action pointing at an empty spot. */}
      {!isSaleOpen && <ClosedSalesNotice text={commonT("salesClosed")} />}
      <TariffOptionsBox>
        {standardOffer ? (
          <CourseCard
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
            buttonText={isSaleOpen ? t("tariffs.buyButton") : undefined}
            buttonRel="nofollow"
            buttonIsStickyAnchor
            buttonHref={
              isSaleOpen
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
            buttonText={isSaleOpen ? t("tariffs.buyButton") : undefined}
            buttonRel="nofollow"
            buttonIsStickyAnchor
            buttonHref={
              isSaleOpen
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
            src="/videos/online_example.mp4"
            poster="/images/online_example_poster.webp"
            radius="0px"
          />
        </VideoSection>
        {/* Streams in behind the shell; see SaleGate for why there is no fallback. */}
        <SaleGate productId={product.id}>
          {(isSaleOpen) => renderTariffSection(isSaleOpen)}
        </SaleGate>
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
