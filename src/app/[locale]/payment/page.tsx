"use client";

import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent, FocusEvent, FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import Button from "@/components/common/Button";
import { useCookieConsent } from "@/components/common/CookieConsent/CookieConsentProvider";
import type { StripePaymentTabsProps } from "@/components/other/StripePaymentTabs";
import {
  type CountryOption,
  getFallbackCountryOptions,
  getLocalizedCountryOptions,
} from "@/constants/countries";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import {
  BIRTHDAY_DROP_PRODUCT_ID,
  formatCheckoutPrice,
  getDefaultCheckoutCurrencyByLocale,
  getResolvedCheckoutCurrency,
  isOnlineGroupLibraryOfferId,
  type SupportedCheckoutCurrency,
} from "@/constants/sellable-products";
import {
  applyBirthdayPopupSignal,
  getBirthdayPopupState,
  isBirthdayOfferId,
  saveBirthdayPopupState,
} from "@/lib/birthday-popup";
import { ensureLocationChangeEvents, LOCATION_CHANGE_EVENT } from "@/lib/location-change";
import { PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY } from "@/lib/payment-draft";
import { usePaymentStore } from "@/stores";
import type { PaymentCheckoutDraft } from "@/stores/payment-store";

import { CheckoutForm } from "./checkout-form";
import {
  CheckoutSummaryCard,
  type CheckoutSummaryCardProps,
} from "./checkout-summary-card";
import {
  AgreementLink,
  InteractiveBox,
  PaymentDescription,
  PaymentSection,
  PaymentTitle,
  SalesClosedDescription,
  SalesClosedNotice,
  SalesClosedTitle,
  SummaryBoxDesktop,
  SummaryBoxMobile,
  TextBox,
} from "./page.styles";
import {
  PAYMENT_CHECKBOXES,
  PAYMENT_LESSON_LANGUAGE_OPTIONS,
  type PaymentAgreementFieldName,
  type PaymentCustomerFieldName,
} from "./payment.constants";
import {
  type CheckoutAgreement,
  type CheckoutInputField,
  getCompactSummaryTitle,
  getVisiblePaymentInputs,
  isReloadNavigation,
  PAYMENT_API_ENDPOINTS,
  PAYMENT_DRAFT_SAVE_DEBOUNCE_MS,
  PAYMENT_INTENT_CREATION_DELAY_MS,
  type SellableProductsCatalogResponse,
  STRIPE_INTENT_ERROR_TRANSLATION_KEYS,
} from "./payment.helpers";
import { resolvePaymentValidationLocale } from "./payment.validation";
import { useTelegramRenewal } from "./use-telegram-renewal";

const PaymentPage = observer(function PaymentPage() {
  const paymentStore = usePaymentStore();
  const { canUseFunctionalStorage } = useCookieConsent();
  const locale = useLocale();
  const t = useTranslations("PaymentPage");
  const stripeT = useTranslations("StripePaymentTabs");
  const productT = useTranslations("SellableProducts");
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>(
    getFallbackCountryOptions,
  );
  const [searchKey, setSearchKey] = useState("");
  const hasHydratedCheckoutDraftRef = useRef(false);
  const isChoreoProduct = paymentStore.selectedProduct.type === "choreo";
  // The drop ships one Telegram channel with both languages inside, so a
  // language choice on its checkout would be meaningless noise.
  const showsLessonLanguage =
    isChoreoProduct && paymentStore.selectedProduct.id !== BIRTHDAY_DROP_PRODUCT_ID;
  const isOnlineGroupCheckout =
    paymentStore.selectedProduct.code === "online-group-anna-strok";
  const isOnlineGroupPlusCheckout =
    isOnlineGroupCheckout && isOnlineGroupLibraryOfferId(paymentStore.selectedOffer.id);
  const lessonLanguageOptions = PAYMENT_LESSON_LANGUAGE_OPTIONS.map((option) => ({
    label: t(option.labelKey),
    value: option.value,
  }));
  const selectedProductTitle = productT(paymentStore.selectedProduct.titleKey);
  const checkoutTitleKey = paymentStore.selectedProduct.checkoutTitleKey;
  const renewalSlug = new URLSearchParams(searchKey).get("renewal")?.trim() ?? "";
  const isRenewalCheckout = Boolean(renewalSlug);
  // A product may name itself for the checkout - the drop is sold under its
  // campaign name, not the track in quotes. Otherwise the wide card keeps the
  // full title and the narrow one falls back to the quoted short name.
  const checkoutTitle = checkoutTitleKey ? productT(checkoutTitleKey) : "";
  const summaryCardTitle = checkoutTitle || selectedProductTitle;
  const selectedProductCompactTitle =
    checkoutTitle || getCompactSummaryTitle(selectedProductTitle);
  const productPaymentInputs = getVisiblePaymentInputs({
    isRenewalCheckout: false,
    showsLessonLanguage,
  });
  const visiblePaymentInputs = getVisiblePaymentInputs({
    isRenewalCheckout,
    showsLessonLanguage,
  });
  const {
    renewalClientId,
    renewalNonce,
    renewalStatus,
    renewalStatusText,
    renewalStatusTone,
    verifyTelegramRenewal,
  } = useTelegramRenewal({
    locale,
    paymentStore,
    productPaymentInputs,
    renewalSlug,
    t,
  });
  const isRenewalVerified = !isRenewalCheckout || renewalStatus === "verified";
  const canRevealStripe = paymentStore.canShowStripe && isRenewalVerified;
  const stripeIntentErrorText = paymentStore.isCatalogUnavailable
    ? stripeT("errors.catalogUnavailable")
    : paymentStore.stripeIntentError
      ? stripeT(
          STRIPE_INTENT_ERROR_TRANSLATION_KEYS[paymentStore.stripeIntentError] ??
            "errors.paymentIntentRequestFailed",
        )
      : "";
  const persistCheckoutDraftNow = useCallback(() => {
    if (typeof window === "undefined" || !canUseFunctionalStorage) {
      return;
    }

    const checkoutDraft = paymentStore.getCheckoutDraftSnapshot();
    sessionStorage.setItem(
      PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY,
      JSON.stringify(checkoutDraft),
    );
  }, [canUseFunctionalStorage, paymentStore]);

  useEffect(() => {
    document.body.removeAttribute("data-hide-footer");
  }, []);

  useEffect(() => {
    const requestController = new AbortController();

    void fetch(PAYMENT_API_ENDPOINTS.catalog, {
      signal: requestController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          paymentStore.setCatalogUnavailable();
          return null;
        }

        return (await response.json()) as SellableProductsCatalogResponse;
      })
      .then((data) => {
        if (data?.products?.length) {
          paymentStore.setSellableProducts(data.products);
        } else if (data) {
          paymentStore.setCatalogUnavailable();
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.warn("Failed to load sellable products catalog", error);
        paymentStore.setCatalogUnavailable();
      });

    return () => {
      requestController.abort();
    };
  }, [paymentStore]);

  useEffect(() => {
    paymentStore.setValidationLocale(locale);
    paymentStore.initializeCheckoutCurrency(getDefaultCheckoutCurrencyByLocale(locale));
  }, [locale, paymentStore]);

  useEffect(() => {
    setCountryOptions(getLocalizedCountryOptions(locale));
  }, [locale]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    ensureLocationChangeEvents();

    const syncSearchKey = () => {
      setSearchKey(window.location.search);
    };

    syncSearchKey();
    window.addEventListener(LOCATION_CHANGE_EVENT, syncSearchKey);

    return () => {
      window.removeEventListener(LOCATION_CHANGE_EVENT, syncSearchKey);
    };
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(searchKey);

    paymentStore.configureCheckoutSelection({
      offerId: searchParams.get("offer"),
      productId: searchParams.get("product"),
    });
    paymentStore.setRenewalCampaignSlug(searchParams.get("renewal"));
  }, [paymentStore, searchKey]);

  // Reaching checkout for the campaign offer counts as "thinking about it": the
  // birthday popup observes the reaction cooldown even if the payment is dropped.
  useEffect(() => {
    const offerId = new URLSearchParams(searchKey).get("offer");

    if (!offerId || !isBirthdayOfferId(offerId)) {
      return;
    }

    saveBirthdayPopupState(
      applyBirthdayPopupSignal(getBirthdayPopupState(), "checkout_started", new Date()),
      canUseFunctionalStorage,
    );
  }, [canUseFunctionalStorage, searchKey]);

  useEffect(() => {
    const searchParams = new URLSearchParams(searchKey);
    const queryCurrency = searchParams.get("currency");

    if (!queryCurrency) {
      return;
    }

    const nextCurrency = getResolvedCheckoutCurrency(queryCurrency);
    paymentStore.setSelectedCurrency(nextCurrency);
  }, [paymentStore, searchKey]);

  useEffect(() => {
    if (
      hasHydratedCheckoutDraftRef.current ||
      typeof window === "undefined" ||
      !canUseFunctionalStorage
    ) {
      return;
    }

    hasHydratedCheckoutDraftRef.current = true;

    // Drafts survive a reload and the "back to payment" return from a failed
    // attempt (marked with resume=1). Any other fresh visit starts a clean
    // checkout session.
    const isResumeNavigation =
      new URLSearchParams(window.location.search).get("resume") === "1";

    if (!isReloadNavigation() && !isResumeNavigation) {
      sessionStorage.removeItem(PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY);
      return;
    }

    const serializedDraft = sessionStorage.getItem(PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY);

    if (!serializedDraft) {
      return;
    }

    try {
      const parsedDraft = JSON.parse(serializedDraft) as Partial<PaymentCheckoutDraft>;
      const searchParams = new URLSearchParams(window.location.search);
      const queryOfferId = searchParams.get("offer");
      const queryProductId = searchParams.get("product");
      const queryCurrency = searchParams.get("currency");

      paymentStore.applyCheckoutDraft({
        ...parsedDraft,
        selectedCurrency: queryCurrency
          ? getResolvedCheckoutCurrency(queryCurrency)
          : parsedDraft.selectedCurrency,
        selectedOfferId: queryOfferId ?? parsedDraft.selectedOfferId,
        selectedProductId: queryProductId ?? parsedDraft.selectedProductId,
        validationLocale: resolvePaymentValidationLocale(locale),
      });
    } catch {
      sessionStorage.removeItem(PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY);
    }
  }, [canUseFunctionalStorage, locale, paymentStore]);

  useEffect(() => {
    if (typeof window === "undefined" || !canUseFunctionalStorage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      persistCheckoutDraftNow();
    }, PAYMENT_DRAFT_SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    canUseFunctionalStorage,
    persistCheckoutDraftNow,
    paymentStore.agreements.digitalContentAgreement,
    paymentStore.agreements.immediateAccessConsent,
    paymentStore.agreements.privacyPolicyAcknowledgement,
    paymentStore.agreements.withdrawalNoticeAcknowledgement,
    paymentStore.checkoutSessionId,
    paymentStore.customerData.country,
    paymentStore.customerData.address,
    paymentStore.customerData.city,
    paymentStore.customerData.email,
    paymentStore.customerData.fullName,
    paymentStore.customerData.lessonLanguage,
    paymentStore.customerData.nickname,
    paymentStore.customerData.postalCode,
    paymentStore.selectedCurrency,
    paymentStore.selectedOfferId,
    paymentStore.selectedProductId,
    paymentStore.validationLocale,
  ]);

  useEffect(() => {
    if (!paymentStore.canShowStripe || !isRenewalVerified) {
      return;
    }

    // Let the last keystroke/checkbox update settle before creating a billable Stripe
    // intent, reducing the chance of immediately canceling stale intents.
    const timeoutId = window.setTimeout(() => {
      void paymentStore.ensureStripePaymentIntent(paymentStore.selectedCurrency);
    }, PAYMENT_INTENT_CREATION_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    paymentStore,
    paymentStore.canShowStripe,
    isRenewalVerified,
    paymentStore.selectedOfferId,
    paymentStore.selectedProductId,
    paymentStore.selectedCurrency,
    paymentStore.customerData.email,
    paymentStore.customerData.fullName,
    paymentStore.customerData.nickname,
    paymentStore.customerData.address,
    paymentStore.customerData.city,
    paymentStore.customerData.postalCode,
    paymentStore.customerData.country,
    paymentStore.customerData.lessonLanguage,
    paymentStore.renewalCampaignSlug,
  ]);

  useEffect(() => {
    return () => {
      paymentStore.resetCheckoutForm();
    };
  }, [paymentStore]);

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    paymentStore.setCustomerField(
      event.target.name as PaymentCustomerFieldName,
      event.target.value,
    );
  };

  const handleInputBlur = (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    paymentStore.touchCustomerField(event.target.name as PaymentCustomerFieldName);
  };

  const handleAgreementChange = (
    fieldName: PaymentAgreementFieldName,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    paymentStore.setAgreement(fieldName, event.target.checked);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    paymentStore.validateCustomerForm();
  };

  const handleCurrencyChange = (value: SupportedCheckoutCurrency) => {
    paymentStore.setSelectedCurrency(value);
  };

  const getInputSelectOptions = (fieldName: PaymentCustomerFieldName) => {
    if (fieldName === "country") {
      return countryOptions;
    }

    if (fieldName === "lessonLanguage") {
      return lessonLanguageOptions;
    }

    return undefined;
  };

  const checkoutInputFields: CheckoutInputField[] = visiblePaymentInputs.map(
    (inputConfig) => ({
      ...inputConfig,
      errorMessage: paymentStore.customerErrors[inputConfig.name] ?? "",
      label: t(inputConfig.labelKey),
      placeholder: t(inputConfig.placeholderKey),
      selectOptions: getInputSelectOptions(inputConfig.name),
      value: paymentStore.customerData[inputConfig.name] ?? "",
    }),
  );
  const checkoutAgreements: CheckoutAgreement[] = PAYMENT_CHECKBOXES.map(
    (checkboxConfig) => ({
      checked: paymentStore.agreements[checkboxConfig.name],
      disabled: isRenewalCheckout && !isRenewalVerified,
      formName: checkboxConfig.formName,
      name: checkboxConfig.name,
      placeholder:
        checkboxConfig.name === "privacyPolicyAcknowledgement"
          ? t.rich(checkboxConfig.placeholderKey, {
              link: (chunks) => (
                <AgreementLink
                  href="/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  {chunks}
                </AgreementLink>
              ),
            })
          : t(checkboxConfig.placeholderKey),
    }),
  );
  const summaryProps: Omit<CheckoutSummaryCardProps, "isMobile" | "title"> = {
    accessNote: isRenewalCheckout
      ? t(
          isOnlineGroupPlusCheckout
            ? "renewal.summaryCard.accessNotePlus"
            : "renewal.summaryCard.accessNote",
        )
      : productT(
          isOnlineGroupPlusCheckout
            ? "onlineGroupAnnaStrok.accessNotePlus"
            : paymentStore.selectedProduct.accessNoteKey,
        ),
    amountLabel: t("summary.amountLabel"),
    currencyLabel: t("summary.currencyLabel"),
    descriptionParagraphs: paymentStore.selectedProduct.descriptionKeys.map(
      (paragraphKey) => ({
        key: paragraphKey,
        text: productT(paragraphKey),
      }),
    ),
    formattedPrice: formatCheckoutPrice(
      paymentStore.selectedPrice,
      paymentStore.selectedCurrency,
    ),
    isRenewalCheckout,
    offerSummary: isOnlineGroupCheckout
      ? t("summary.offerLabel", {
          offer: productT(paymentStore.selectedOffer.labelKey),
        })
      : null,
    onCurrencyChange: handleCurrencyChange,
    renewalDescription: t("renewal.summaryCard.description"),
    selectedCurrency: paymentStore.selectedCurrency,
  };
  const stripeProps: StripePaymentTabsProps = {
    allPaymentIntentIds: Object.values(paymentStore.stripePaymentIntentIds),
    billingAddressLine1: paymentStore.customerData.address,
    billingCity: paymentStore.customerData.city,
    billingCountry: paymentStore.customerData.country,
    billingEmail: paymentStore.customerData.email,
    billingName: paymentStore.customerData.fullName.trim(),
    billingPostalCode: paymentStore.customerData.postalCode,
    checkoutSessionId: paymentStore.checkoutSessionId,
    clientSecret: paymentStore.stripeClientSecrets?.[paymentStore.selectedCurrency] ?? "",
    paymentIntentId:
      paymentStore.stripePaymentIntentIds?.[paymentStore.selectedCurrency] ?? "",
    resultCurrency: paymentStore.selectedCurrency,
    resultOfferId: paymentStore.selectedOfferId,
    resultProductId: paymentStore.selectedProductId,
  };

  return (
    <PaymentSection>
      <InteractiveBox>
        <TextBox>
          <PaymentTitle>{t("title")}</PaymentTitle>
          <PaymentDescription>
            {isRenewalCheckout
              ? `${t("description")} ${t("renewal.description")}`
              : t("description")}
          </PaymentDescription>
        </TextBox>
        <SummaryBoxMobile>
          <CheckoutSummaryCard
            {...summaryProps}
            isMobile
            title={selectedProductCompactTitle}
          />
        </SummaryBoxMobile>
        {paymentStore.isSalesClosed ? (
          <SalesClosedNotice>
            <SalesClosedTitle>{t("salesClosed.title")}</SalesClosedTitle>
            <SalesClosedDescription>
              {t("salesClosed.description")}
            </SalesClosedDescription>
            <Button
              size="sm"
              buttonText={t("salesClosed.contactButton")}
              href={SUPPORT_TELEGRAM_URL}
              target="_blank"
            />
          </SalesClosedNotice>
        ) : (
          <CheckoutForm
            agreements={checkoutAgreements}
            canRevealStripe={canRevealStripe}
            fields={checkoutInputFields}
            isRenewalCheckout={isRenewalCheckout}
            isRenewalVerified={isRenewalVerified}
            onAgreementChange={handleAgreementChange}
            onInputBlur={handleInputBlur}
            onInputChange={handleInputChange}
            onSubmit={handleSubmit}
            onVerify={verifyTelegramRenewal}
            personalDataTitle={t("personalDataTitle")}
            renewalClientId={renewalClientId}
            renewalNonce={renewalNonce}
            renewalStatus={renewalStatus}
            renewalStatusText={renewalStatusText}
            renewalStatusTone={renewalStatusTone}
            stripeIntentErrorText={stripeIntentErrorText}
            stripeProps={stripeProps}
            verifyLabel={t("renewal.buttons.verify")}
          />
        )}
      </InteractiveBox>
      <SummaryBoxDesktop>
        <CheckoutSummaryCard {...summaryProps} title={summaryCardTitle} />
      </SummaryBoxDesktop>
    </PaymentSection>
  );
});

export default PaymentPage;
