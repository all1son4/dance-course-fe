"use client";

import { useState } from "react";
import styled from "styled-components";

import { Button } from "@/components";
import {
  FIRST_TOUCH_TELEGRAM_CHANNEL_URL,
  SUPPORT_TELEGRAM_URL,
} from "@/constants/links";

import TelegramAccessButton from "./telegram-access-button";

type SuccessContentProps = {
  checkoutSessionId: string;
  descriptionLine1: string;
  descriptionLine2: string;
  homeButtonText: string;
  isFirstTouchPurchase: boolean;
  isWithoutMentorPurchase: boolean;
  offerId: string;
  paymentIntentId: string;
  productId: string;
  telegramContactSupportText: string;
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
  }
`;

export default function SuccessContent({
  checkoutSessionId,
  descriptionLine1,
  descriptionLine2,
  homeButtonText,
  isFirstTouchPurchase,
  isWithoutMentorPurchase,
  offerId,
  paymentIntentId,
  productId,
  telegramContactSupportText,
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
        {isWithoutMentorPurchase && showUnavailableNote ? (
          <Paragraph>{telegramUnavailableText}</Paragraph>
        ) : null}
      </Paragraphs>
      <ButtonBox>
        {isFirstTouchPurchase ? (
          <Button
            buttonText={telegramOpenLinkText}
            href={FIRST_TOUCH_TELEGRAM_CHANNEL_URL}
            target="_blank"
          />
        ) : null}

        {isWithoutMentorPurchase ? (
          <TelegramAccessButton
            buttonText={telegramOpenLinkText}
            checkoutSessionId={checkoutSessionId}
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

        <Button buttonText={homeButtonText} href="/" variant="secondary" />
      </ButtonBox>
    </>
  );
}
