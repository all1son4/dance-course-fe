import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  getSellableProductById,
  getSellableProductOfferById,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { isChoreoChannelOfferId, isFirstTouchOfferId } from "@/lib/telegram/offer-access";
import { Success } from "@/svg";

import { Container, ResultCard } from "./page.styles";
import SuccessContent from "./success-content";
import SuccessRedirectGuard from "./success-redirect-guard";

const CHECKOUT_CONTEXT_KEYS = ["product", "offer", "currency"] as const;

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

export default async function SuccessPage({ searchParams }: SuccessPageProps) {
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
  const isTelegramAccessPurchase =
    isChoreoChannelOfferId(offerId) || isFirstTouchOfferId(offerId);
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
        <SuccessContent
          checkoutSessionId={checkoutSessionId}
          descriptionLine1={t(`description.${successCase}.line1`)}
          descriptionLine2={t(`description.${successCase}.line2`)}
          homeButtonText={t("buttons.home")}
          isTelegramAccessPurchase={isTelegramAccessPurchase}
          offerId={offerId}
          paymentIntentId={paymentIntentId}
          productId={productId}
          telegramContactSupportText={t("telegram.contactSupport")}
          telegramOpenLinkText={t("telegram.openLink")}
          telegramPendingText={t("telegram.pending")}
          telegramUnavailableText={t("telegram.unavailable")}
          title={t("title")}
        />
      </ResultCard>
    </Container>
  );
}
