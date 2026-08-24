"use client";

import { useEffect, useState } from "react";
import styled from "styled-components";

import Button from "@/components/common/Button";
import { useCookieConsent } from "@/components/common/CookieConsent";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import { recordBirthdayOfferPurchase } from "@/lib/birthday-popup";

import {
  ResultButtonBox,
  ResultParagraph,
  ResultParagraphs,
  ResultTitle,
} from "../result-page.styles";
import TelegramAccessButton from "./telegram-access-button";

type SuccessContentProps = {
  accessNotice: string;
  checkoutSessionId: string;
  dateLocale: string;
  descriptionLine1: string;
  descriptionLine2: string;
  homeButtonText: string;
  isTelegramAccessPurchase: boolean;
  offerId: string;
  paymentIntentId: string;
  productId: string;
  telegramAccessActiveText: string;
  telegramContactSupportText: string;
  telegramInspirationLinkText: string;
  telegramInspirationUntilLabel: string;
  telegramMainGroupLinkText: string;
  telegramOpenLinkText: string;
  telegramPendingText: string;
  telegramUnavailableText: string;
  title: string;
};

const AccessDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const AccessDetail = styled.p`
  font-weight: 300;
  font-size: 14.5px;
  line-height: 145%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 0.68);

  @media (max-width: 767px) {
    font-size: 13.5px;
    line-height: 140%;
  }
`;

const HomeButtonSlot = styled.div<{ $fullRow: boolean }>`
  display: flex;
  justify-content: center;
  width: ${({ $fullRow }) => ($fullRow ? "100%" : "auto")};
  flex: ${({ $fullRow }) => ($fullRow ? "1 0 100%" : "0 1 280px")};

  @media (max-width: 767px) {
    width: 100%;
    flex-basis: 100%;
  }
`;

export default function SuccessContent({
  accessNotice,
  checkoutSessionId,
  dateLocale,
  descriptionLine1,
  descriptionLine2,
  homeButtonText,
  isTelegramAccessPurchase,
  offerId,
  paymentIntentId,
  productId,
  telegramAccessActiveText,
  telegramContactSupportText,
  telegramInspirationLinkText,
  telegramInspirationUntilLabel,
  telegramMainGroupLinkText,
  telegramOpenLinkText,
  telegramPendingText,
  telegramUnavailableText,
  title,
}: SuccessContentProps) {
  const [showUnavailableNote, setShowUnavailableNote] = useState(false);
  const { canUseFunctionalStorage } = useCookieConsent();

  // This component renders behind the verification guard, so reaching it means
  // the payment intent really did succeed - the campaign popup can retire.
  useEffect(() => {
    recordBirthdayOfferPurchase(offerId, canUseFunctionalStorage);
  }, [canUseFunctionalStorage, offerId]);
  const [telegramAccessCount, setTelegramAccessCount] = useState(0);
  const [inspirationAccessExpiresAt, setInspirationAccessExpiresAt] = useState("");
  const hasValidTelegramAccessContext = Boolean(
    checkoutSessionId && offerId && productId,
  );
  const isTelegramAccessPending =
    isTelegramAccessPurchase &&
    hasValidTelegramAccessContext &&
    telegramAccessCount === 0 &&
    !showUnavailableNote;
  const homeButtonUsesFullRow = isTelegramAccessPending || telegramAccessCount > 1;
  const inspirationAccessExpiryText = inspirationAccessExpiresAt
    ? `${telegramInspirationUntilLabel} ${new Intl.DateTimeFormat(dateLocale, {
        dateStyle: "long",
        timeZone: "Europe/Warsaw",
      }).format(new Date(inspirationAccessExpiresAt))}.`
    : "";
  return (
    <>
      <ResultTitle>{title}</ResultTitle>
      <ResultParagraphs>
        {descriptionLine1 ? <ResultParagraph>{descriptionLine1}</ResultParagraph> : null}
        {descriptionLine2 ? <ResultParagraph>{descriptionLine2}</ResultParagraph> : null}
        {accessNotice || inspirationAccessExpiryText ? (
          <AccessDetails>
            {accessNotice ? <AccessDetail>{accessNotice}</AccessDetail> : null}
            {inspirationAccessExpiryText ? (
              <AccessDetail>{inspirationAccessExpiryText}</AccessDetail>
            ) : null}
          </AccessDetails>
        ) : null}
        {isTelegramAccessPurchase && showUnavailableNote ? (
          <ResultParagraph>{telegramUnavailableText}</ResultParagraph>
        ) : null}
      </ResultParagraphs>
      <ResultButtonBox>
        {isTelegramAccessPurchase ? (
          <TelegramAccessButton
            activeText={telegramAccessActiveText}
            buttonText={telegramOpenLinkText}
            checkoutSessionId={checkoutSessionId}
            inspirationButtonText={telegramInspirationLinkText}
            mainButtonText={telegramMainGroupLinkText}
            offerId={offerId}
            paymentIntentId={paymentIntentId}
            pendingText={telegramPendingText}
            productId={productId}
            supportButtonText={telegramContactSupportText}
            supportHref={SUPPORT_TELEGRAM_URL}
            unavailableText={telegramUnavailableText}
            onAccessCountChange={setTelegramAccessCount}
            onInspirationExpiryChange={setInspirationAccessExpiresAt}
            onUnavailableChange={setShowUnavailableNote}
          />
        ) : null}

        <HomeButtonSlot $fullRow={homeButtonUsesFullRow}>
          <Button
            buttonText={homeButtonText}
            href="/"
            variant="secondary"
            width={homeButtonUsesFullRow ? "100%" : "280px"}
          />
        </HomeButtonSlot>
      </ResultButtonBox>
    </>
  );
}
