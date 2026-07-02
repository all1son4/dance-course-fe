"use client";

import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent, FocusEvent, FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import InteractiveCard from "@/components/cards/InteractiveCard";
import Checkbox from "@/components/common/Checkbox";
import { useCookieConsent } from "@/components/common/CookieConsent/CookieConsentProvider";
import Input from "@/components/common/Input";
import CurrencySwitch from "@/components/other/CurrencySwitch";
import StripePaymentTabs from "@/components/other/StripePaymentTabs";
import {
  type CountryOption,
  getFallbackCountryOptions,
  getLocalizedCountryOptions,
} from "@/constants/countries";
import {
  formatCheckoutPrice,
  getDefaultCheckoutCurrencyByLocale,
  getResolvedCheckoutCurrency,
  type SellableProduct,
  type SupportedCheckoutCurrency,
} from "@/constants/sellable-products";
import { ensureLocationChangeEvents, LOCATION_CHANGE_EVENT } from "@/lib/location-change";
import { PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY } from "@/lib/payment-draft";
import { usePaymentStore } from "@/stores";
import type { PaymentCheckoutDraft } from "@/stores/payment-store";

import {
  AdditionalNotification,
  AgreementLink,
  Checkboxes,
  CurrencyBox,
  FormBox,
  InputField,
  Inputs,
  InteractiveBox,
  MoneyTitle,
  PaymentDescription,
  PaymentSection,
  PaymentTitle,
  PersonalData,
  PersonalDataTitle,
  Price,
  PriceBox,
  StripeReveal,
  SummaryBottomContent,
  SummaryBoxDesktop,
  SummaryBoxMobile,
  SummaryBoxParahraphs,
  SummaryTopContent,
  TextBox,
} from "./page.styles";
import {
  PAYMENT_CHECKBOXES,
  PAYMENT_INPUTS,
  PAYMENT_LESSON_LANGUAGE_OPTIONS,
  type PaymentAgreementFieldName,
  type PaymentCustomerFieldName,
} from "./payment.constants";
import { resolvePaymentValidationLocale } from "./payment.validation";

const getCompactSummaryTitle = (fullTitle: string) => {
  const quotedNameMatch = fullTitle.match(/["“”«»]([^"“”«»]+)["“”«»]/u);

  return quotedNameMatch?.[1]?.trim() || fullTitle;
};

const PAYMENT_DRAFT_SAVE_DEBOUNCE_MS = 240;
const LEGACY_NAVIGATION_TYPE_RELOAD = 1;

type SellableProductsCatalogResponse = {
  products?: SellableProduct[];
};

const isReloadNavigation = () => {
  if (typeof window === "undefined" || typeof window.performance === "undefined") {
    return false;
  }

  const [navigationEntry] = window.performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];

  if (navigationEntry?.type) {
    return navigationEntry.type === "reload";
  }

  const legacyNavigation = (
    window.performance as Performance & {
      navigation?: {
        type?: number;
      };
    }
  ).navigation;

  return legacyNavigation?.type === LEGACY_NAVIGATION_TYPE_RELOAD;
};

const PaymentPage = observer(function PaymentPage() {
  const paymentStore = usePaymentStore();
  const { canUseFunctionalStorage } = useCookieConsent();
  const locale = useLocale();
  const t = useTranslations("PaymentPage");
  const productT = useTranslations("SellableProducts");
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>(
    getFallbackCountryOptions,
  );
  const [searchKey, setSearchKey] = useState("");
  const hasHydratedCheckoutDraftRef = useRef(false);
  const isChoreoProduct = paymentStore.selectedProduct.type === "choreo";
  const visiblePaymentInputs = isChoreoProduct
    ? PAYMENT_INPUTS
    : PAYMENT_INPUTS.filter((inputConfig) => inputConfig.name !== "lessonLanguage");
  const lessonLanguageOptions = PAYMENT_LESSON_LANGUAGE_OPTIONS.map((option) => ({
    label: t(option.labelKey),
    value: option.value,
  }));
  const selectedProductTitle = productT(paymentStore.selectedProduct.titleKey);
  const selectedProductCompactTitle = getCompactSummaryTitle(selectedProductTitle);
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

    void fetch("/api/catalog/sellable-products", {
      signal: requestController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as SellableProductsCatalogResponse;
      })
      .then((data) => {
        if (data?.products?.length) {
          paymentStore.setSellableProducts(data.products);
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.warn("Failed to load sellable products catalog", error);
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
  }, [paymentStore, searchKey]);

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

    // Drafts are a reload-only safety net. A fresh visit should start a new checkout
    // session, while a browser refresh should keep typed customer data intact.
    if (!isReloadNavigation()) {
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
    if (!paymentStore.canShowStripe) {
      return;
    }

    // Let the last keystroke/checkbox update settle before creating a billable Stripe
    // intent, reducing the chance of immediately canceling stale intents.
    const timeoutId = window.setTimeout(() => {
      void paymentStore.ensureStripePaymentIntent(paymentStore.selectedCurrency);
    }, 420);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    paymentStore,
    paymentStore.canShowStripe,
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

  const handleAgreementChange =
    (fieldName: PaymentAgreementFieldName) => (event: ChangeEvent<HTMLInputElement>) => {
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

  const summaryTopContent = (
    <SummaryTopContent>
      <SummaryBoxParahraphs>
        {paymentStore.selectedProduct.descriptionKeys.map((paragraphKey) => (
          <p key={paragraphKey}>{productT(paragraphKey)}</p>
        ))}
      </SummaryBoxParahraphs>
      <AdditionalNotification>
        {productT(paymentStore.selectedProduct.accessNoteKey)}
      </AdditionalNotification>
    </SummaryTopContent>
  );

  const summaryBottomContent = (
    <SummaryBottomContent>
      <CurrencyBox>
        <MoneyTitle>{t("summary.currencyLabel")}</MoneyTitle>
        <CurrencySwitch
          onChange={handleCurrencyChange}
          value={paymentStore.selectedCurrency}
          width="160px"
        />
      </CurrencyBox>
      <PriceBox>
        <MoneyTitle>{t("summary.amountLabel")}</MoneyTitle>
        <Price>
          {formatCheckoutPrice(paymentStore.selectedPrice, paymentStore.selectedCurrency)}
        </Price>
      </PriceBox>
    </SummaryBottomContent>
  );

  const interactiveCardDesktopComponent = (
    <InteractiveCard
      title={selectedProductTitle}
      topRowContent={summaryTopContent}
      bottomRowContent={summaryBottomContent}
    />
  );

  const interactiveCardMobileComponent = (
    <InteractiveCard
      title={selectedProductCompactTitle}
      topRowContent={summaryTopContent}
      bottomRowContent={summaryBottomContent}
      isTopRowCollapsible
      defaultCollapseTopRow
    />
  );

  return (
    <PaymentSection>
      <InteractiveBox>
        <TextBox>
          <PaymentTitle>{t("title")}</PaymentTitle>
          <PaymentDescription>{t("description")}</PaymentDescription>
        </TextBox>
        <SummaryBoxMobile>{interactiveCardMobileComponent}</SummaryBoxMobile>
        <FormBox onSubmit={handleSubmit}>
          <PersonalData>
            <PersonalDataTitle>{t("personalDataTitle")}</PersonalDataTitle>
            <Inputs>
              {visiblePaymentInputs.map((inputConfig) => (
                <InputField key={inputConfig.name} $layout={inputConfig.layout ?? "full"}>
                  <Input
                    errorMessage={paymentStore.customerErrors[inputConfig.name] ?? ""}
                    id={inputConfig.id}
                    label={t(inputConfig.labelKey)}
                    name={inputConfig.name}
                    onBlur={handleInputBlur}
                    onChange={handleInputChange}
                    placeholder={t(inputConfig.placeholderKey)}
                    selectOptions={getInputSelectOptions(inputConfig.name)}
                    type={inputConfig.type}
                    value={paymentStore.customerData[inputConfig.name] ?? ""}
                  />
                </InputField>
              ))}
            </Inputs>
            <Checkboxes>
              {PAYMENT_CHECKBOXES.map((checkboxConfig) => (
                <Checkbox
                  key={checkboxConfig.name}
                  checked={paymentStore.agreements[checkboxConfig.name]}
                  name={checkboxConfig.formName}
                  onChange={handleAgreementChange(checkboxConfig.name)}
                  placeholder={
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
                      : t(checkboxConfig.placeholderKey)
                  }
                />
              ))}
            </Checkboxes>
          </PersonalData>
          <StripeReveal $isVisible={paymentStore.canShowStripe}>
            <StripePaymentTabs
              key={paymentStore.selectedCurrency}
              allPaymentIntentIds={Object.values(paymentStore.stripePaymentIntentIds)}
              billingCountry={paymentStore.customerData.country}
              billingEmail={paymentStore.customerData.email}
              billingName={paymentStore.customerData.fullName.trim()}
              billingAddressLine1={paymentStore.customerData.address}
              billingCity={paymentStore.customerData.city}
              billingPostalCode={paymentStore.customerData.postalCode}
              checkoutSessionId={paymentStore.checkoutSessionId}
              clientSecret={
                paymentStore.stripeClientSecrets?.[paymentStore.selectedCurrency] ?? ""
              }
              paymentIntentId={
                paymentStore.stripePaymentIntentIds?.[paymentStore.selectedCurrency] ?? ""
              }
              resultCurrency={paymentStore.selectedCurrency}
              resultOfferId={paymentStore.selectedOfferId}
              resultProductId={paymentStore.selectedProductId}
            />
          </StripeReveal>
        </FormBox>
      </InteractiveBox>
      <SummaryBoxDesktop>{interactiveCardDesktopComponent}</SummaryBoxDesktop>
    </PaymentSection>
  );
});

export default PaymentPage;
