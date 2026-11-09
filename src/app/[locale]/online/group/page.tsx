import { getTranslations } from "next-intl/server";

import HeroMedia from "@/app/[locale]/_shared/hero-media";
import CourseCard from "@/components/cards/CourseCard";
import Button from "@/components/common/Button";
import StructuredData from "@/components/common/StructuredData";
import Contacts from "@/components/other/Contacts";
import StickyCta from "@/components/other/StickyCta";
import VideoPlayer from "@/components/other/VideoPlayer";
import { HERO_MEDIA } from "@/constants/hero-media";
import { ONLINE_GROUP_REGISTRATION_FORM_VIEW_URL } from "@/constants/links";
import {
  buildCheckoutHref,
  formatOfferPrice,
  SELLABLE_PRODUCTS,
  type SellableProductOffer,
} from "@/constants/sellable-products";
import { buildLocalizedPageMetadata } from "@/lib/page-metadata";
import { getOpenPublicProductOffers } from "@/lib/public-sales";
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
  InfoBoxGroup,
  SpecialWrapper,
  VideoSection,
} from "../_shared/section.styles";
import {
  buildCourseOffersStructuredData,
  buildCourseStructuredData,
} from "../_shared/structured-data";
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
  TariffIncludes,
  TariffSection,
  TariffTitle,
  TextBox,
  Title,
} from "./page.styles";
import TariffTabs from "./tariff-tabs";

export const generateMetadata = () =>
  buildLocalizedPageMetadata({ pageKey: "onlineGroup", path: "/online/group" });

// The buy buttons follow the admin sales switch, so this page is rendered per
// request instead of being prerendered with a stale answer baked in.
export const dynamic = "force-dynamic";

export default async function OnlineGroupPage() {
  const configuredProduct = SELLABLE_PRODUCTS["online-group-anna-strok"];
  // The tariff section carries the #tariffs anchor the hero button and deep
  // links point at, so the sales switch is read before anything renders.
  // Streamed in behind the shell (see SaleStateGate) the whole section landed
  // 150-300ms after the page on Vercel: everything below it jumped down,
  // "Choose a plan" was a dead click until then and /online/group#tariffs
  // missed its target.
  const [t, metadataT, onlineT, saleState, catalogProducts] = await Promise.all([
    getTranslations("OnlineGroupPage"),
    getTranslations("Metadata"),
    getTranslations("OnlinePage"),
    getProductSaleState(configuredProduct.id),
    getStorefrontSellableProducts(),
  ]);
  const product =
    catalogProducts.find((candidate) => candidate.id === configuredProduct.id) ??
    configuredProduct;
  const availableOffers = getOpenPublicProductOffers(product);
  const onlineSuggestions = getGroupSuggestions((key) => t(key));
  const purchaseOffers = product.offers.filter(
    (offer) => offer.code === "standard" || offer.code === "library-access",
  );
  const standardOffer = product.offers.find((offer) => offer.code === "standard");
  const plusOffer = product.offers.find((offer) => offer.code === "library-access");
  // A plan that cannot be bought right now takes sign-ups through the
  // stream's Google Form instead, so every card always has an action.
  const getTariffAction = (offer: SellableProductOffer, placement: string) =>
    saleState === "open" && offer.salesEnabled
      ? {
          buttonText: t("tariffs.buyButton"),
          buttonHref: buildCheckoutHref({ offerId: offer.id, productId: product.id }),
          buttonAnalytics: {
            id: "buy_online_group",
            offer_code: offer.code,
            offer_id: offer.id,
            placement,
            product_code: product.code,
            product_id: product.id,
          },
          buttonPrefetch: false,
          buttonRel: "nofollow",
        }
      : {
          buttonText: t("tariffs.signUpButton"),
          buttonHref: ONLINE_GROUP_REGISTRATION_FORM_VIEW_URL,
          buttonAnalytics: {
            id: "online_group_signup_form",
            offer_code: offer.code,
            offer_id: offer.id,
            placement,
            product_code: product.code,
            product_id: product.id,
          },
          buttonRel: "noopener noreferrer",
          buttonTarget: "_blank",
        };
  const courseStructuredData = buildCourseStructuredData({
    name: t("hero.titlePlain"),
    description: `${t("hero.description.1")} ${t("hero.description.2")}`,
    path: "/online/group",
    offers: purchaseOffers.flatMap((offer) =>
      buildCourseOffersStructuredData({
        landingPath: "/online/group#tariffs",
        offer,
        availability:
          saleState === "open" && offer.salesEnabled ? "InStock" : "OutOfStock",
        offerName:
          offer.code === "standard"
            ? t("tariffs.standard.title")
            : t("tariffs.plus.title"),
      }),
    ),
  });

  const renderIntroductionSection = () => (
    <ProductHero
      components={{ Section: IntroductionSection, TextBox }}
      media={
        <HeroMedia
          boxes={{ MobileImagesBox, ImageBox, IconBox }}
          photo={{
            asset: HERO_MEDIA.online,
            alt: metadataT("pages.online.heroImageAlt"),
            mobileSizes: "(max-width: 767px) calc((100vw - 40px) * 0.9), 0px",
            desktopSizes:
              "(max-width: 767px) 0px, (max-width: 920px) 400px, (max-width: 1140px) 550px, 598px",
          }}
          icon={{
            asset: HERO_MEDIA.onlineTelegram,
            mobileSizes: "(max-width: 767px) calc((100vw - 40px) * 0.5), 0px",
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

      {/* Every plan card always carries an action (buy, or sign up through
        the form while sales are closed), so "choose a plan" always leads somewhere. */}
      <ButtonBox>
        <Button
          buttonText={t("tariffs.selectButton")}
          href="#tariffs"
          analytics={{ id: "select_tariff", placement: "online_group_hero" }}
          {...stickyCtaAnchorProps}
        />
        <StickyCta
          analytics={{ id: "select_tariff", placement: "online_group_sticky" }}
          label={t("tariffs.selectButton")}
          href="#tariffs"
          // The bar has ~105px for the name on a 320px phone: the full
          // "Онлайн-группа by Anna Strok" needs three lines there.
          title={t("hero.stickyTitle")}
          note={
            availableOffers[0] ? formatOfferPrice(availableOffers[0].prices) : undefined
          }
        />
      </ButtonBox>
    </ProductHero>
  );

  const renderTariffSection = () => (
    // The whole tariff section is a sticky-CTA anchor: while any part of it
    // is on screen the floating "Choose a plan" bar has nothing to add (on
    // phones the visible card's button may be off to the side of the track).
    <TariffSection id="tariffs" {...stickyCtaAnchorProps}>
      <TariffTitle>{t("tariffs.title")}</TariffTitle>
      <TariffTabs
        ariaLabel={t("tariffs.switchLabel")}
        tabs={[
          ...(standardOffer
            ? [
                {
                  key: "standard",
                  label: t("tariffs.standard.title"),
                  note: formatOfferPrice(standardOffer.prices),
                  panel: (
                    <CourseCard
                      analyticsId={`${product.code}:${standardOffer.code}`}
                      surface="raised"
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
                      {...getTariffAction(standardOffer, "tariff_standard")}
                      buttonIsStickyAnchor
                    />
                  ),
                },
              ]
            : []),
          ...(plusOffer
            ? [
                {
                  key: "plus",
                  label: t("tariffs.plus.title"),
                  note: formatOfferPrice(plusOffer.prices),
                  badge: t("tariffs.popular"),
                  panel: (
                    <CourseCard
                      analyticsId={`${product.code}:${plusOffer.code}`}
                      surface="raised"
                      title={t("tariffs.plus.title")}
                      subtitle={t("tariffs.plus.subtitle")}
                      cardContent={
                        <TarifContentBox>
                          {/* Features 1-5 of Plus repeat Standard word for word. */}
                          <TariffIncludes>
                            {t("tariffs.plus.includesStandard")}
                          </TariffIncludes>
                          <TariffContentList>
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
                      {...getTariffAction(plusOffer, "tariff_plus")}
                      buttonIsStickyAnchor
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
    </TariffSection>
  );

  return (
    <>
      <StructuredData
        data={[
          buildBreadcrumbStructuredData([
            { name: metadataT("breadcrumbHome"), path: "/" },
            { name: onlineT("hero.title"), path: "/online" },
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
            posterColor="#6d6266"
            radius="0px"
          />
        </VideoSection>
        {renderTariffSection()}
        <SuggestionGrid
          compactBelow={920}
          components={{
            Section: AboutCourseSection,
            Title: AboutCourseTitle,
            Cards: AboutCourseCards,
          }}
          id="course-program"
          title={t("about.title")}
          items={onlineSuggestions}
          photo="/images/photos/about_online_group.webp"
        />
        <Contacts layout="spaced" />
      </SpecialWrapper>
    </>
  );
}
