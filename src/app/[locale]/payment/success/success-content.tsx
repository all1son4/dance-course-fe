"use client";

import { useState } from "react";
import styled from "styled-components";

import Button from "@/components/common/Button";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";

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

const Title = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 30px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 40px 0 20px 0;
  color: rgba(0, 0, 0, 1);
`;

const Paragraphs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Paragraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

const ButtonBox = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 40px 0 0 0;
  max-width: 600px;
  gap: 10px;
  width: 100%;

  @media (max-width: 767px) {
    max-width: 100%;
    flex-direction: column;

    & button,
    & a {
      max-width: 100%;
    }
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

  return (
    <>
      <Title>{title}</Title>
      <Paragraphs>
        <Paragraph>{descriptionLine1}</Paragraph>
        <Paragraph>{descriptionLine2}</Paragraph>
        {accessNotice ? <Paragraph>{accessNotice}</Paragraph> : null}
        {isTelegramAccessPurchase && showUnavailableNote ? (
          <Paragraph>{telegramUnavailableText}</Paragraph>
        ) : null}
      </Paragraphs>
      <ButtonBox>
        {isTelegramAccessPurchase ? (
          <TelegramAccessButton
            activeText={telegramAccessActiveText}
            buttonText={telegramOpenLinkText}
            checkoutSessionId={checkoutSessionId}
            dateLocale={dateLocale}
            inspirationButtonText={telegramInspirationLinkText}
            inspirationUntilLabel={telegramInspirationUntilLabel}
            mainButtonText={telegramMainGroupLinkText}
            offerId={offerId}
            paymentIntentId={paymentIntentId}
            pendingText={telegramPendingText}
            productId={productId}
            supportButtonText={telegramContactSupportText}
            supportHref={SUPPORT_TELEGRAM_URL}
            unavailableText={telegramUnavailableText}
            onUnavailableChange={setShowUnavailableNote}
          />
        ) : null}

        <Button buttonText={homeButtonText} href="/" variant="secondary" width="280px" />
      </ButtonBox>
    </>
  );
}
