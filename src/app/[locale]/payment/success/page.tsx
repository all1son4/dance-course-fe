import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import styled from "styled-components";

import { Button } from "@/components";
import {
  getSellableProductById,
  getSellableProductOfferById,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { glass } from "@/styles/mixins/glass";
import { Success } from "@/svg";

import SuccessRedirectGuard from "./success-redirect-guard";
import TelegramAccessButton from "./telegram-access-button";

const CHECKOUT_CONTEXT_KEYS = ["product", "offer", "currency"] as const;
const FIRST_TOUCH_TELEGRAM_LINK = "https://t.me/+YSmcfQx7nYhhOTgy";

type SuccessPageSearchParams = Record<string, string | string[] | undefined>;
type SuccessPageProps = {
  searchParams?: Promise<SuccessPageSearchParams> | SuccessPageSearchParams;
};

const getParamValue = (searchParams: SuccessPageSearchParams, key: string): string => {
  const value = searchParams[key];

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return (value[0] ?? "").trim();
  }

  return "";
};

const Container = styled.div`
  display: flex;
  width: 100%;
  min-height: 100dvh;
  align-items: center;
  justify-content: center;

  @media (max-width: 1024px) {
    padding: 0 20px;
  }
`;

const ResultCard = styled.div`
  display: flex;
  flex-direction: column;
  padding: 60px;
  max-width: 740px;

  ${glass({
    radius: "40px",
  })}

  @media (max-width: 767px) {
    border-radius: 40px !important;
    padding: 30px 20px;
  }
`;

const Title = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 30px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 40px 0 20px 0;
  color: rgba(0, 0, 0, 1);
`;

const Paragraps = styled.div`
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
  }
`;

export default async function SuccesPage({ searchParams }: SuccessPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const t = await getTranslations("PaymentSuccessPage");
  const productId = getParamValue(resolvedSearchParams, "product");
  const offerId = getParamValue(resolvedSearchParams, "offer");
  const redirectStatus = getParamValue(
    resolvedSearchParams,
    "redirect_status",
  ).toLowerCase();
  const checkoutSessionId = getParamValue(resolvedSearchParams, "checkout");
  const paymentIntentId = getParamValue(resolvedSearchParams, "payment_intent");
  const contextParams = new URLSearchParams();

  CHECKOUT_CONTEXT_KEYS.forEach((key) => {
    const value = getParamValue(resolvedSearchParams, key);

    if (value) {
      contextParams.set(key, value);
    }
  });

  const contextQuery = contextParams.toString();
  const failedPath = contextQuery ? `/payment/failed?${contextQuery}` : "/payment/failed";
  const paymentPath = contextQuery ? `/payment?${contextQuery}` : "/payment";

  if (!checkoutSessionId || !paymentIntentId || !productId || !offerId) {
    redirect(paymentPath);
  }

  if (redirectStatus === "failed") {
    redirect(failedPath);
  }

  const isFirstTouchPurchase = productId === SELLABLE_PRODUCTS["first-touch"].id;
  const selectedProduct = getSellableProductById(productId);
  const selectedOffer = selectedProduct
    ? getSellableProductOfferById(selectedProduct, offerId)
    : null;

  if (!selectedProduct || !selectedOffer) {
    redirect(paymentPath);
  }

  const isWithoutMentorPurchase = selectedOffer?.code === "without-mentor";
  const successCase = isFirstTouchPurchase
    ? "firstTouch"
    : isWithoutMentorPurchase
      ? "withoutMentor"
      : "withMentor";

  return (
    <Container>
      <ResultCard>
        <SuccessRedirectGuard
          checkoutSessionId={checkoutSessionId}
          failedPath={failedPath}
          paymentIntentId={paymentIntentId}
        />
        <Success />
        <Title>{t("title")}</Title>
        <Paragraps>
          <Paragraph>{t(`description.${successCase}.line1`)}</Paragraph>
          <Paragraph>{t(`description.${successCase}.line2`)}</Paragraph>
        </Paragraps>
        <ButtonBox>
          {isFirstTouchPurchase && (
            <Button
              buttonText={t("telegram.openLink")}
              href={FIRST_TOUCH_TELEGRAM_LINK}
              target="_blank"
            />
          )}
          {isWithoutMentorPurchase && (
            <TelegramAccessButton
              buttonText={t("telegram.openLink")}
              checkoutSessionId={checkoutSessionId}
              offerId={offerId}
              paymentIntentId={paymentIntentId}
              pendingText={t("telegram.pending")}
              productId={productId}
              retryButtonText={t("telegram.retry")}
              supportButtonText={t("telegram.contactSupport")}
              supportHref="/#contacts"
              unavailableText={t("telegram.unavailable")}
            />
          )}
          <Button buttonText={t("buttons.home")} href="/" variant="secondary" />
        </ButtonBox>
      </ResultCard>
    </Container>
  );
}
