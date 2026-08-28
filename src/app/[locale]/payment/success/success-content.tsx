"use client";

import { useEffect, useState } from "react";

import Button from "@/components/common/Button";
import { useCookieConsent } from "@/components/common/CookieConsent";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import { recordBirthdayOfferPurchase } from "@/lib/birthday-popup";
import { PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY } from "@/lib/payment-draft";

import {
  ResultActions,
  ResultMeta,
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
  const { canUseFunctionalStorage } = useCookieConsent();

  // This component renders behind the verification guard, so reaching it means
  // the payment intent really did succeed - the campaign popup can retire and
  // the checkout draft is finished (redirect-based payment methods land here
  // without passing through the in-page completion path that clears it).
  useEffect(() => {
    recordBirthdayOfferPurchase(offerId, canUseFunctionalStorage);

    try {
      sessionStorage.removeItem(PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY);
    } catch {
      // Strict storage policies must not break the success page.
    }
  }, [canUseFunctionalStorage, offerId]);
  const [inspirationAccessExpiresAt, setInspirationAccessExpiresAt] = useState("");
  // Russian long dates already end in "г." - no second full stop after those.
  const formattedInspirationExpiry = inspirationAccessExpiresAt
    ? new Intl.DateTimeFormat(dateLocale, {
        dateStyle: "long",
        timeZone: "Europe/Warsaw",
      }).format(new Date(inspirationAccessExpiresAt))
    : "";
  const inspirationAccessExpiryText = formattedInspirationExpiry
    ? `${telegramInspirationUntilLabel} ${formattedInspirationExpiry}${formattedInspirationExpiry.endsWith(".") ? "" : "."}`
    : "";
  return (
    <>
      <ResultTitle>{title}</ResultTitle>
      <ResultParagraphs>
        {descriptionLine1 ? <ResultParagraph>{descriptionLine1}</ResultParagraph> : null}
        {descriptionLine2 ? <ResultParagraph>{descriptionLine2}</ResultParagraph> : null}
        {accessNotice ? <ResultMeta>{accessNotice}</ResultMeta> : null}
        {inspirationAccessExpiryText ? (
          <ResultMeta>{inspirationAccessExpiryText}</ResultMeta>
        ) : null}
      </ResultParagraphs>
      <ResultActions>
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
            onInspirationExpiryChange={setInspirationAccessExpiresAt}
          />
        ) : null}
        <Button buttonText={homeButtonText} href="/" variant="secondary" />
      </ResultActions>
    </>
  );
}
