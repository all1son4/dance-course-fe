import { getTranslations } from "next-intl/server";

import Button from "@/components/common/Button";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import {
  getSellableProductById,
  getSellableProductOfferById,
} from "@/constants/sellable-products";

import {
  ResultActions,
  ResultCard,
  ResultContainer,
  ResultNoticeMark,
  ResultParagraph,
  ResultParagraphs,
  ResultReceipt,
  ResultTitle,
} from "../result-page.styles";
import { getResultReceipt } from "../result-receipt";
import FailedPageGuard from "./failed-page-guard";

const CHECKOUT_CONTEXT_KEYS = ["product", "offer", "currency"] as const;
type FailedPageSearchParams = Record<string, string | string[] | undefined>;
type FailedPageProps = {
  searchParams?: Promise<FailedPageSearchParams> | FailedPageSearchParams;
};

const getParamValue = (searchParams: FailedPageSearchParams, key: string): string => {
  const value = searchParams[key];

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return (value[0] ?? "").trim();
  }

  return "";
};

export default async function FailedPage({ searchParams }: FailedPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const [t, productT] = await Promise.all([
    getTranslations("PaymentFailedPage"),
    getTranslations("SellableProducts"),
  ]);
  const productId = getParamValue(resolvedSearchParams, "product");
  const offerId = getParamValue(resolvedSearchParams, "offer");
  const currencyParam = getParamValue(resolvedSearchParams, "currency").toLowerCase();
  const currency =
    currencyParam === "eur" || currencyParam === "pln" ? currencyParam : undefined;
  const selectedProduct = getSellableProductById(productId);
  const selectedOffer = selectedProduct
    ? getSellableProductOfferById(selectedProduct, offerId)
    : undefined;
  const contextParams = new URLSearchParams();

  CHECKOUT_CONTEXT_KEYS.forEach((key) => {
    const value = getParamValue(resolvedSearchParams, key);

    if (value) {
      contextParams.set(key, value);
    }
  });

  // The resume marker lets the payment page restore the saved checkout draft,
  // which is otherwise reserved for reload navigations.
  contextParams.set("resume", "1");

  const paymentPath = `/payment?${contextParams.toString()}`;
  const receipt = getResultReceipt({
    currency,
    offer: selectedOffer,
    product: selectedProduct,
    translateProduct: (key) => productT(key),
  });

  return (
    <ResultContainer>
      <ResultCard>
        <FailedPageGuard
          currency={currency}
          offerCode={selectedOffer?.code}
          offerId={selectedOffer?.id}
          productCode={selectedProduct?.code}
          productId={selectedProduct?.id}
          value={currency && selectedOffer ? selectedOffer.prices[currency] : undefined}
        />
        <ResultNoticeMark aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 5v9"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2.4"
            />
            <circle cx="12" cy="19" r="1.6" fill="currentColor" />
          </svg>
        </ResultNoticeMark>
        <ResultTitle>{t("title")}</ResultTitle>
        {receipt ? (
          <ResultReceipt>
            <span>{receipt.title}</span>
            <b>{receipt.amount}</b>
          </ResultReceipt>
        ) : null}
        <ResultParagraphs>
          <ResultParagraph>{t("description.line1")}</ResultParagraph>
          <ResultParagraph>{t("description.line2")}</ResultParagraph>
        </ResultParagraphs>
        <ResultActions>
          <Button
            buttonText={t("buttons.backToPayment")}
            href={paymentPath}
            prefetch={false}
            analytics={{
              id: "payment_retry",
              placement: "failed_result",
              ...(currency ? { currency } : {}),
              ...(selectedOffer ? { offer_id: selectedOffer.id } : {}),
              ...(selectedProduct ? { product_id: selectedProduct.id } : {}),
            }}
          />
          <Button
            buttonText={t("buttons.contactSupport")}
            href={SUPPORT_TELEGRAM_URL}
            target="_blank"
            variant="secondary"
            analytics={{ id: "payment_contact_support", placement: "failed_result" }}
          />
        </ResultActions>
      </ResultCard>
    </ResultContainer>
  );
}
