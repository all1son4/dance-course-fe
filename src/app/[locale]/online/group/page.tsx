import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import CourseCard from "@/components/cards/CourseCard";
import TextContentCard from "@/components/cards/TextContentCard";
import Button from "@/components/common/Button";
import HeroPicture from "@/components/common/HeroPicture";
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
import {
  annaStrokStructuredDataId,
  buildBreadcrumbStructuredData,
  buildPageMetadata,
  normalizedSiteUrl,
  seoTargetLocale,
} from "@/lib/seo";
import { stickyCtaAnchorProps } from "@/lib/sticky-cta";

import SaleGate from "../_shared/sale-gate";
import { buildCourseOffersStructuredData } from "../_shared/structured-data";
import { getGroupSuggestions } from "./constants";
import {
  AboutCourseCards,
  AboutCourseSection,
  AboutCourseTitle,
  ButtonBox,
  ContactSection,
  Date,
  DateBox,
  Description,
  DescriptionParagraph,
  From,
  IconBox,
  ImageBox,
  InfoBoxGroup,
  IntroductionSection,
  MobileImagesBox,
  SpecialWrapper,
  TarifContentBox,
  TariffContentList,
  TariffOptionsBox,
  TariffSection,
  TariffTitle,
  TextBox,
  Title,
  VideoSection,
} from "./page.styles";

export async function generateMetadata(): Promise<Metadata> {
  const metadataT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata",
  });
  const pageT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata.pages.onlineGroup",
  });

  return buildPageMetadata({
    locale: seoTargetLocale,
    path: "/online/group",
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

// The buy buttons follow the admin sales switch, so this page is rendered per
// request instead of being prerendered with a stale answer baked in.
export const dynamic = "force-dynamic";

export default async function OnlineGroupPage() {
  const locale = await getLocale();
  const t = await getTranslations("OnlineGroupPage");
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
    <IntroductionSection>
      <TextBox>
        <Title>{t("hero.title")}</Title>
        <Description>
          <DescriptionParagraph>{t("hero.description.1")}</DescriptionParagraph>
          <DescriptionParagraph>{t("hero.description.2")}</DescriptionParagraph>
        </Description>

        <InfoBoxGroup>
          <DateBox>
            <From>{t("hero.startLabel")}</From>
            <Date>{t("hero.startDate")}</Date>
          </DateBox>
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
                  note={
                    standardOffer ? formatOfferPrice(standardOffer.prices) : undefined
                  }
                />
              ) : null
            }
          </SaleGate>
        </ButtonBox>
      </TextBox>

      <MobileImagesBox>
        <ImageBox id="mobile-only-image-box">
          <HeroPicture
            asset={HERO_MEDIA.online}
            media="(max-width: 767px)"
            sizes="(max-width: 767px) 100vw, 0px"
            priority
          />
        </ImageBox>
        <IconBox id="mobile-only-icon-box">
          <HeroPicture
            asset={HERO_MEDIA.onlineTelegram}
            media="(max-width: 767px)"
            sizes="(max-width: 767px) 65vw, 0px"
          />
        </IconBox>
      </MobileImagesBox>
      <ImageBox id="desktop-only-image-box">
        <HeroPicture
          asset={HERO_MEDIA.online}
          media="(min-width: 768px)"
          sizes="(max-width: 767px) 0px, (max-width: 920px) 400px, (max-width: 1140px) 550px, 598px"
          priority
        />
      </ImageBox>
      <IconBox id="desktop-only-icon-box">
        <HeroPicture
          asset={HERO_MEDIA.onlineTelegram}
          media="(min-width: 768px)"
          sizes="(max-width: 767px) 0px, (max-width: 920px) 250px, (max-width: 1140px) 350px, 453px"
        />
      </IconBox>
    </IntroductionSection>
  );

  const renderTariffSection = (isSaleOpen: boolean) => (
    <TariffSection id="tariffs">
      <TariffTitle>{t("tariffs.title")}</TariffTitle>
      {/* Without this card, closed sales leave the tariff cards buttonless and
          the hero call to action pointing at an empty spot. */}
      {!isSaleOpen && <ClosedSalesNotice text={t("tariffs.closedNotice")} />}
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
                <DateBox>
                  <From>{t("tariffs.priceLabel")}</From>
                  <Date>{formatOfferPrice(standardOffer.prices)}</Date>
                </DateBox>
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
                <DateBox>
                  <From>{t("tariffs.priceLabel")}</From>
                  <Date>{formatOfferPrice(plusOffer.prices)}</Date>
                </DateBox>
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

      <SpecialWrapper>
        <VideoSection>
          <VideoPlayer
            src="/videos/online_example.mp4"
            playLabel={t("hero.playLabel")}
            poster="/images/online_example_poster.webp"
            radius="0px"
          />
        </VideoSection>
        {/* Streams in behind the shell; see SaleGate for why there is no fallback. */}
        <SaleGate productId={product.id}>
          {(isSaleOpen) => renderTariffSection(isSaleOpen)}
        </SaleGate>
        <AboutCourseSection id="course-program">
          <AboutCourseTitle>{t("about.title")}</AboutCourseTitle>
          <AboutCourseCards>
            {onlineSuggestions.map(({ id, ...suggestion }) => (
              <TextContentCard key={id} {...suggestion} />
            ))}
          </AboutCourseCards>
        </AboutCourseSection>
        <ContactSection>
          <Contacts bgColor="rgba(200, 204, 210, 0.4)" />
        </ContactSection>
      </SpecialWrapper>
    </>
  );
}
