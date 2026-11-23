import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import Button from "@/components/common/Button";
import {
  formatOfferPrice,
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  LOVE_ME_IN_THE_MORNING_OFFER_ID,
} from "@/constants/sellable-products";
import {
  BLACK_FRIDAY_ENDS_AT,
  getCampaignSavings,
  isBlackFridayActive,
} from "@/lib/black-friday";
import { getStorefrontSellableProducts } from "@/lib/sales-availability";

import {
  CountdownBox,
  Eyebrow,
  Intro,
  Lead,
  OfferAction,
  OfferBadge,
  OfferCard,
  OfferDescription,
  OfferFooter,
  OfferPrice,
  OfferPriceNote,
  Offers,
  OfferSavings,
  OfferText,
  OfferTitle,
  Section,
  Terms,
  Title,
  TitleWrap,
} from "./BlackFriday.styles";
import BlackFridayCountdown from "./BlackFridayCountdown";
import {
  CampaignReveal,
  CampaignStamp,
  PriceDrop,
  StrikeDraw,
} from "./BlackFridayMotion";
import BlackFridaySpotlight from "./BlackFridaySpotlight";

export const BLACK_FRIDAY_SECTION_ID = "black-friday";

/**
 * The Black Friday block on the home page, right after the first screen. Rendered
 * per request: outside the campaign window it is simply absent. Prices come from
 * the same storefront catalogue the product pages use.
 */
export default async function BlackFridaySection() {
  await connection();
  const now = new Date();

  if (!isBlackFridayActive(now)) return null;

  const [t, products] = await Promise.all([
    getTranslations("BlackFriday"),
    getStorefrontSellableProducts(),
  ]);
  const offers = products.flatMap((product) => product.offers);
  const choreo = offers.find((offer) => offer.id === LOVE_ME_IN_THE_MORNING_OFFER_ID);
  const hub = offers.find((offer) => offer.id === INSPIRATION_HUB_ACCESS_OFFER_ID);
  const choreoSavings = choreo ? getCampaignSavings(choreo) : null;

  return (
    <Section id={BLACK_FRIDAY_SECTION_ID} aria-labelledby="black-friday-title">
      <BlackFridaySpotlight />
      <Intro>
        <Eyebrow>{t("section.eyebrow")}</Eyebrow>
        <TitleWrap>
          <Title id="black-friday-title">
            {t("section.titleTop")} <span>{t("section.titleBottom")}</span>
          </Title>
          <CampaignStamp>
            <b>{t("choreo.badge")}</b>
            <small>{t("hub.badge")} HUB</small>
          </CampaignStamp>
        </TitleWrap>
        <Lead>{t("section.lead")}</Lead>
        <CountdownBox>
          <BlackFridayCountdown
            caption={t("countdown.label")}
            finalLabel={t("countdown.finalLabel")}
            endsAt={BLACK_FRIDAY_ENDS_AT.toISOString()}
            label={t("countdown.label")}
            labels={{
              days: t("countdown.days"),
              hours: t("countdown.hours"),
              minutes: t("countdown.minutes"),
              seconds: t("countdown.seconds"),
            }}
            serverNow={now.getTime()}
            variant="tiles"
          />
        </CountdownBox>
        <Terms>{t("section.terms")}</Terms>
      </Intro>

      <Offers>
        <OfferCard>
          <OfferText>
            <OfferBadge>{t("choreo.badge")}</OfferBadge>
            <OfferTitle>{t("choreo.title")}</OfferTitle>
            <OfferDescription>{t("choreo.description")}</OfferDescription>
          </OfferText>
          <OfferFooter>
            {choreo ? (
              <OfferPrice>
                {choreo.compareAtPrices ? (
                  <OfferPriceNote>
                    <span>{t("choreo.regularPrice")}</span>
                    <StrikeDraw>{formatOfferPrice(choreo.compareAtPrices)}</StrikeDraw>
                  </OfferPriceNote>
                ) : null}
                <strong>
                  {choreo.compareAtPrices ? (
                    <PriceDrop from={choreo.compareAtPrices} to={choreo.prices} />
                  ) : (
                    formatOfferPrice(choreo.prices)
                  )}
                </strong>
                {choreoSavings ? (
                  <OfferSavings>
                    <CampaignReveal>
                      {t("choreo.savings", { amount: formatOfferPrice(choreoSavings) })}
                    </CampaignReveal>
                  </OfferSavings>
                ) : null}
              </OfferPrice>
            ) : null}
            <OfferAction>
              <Button
                variant="white"
                size="sm"
                buttonText={t("choreo.cta")}
                href="/online/choreo"
                analytics={{ id: "black_friday_choreo", placement: "home_black_friday" }}
              />
            </OfferAction>
          </OfferFooter>
        </OfferCard>

        <OfferCard>
          <OfferText>
            <OfferBadge>{t("hub.badge")}</OfferBadge>
            <OfferTitle>{t("hub.title")}</OfferTitle>
            <OfferDescription>
              {t("hub.description")} {t("hub.shortCohortNote")}
            </OfferDescription>
          </OfferText>
          <OfferFooter>
            {hub ? (
              <OfferPrice>
                <OfferPriceNote>
                  <span>{t("hub.priceLabel")}</span>
                  <StrikeDraw>{t("hub.regularTerm")}</StrikeDraw>
                </OfferPriceNote>
                <strong>{formatOfferPrice(hub.prices)}</strong>
                <OfferSavings>
                  <CampaignReveal>{t("hub.gift")}</CampaignReveal>
                </OfferSavings>
              </OfferPrice>
            ) : null}
            <OfferAction>
              <Button
                variant="white"
                size="sm"
                buttonText={t("hub.cta")}
                href="/online/inspiration-hub"
                analytics={{ id: "black_friday_hub", placement: "home_black_friday" }}
              />
            </OfferAction>
          </OfferFooter>
        </OfferCard>
      </Offers>
    </Section>
  );
}
