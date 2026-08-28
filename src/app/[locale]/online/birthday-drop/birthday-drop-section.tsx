import { getTranslations } from "next-intl/server";

import IconTextCard from "@/components/cards/IconTextCard";
import Button from "@/components/common/Button";
import ClosedSalesNotice from "@/components/other/ClosedSalesNotice";
import Contacts from "@/components/other/Contacts";
import StickyCta from "@/components/other/StickyCta";
import VideoPlayer from "@/components/other/VideoPlayer";
import { BIRTHDAY_DROP_PRODUCT_ID } from "@/constants/sellable-products";
import { stickyCtaAnchorProps } from "@/lib/sticky-cta";
import { Birthday34Badge } from "@/svg";

import { createRichText } from "../_shared/content";
import SaleGate from "../_shared/sale-gate";
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
  const t = await getTranslations("BirthdayDropPage");
  const richText = createRichText(t);
  const checkout = getBirthdayDropCheckout();
  const suggestions = getBirthdaySuggestions((key) => t(key), richText);

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
              notice and the buy button follow the admin sales switch and stream
              in behind the shell (see SaleGate); the row itself, with the
              details button, is static so the hero keeps its height. */}
          <SaleGate productId={BIRTHDAY_DROP_PRODUCT_ID}>
            {(isSaleOpen) =>
              !isSaleOpen ? <ClosedSalesNotice text={t("closedNotice")} /> : null
            }
          </SaleGate>
          <BirthdayContentButtons>
            {checkout ? (
              <SaleGate productId={BIRTHDAY_DROP_PRODUCT_ID}>
                {(isSaleOpen) =>
                  isSaleOpen ? (
                    <>
                      <Button
                        buttonText={t("buyButton", { price: checkout.price })}
                        href={checkout.href}
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
                        title={t("titleShort")}
                      />
                    </>
                  ) : null
                }
              </SaleGate>
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
          <VideoPlayer
            analyticsId="birthday-drop-preview"
            src={BIRTHDAY_DROP_VIDEO_SRC}
            poster="/images/love_me_in_the_morning_poster.webp"
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
