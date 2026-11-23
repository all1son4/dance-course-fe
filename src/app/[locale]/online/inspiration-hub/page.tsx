import Image from "next/image";
import { getTranslations } from "next-intl/server";

import HeroMedia from "@/app/[locale]/_shared/hero-media";
import Button from "@/components/common/Button";
import StructuredData from "@/components/common/StructuredData";
import { CampaignBadge } from "@/components/other/BlackFriday";
import ClosedSalesNotice from "@/components/other/ClosedSalesNotice";
import Contacts from "@/components/other/Contacts";
import ProgramRoadmap from "@/components/other/ProgramRoadmap";
import StickyCta from "@/components/other/StickyCta";
import { HERO_MEDIA } from "@/constants/hero-media";
import {
  buildCheckoutHref,
  formatOfferPrice,
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { isBlackFridayOffer } from "@/lib/black-friday";
import { buildLocalizedPageMetadata } from "@/lib/page-metadata";
import { imageFadeProps } from "@/lib/reveal";
import {
  getProductSaleState,
  getStorefrontSellableProducts,
} from "@/lib/sales-availability";
import { buildBreadcrumbStructuredData } from "@/lib/seo";
import { stickyCtaAnchorProps } from "@/lib/sticky-cta";

import {
  CampaignAccent,
  CampaignFactRegular,
} from "../../_shared/interactive-card-content";
import ProductFact from "../_shared/product-fact";
import ProductHero from "../_shared/product-hero";
import {
  Description,
  DescriptionParagraph,
  SpecialWrapper,
} from "../_shared/section.styles";
import {
  buildCourseOffersStructuredData,
  buildCourseStructuredData,
} from "../_shared/structured-data";
import { HUB_FEATURES, HUB_TOPIC_COUNT, HUB_VALUE_COUNT } from "./constants";
import {
  FeatureRow,
  FinalCta,
  FinalCtaOffer,
  FinalCtaText,
  LibraryPhoto,
  LibrarySection,
  LibraryText,
  OfferClosed,
  OfferNotes,
  OfferPrice,
  StatementBand,
  TopicGrid,
  TopicsLabel,
  TopicsNote,
  ValueList,
} from "./hub-blocks.styles";
import {
  ButtonBox,
  CampaignBadgeRow,
  CampaignNote,
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
const STEP_COUNT = 5;

export const generateMetadata = () =>
  buildLocalizedPageMetadata({ pageKey: "inspirationHub", path: PATH });

// The buy button follows the admin sales switch, so the page is rendered per request.
export const dynamic = "force-dynamic";

export default async function InspirationHubPage() {
  const configuredProduct = SELLABLE_PRODUCTS["inspiration-hub"];
  // The buy button sits in the first viewport, so the sales state is read before
  // rendering instead of streaming in behind the shell in a Suspense boundary.
  const [t, metadataT, onlineT, commonT, blackFridayT, saleState, catalogProducts] =
    await Promise.all([
      getTranslations("InspirationHubPage"),
      getTranslations("Metadata"),
      getTranslations("OnlinePage"),
      getTranslations("Common"),
      getTranslations("BlackFriday"),
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
  const canBuy = saleState === "open" && offer.salesEnabled;
  // Black Friday 2026: the full price buys 16 weeks instead of 8.
  const isCampaign = canBuy && isBlackFridayOffer(offer);
  const buyLabel = isCampaign ? blackFridayT("hub.cta") : t("hero.buyButton");
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
    description: t("hero.lead"),
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
        {isCampaign ? (
          <CampaignBadgeRow>
            <CampaignBadge>
              {blackFridayT("ribbon.title")}
              <b>{blackFridayT("hub.badge")}</b>
            </CampaignBadge>
          </CampaignBadgeRow>
        ) : null}
        <Title>{t("hero.title")}</Title>
        <Description>
          <DescriptionParagraph>{t("hero.lead")}</DescriptionParagraph>
        </Description>

        <FactsRow>
          <ProductFact
            label={t("hero.accessLabel")}
            value={
              isCampaign ? (
                <>
                  <CampaignAccent>{blackFridayT("hubPage.accessValue")}</CampaignAccent>{" "}
                  <CampaignFactRegular>
                    {blackFridayT("hubPage.regularAccess")}
                  </CampaignFactRegular>
                </>
              ) : (
                t("hero.accessValue")
              )
            }
          />
          <ProductFact label={t("hero.priceLabel")} value={price} />
        </FactsRow>
        {isCampaign ? (
          <CampaignNote>
            <strong>{blackFridayT("hubPage.badge")}.</strong>{" "}
            {blackFridayT("hubPage.note")} {blackFridayT("hub.cohortNote")}
          </CampaignNote>
        ) : null}

        <ButtonBox>
          {canBuy ? (
            <>
              <Button
                buttonText={buyLabel}
                href={checkoutHref}
                prefetch={false}
                rel="nofollow"
                analytics={{ ...buyAnalytics, placement: "inspiration_hub_hero" }}
                {...stickyCtaAnchorProps}
              />
              <StickyCta
                analytics={{ ...buyAnalytics, placement: "inspiration_hub_sticky" }}
                label={buyLabel}
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
        <LibrarySection id="inside" aria-labelledby="hub-inside-title">
          <LibraryText>
            <h2 id="hub-inside-title">{t("inside.title")}</h2>
            <p>{t("inside.lead")}</p>
            <TopicsLabel>{t("inside.topicsLabel")}</TopicsLabel>
            <TopicsNote>{t("inside.topicsNote")}</TopicsNote>
            <TopicGrid>
              {Array.from({ length: HUB_TOPIC_COUNT }, (_, index) => (
                <li key={index}>{t(`inside.topics.${index + 1}`)}</li>
              ))}
            </TopicGrid>
          </LibraryText>
          <LibraryPhoto
            {...imageFadeProps}
            src="/images/photos/about_inspiration_hub.webp"
            alt=""
            width={1000}
            height={1250}
            sizes="(max-width: 1240px) 0px, 420px"
          />
          <FeatureRow>
            {HUB_FEATURES.map(({ highlight, icon: Icon, id }, index) => (
              <li key={id} data-highlight={highlight || undefined}>
                <Icon />
                <div>
                  <strong>{t(`inside.features.${index + 1}.title`)}</strong>
                  <p>
                    {t.rich(`inside.features.${index + 1}.text`, {
                      b: (chunks) => <b>{chunks}</b>,
                    })}
                  </p>
                </div>
              </li>
            ))}
          </FeatureRow>
        </LibrarySection>

        <StatementBand>
          <Image
            src="/images/photos/card_inspiration_hub.webp"
            alt={metadataT("pages.inspirationHub.heroImageAlt")}
            fill
            sizes="(max-width: 880px) 100vw, 1240px"
          />
          <figcaption>
            <blockquote>{t("statement.text")}</blockquote>
            <cite>{t("statement.caption")}</cite>
          </figcaption>
        </StatementBand>

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
        {/* The closing offer is a buy block of its own: the sticky bar steps aside while it is on screen. */}
        <FinalCta aria-labelledby="hub-cta-title" {...stickyCtaAnchorProps}>
          <FinalCtaText>
            <h2 id="hub-cta-title">{t("cta.title")}</h2>
            <p>{t("cta.text")}</p>
            <ValueList>
              {Array.from({ length: HUB_VALUE_COUNT }, (_, index) => (
                <li key={index}>{t(`cta.items.${index + 1}`)}</li>
              ))}
            </ValueList>
          </FinalCtaText>
          <FinalCtaOffer>
            <OfferPrice>
              <small>
                {isCampaign ? blackFridayT("hubPage.priceLabel") : t("cta.priceLabel")}
              </small>
              <strong>{price}</strong>
            </OfferPrice>
            {canBuy ? (
              <Button
                buttonText={buyLabel}
                href={checkoutHref}
                prefetch={false}
                rel="nofollow"
                variant="white"
                analytics={{ ...buyAnalytics, placement: "inspiration_hub_final" }}
              />
            ) : (
              <OfferClosed>
                {commonT(
                  saleState === "unavailable" ? "salesUnavailable" : "salesClosed",
                )}
              </OfferClosed>
            )}
            <OfferNotes>
              {isCampaign ? <li data-accent>{blackFridayT("hub.gift")}</li> : null}
              {isCampaign ? <li>{blackFridayT("hub.cohortNote")}</li> : null}
              <li>{t("cta.notes.1")}</li>
              <li data-accent>{t("cta.notes.2")}</li>
            </OfferNotes>
          </FinalCtaOffer>
        </FinalCta>
        <Contacts layout="spaced" />
      </SpecialWrapper>
    </>
  );
}
