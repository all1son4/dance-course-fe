import { getTranslations } from "next-intl/server";

import IconTextCard from "@/components/cards/IconTextCard";
import Button from "@/components/common/Button";
import ClosedSalesNotice from "@/components/other/ClosedSalesNotice";
import RefreshButton from "@/components/other/ClosedSalesNotice/RefreshButton";
import Contacts from "@/components/other/Contacts";
import StickyCta from "@/components/other/StickyCta";
import VideoPlayer from "@/components/other/VideoPlayer";
import { BIRTHDAY_DROP_PRODUCT_ID } from "@/constants/sellable-products";
import { getProductSaleState } from "@/lib/sales-availability";
import { stickyCtaAnchorProps } from "@/lib/sticky-cta";
import { Birthday34Badge } from "@/svg";

import { createRichText } from "../_shared/content";
import {
  AboutChoreoCards,
  AboutChoreoSection,
  AboutChoreoTitle,
  SpecialWrapper,
} from "../_shared/section.styles";
import { BIRTHDAY_ABOUT_SECTION_ID, BIRTHDAY_DROP_VIDEO_SRC } from "./constants";
import { getBirthdayDropCheckout, getBirthdaySuggestions } from "./constants";
import {
  AbsoluteIconBox,
  BirthdayBlock,
  BirthdayContentButtons,
  BirthdayTextContent,
  BirthdayTextContentDescription,
  BirthdayTextContentTitle,
  BirthdayVideoContent,
} from "./page.styles";

/** The offer itself, then what it includes, then contacts. */
export default async function BirthdayDropSection() {
  // The buy button sits in the first viewport, so the sales switch is read
  // before anything renders. Streamed in behind the shell (see SaleStateGate)
  // it landed 150-300ms after the hero on Vercel and shoved "Learn more"
  // aside when it arrived - a missing button, as far as a visitor can tell.
  const [t, commonT, saleState] = await Promise.all([
    getTranslations("BirthdayDropPage"),
    getTranslations("Common"),
    getProductSaleState(BIRTHDAY_DROP_PRODUCT_ID),
  ]);
  const richText = createRichText(t);
  const checkout = getBirthdayDropCheckout();
  const suggestions = getBirthdaySuggestions((key) => t(key), richText);
  const isSaleOpen = saleState === "open";

  return (
    <SpecialWrapper>
      <BirthdayBlock>
        <AbsoluteIconBox>
          <Birthday34Badge />
        </AbsoluteIconBox>
        <BirthdayTextContent>
          <BirthdayTextContentTitle>{richText("title")}</BirthdayTextContentTitle>
          <BirthdayTextContentDescription>
            {t("description")}
          </BirthdayTextContentDescription>
          {/* Closed sales must read as a state, not as a missing button. The
              row below keeps the details button either way, so the hero keeps
              its height. */}
          {!isSaleOpen && (
            <ClosedSalesNotice
              tone="dark"
              text={
                saleState === "closed" ? t("closedNotice") : commonT("salesUnavailable")
              }
              action={
                saleState === "unavailable" ? (
                  <RefreshButton
                    label={commonT("tryAgain")}
                    placement="birthday_drop_hero"
                    tone="dark"
                  />
                ) : undefined
              }
            />
          )}
          <BirthdayContentButtons>
            {checkout && isSaleOpen ? (
              <>
                <Button
                  buttonText={t("buyButton", { price: checkout.price })}
                  href={checkout.href}
                  prefetch={false}
                  variant="white"
                  analytics={{
                    id: "buy_birthday_drop",
                    offer_id: checkout.offerId,
                    placement: "birthday_drop_hero",
                    product_id: BIRTHDAY_DROP_PRODUCT_ID,
                  }}
                  {...stickyCtaAnchorProps}
                />
                <StickyCta
                  analytics={{
                    id: "buy_birthday_drop",
                    offer_id: checkout.offerId,
                    placement: "birthday_drop_sticky",
                    product_id: BIRTHDAY_DROP_PRODUCT_ID,
                  }}
                  label={t("buyButton", { price: checkout.price })}
                  href={checkout.href}
                  prefetch={false}
                  title={t("titleShort")}
                />
              </>
            ) : null}
            <Button
              buttonText={t("detailsButton")}
              variant="ghost"
              width="180px"
              href={`#${BIRTHDAY_ABOUT_SECTION_ID}`}
              analytics={{ id: "birthday_drop_details", placement: "hero" }}
            />
          </BirthdayContentButtons>
        </BirthdayTextContent>
        <BirthdayVideoContent>
          {/* The player fills the column next to the text. Chromium stretches a
              flex item past its aspect ratio on its own; WebKit (Safari 26.5+)
              keeps the 2:1 box, which then floats at the top of the wrapper
              with its bottom corners unclipped. In the stacked mobile layout
              the percentage has no height to resolve against and the ratio
              sizes the box again. */}
          <VideoPlayer
            analyticsId="birthday-drop-preview"
            src={BIRTHDAY_DROP_VIDEO_SRC}
            poster="/images/love_me_in_the_morning_poster.webp"
            height="100%"
            radius="0px"
            buttonSize="80px"
          />
        </BirthdayVideoContent>
      </BirthdayBlock>

      <AboutChoreoSection id={BIRTHDAY_ABOUT_SECTION_ID}>
        <AboutChoreoTitle>{t("aboutTitle")}</AboutChoreoTitle>
        <AboutChoreoCards>
          {suggestions.map(({ id, ...suggestion }) => (
            <IconTextCard key={id} {...suggestion} />
          ))}
        </AboutChoreoCards>
      </AboutChoreoSection>

      <Contacts />
    </SpecialWrapper>
  );
}
