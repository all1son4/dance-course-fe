import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import {
  getSellableProductById,
  getSellableProductOfferById,
  isOnlineGroupLibraryOfferId,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import {
  isChoreoChannelOfferId,
  isFirstTouchOfferId,
  isLifetimeChannelOfferId,
  isOnlineGroupAccessOfferId,
  isRenewalDiscountOfferId,
} from "@/lib/telegram/offer-access";
import { Success } from "@/svg";

import { ResultCard, ResultContainer } from "../result-page.styles";
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
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("PaymentSuccessPage"),
  ]);
  const productId = getParamValue(resolvedSearchParams, "product");
  const offerId = getParamValue(resolvedSearchParams, "offer");
  const currencyParam = getParamValue(resolvedSearchParams, "currency").toLowerCase();
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
  const isRenewalPurchase = isRenewalDiscountOfferId(offerId);
  const isOnlineGroupPurchase = isOnlineGroupAccessOfferId(offerId);
  const isLifetimeChannelPurchase = isLifetimeChannelOfferId(offerId);
  const isTelegramAccessPurchase =
    isChoreoChannelOfferId(offerId) ||
    isFirstTouchOfferId(offerId) ||
    isLifetimeChannelPurchase ||
    isOnlineGroupPurchase;
  const successCase = isFirstTouchPurchase
    ? "firstTouch"
    : isRenewalPurchase
      ? "renewal"
      : isOnlineGroupPurchase
        ? "onlineGroup"
        : isLifetimeChannelPurchase
          ? "birthdayDrop"
          : isWithoutMentorPurchase
            ? "withoutMentor"
            : "withMentor";
  const accessNotice = isFirstTouchPurchase
    ? t("accessNotice.firstTouch")
    : isLifetimeChannelPurchase
      ? t("accessNotice.birthdayDrop")
      : isChoreoChannelOfferId(offerId)
        ? t("accessNotice.choreo")
        : isOnlineGroupPurchase
          ? t(
              isOnlineGroupLibraryOfferId(offerId)
                ? "accessNotice.onlineGroupPlus"
                : "accessNotice.onlineGroup",
            )
          : "";

  return (
    <ResultContainer>
      <ResultCard>
        <SuccessRedirectGuard
          checkingText={t("verification.checking")}
          checkoutSessionId={checkoutSessionId}
          failedPath={failedPath}
          homeButtonText={t("buttons.home")}
          paymentIntentId={paymentIntentId}
          paymentPath={paymentPath}
          pendingText={t("verification.pending")}
          refreshButtonText={t("verification.refreshButton")}
          supportButtonText={t("telegram.contactSupport")}
          unavailableText={t("verification.unavailable")}
        >
          <Success />
          <SuccessContent
            accessNotice={accessNotice}
            checkoutSessionId={checkoutSessionId}
            descriptionLine1={t(`description.${successCase}.line1`)}
            descriptionLine2={t(`description.${successCase}.line2`)}
            dateLocale={locale}
            homeButtonText={t("buttons.home")}
            isTelegramAccessPurchase={isTelegramAccessPurchase}
            isRenewalPurchase={isRenewalPurchase}
            offerId={offerId}
            offerCode={selectedOffer.code}
            paymentIntentId={paymentIntentId}
            productId={productId}
            productCode={selectedProduct.code}
            purchaseCurrency={
              currencyParam === "eur" || currencyParam === "pln"
                ? currencyParam
                : undefined
            }
            purchaseValue={
              currencyParam === "eur" || currencyParam === "pln"
                ? selectedOffer.prices[currencyParam]
                : undefined
            }
            telegramAccessActiveText={t("telegram.active")}
            telegramContactSupportText={t("telegram.contactSupport")}
            telegramInspirationLinkText={t("telegram.openInspiration")}
            telegramInspirationUntilLabel={t("telegram.inspirationUntil")}
            telegramMainGroupLinkText={t("telegram.openMainGroup")}
            telegramOpenLinkText={t("telegram.openLink")}
            telegramPendingText={t("telegram.pending")}
            telegramUnavailableText={t("telegram.unavailable")}
            title={t("title")}
          />
        </SuccessRedirectGuard>
      </ResultCard>
    </ResultContainer>
  );
}
