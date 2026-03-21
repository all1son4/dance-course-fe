"use client";

import { observer } from "mobx-react-lite";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent, FocusEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import {
  Checkbox,
  CurrencySwitch,
  Input,
  InteractiveCard,
  StripePaymentTabs,
} from "@/components";
import {
  type CountryOption,
  getFallbackCountryOptions,
  getLocalizedCountryOptions,
} from "@/constants/countries";
import {
  formatCheckoutPrice,
  getDefaultCheckoutCurrencyByLocale,
  getResolvedCheckoutCurrency,
  type SupportedCheckoutCurrency,
} from "@/constants/sellable-products";
import { usePaymentStore } from "@/stores";

import {
  AdditionalNotification,
  AgreementLink,
  Checkboxes,
  CurrencyBox,
  FormBox,
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

const getCompactSummaryTitle = (fullTitle: string) => {
  const quotedNameMatch = fullTitle.match(/["“”«»]([^"“”«»]+)["“”«»]/u);

  return quotedNameMatch?.[1]?.trim() || fullTitle;
};

const PaymentPage = observer(function PaymentPage() {
  const paymentStore = usePaymentStore();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const t = useTranslations("PaymentPage");
  const productT = useTranslations("SellableProducts");
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>(
    getFallbackCountryOptions,
  );
  const hasAppliedCurrencyFromQuery = useRef(false);
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

  useEffect(() => {
    document.body.removeAttribute("data-hide-footer");
  }, []);

  useEffect(() => {
    paymentStore.setValidationLocale(locale);
    paymentStore.initializeCheckoutCurrency(getDefaultCheckoutCurrencyByLocale(locale));
  }, [locale, paymentStore]);

  useEffect(() => {
    setCountryOptions(getLocalizedCountryOptions(locale));
  }, [locale]);

  useEffect(() => {
    paymentStore.configureCheckoutSelection({
      offerId: searchParams.get("offer"),
      productId: searchParams.get("product"),
    });
  }, [paymentStore, searchParams]);

  useEffect(() => {
    if (hasAppliedCurrencyFromQuery.current) {
      return;
    }

    hasAppliedCurrencyFromQuery.current = true;
    const queryCurrency = searchParams.get("currency");

    if (!queryCurrency) {
      return;
    }

    const nextCurrency = getResolvedCheckoutCurrency(queryCurrency);
    paymentStore.setSelectedCurrency(nextCurrency);
  }, [paymentStore, searchParams]);

  useEffect(() => {
    if (!paymentStore.canShowStripe) {
      return;
    }

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
                <Input
                  key={inputConfig.name}
                  errorMessage={paymentStore.customerErrors[inputConfig.name] ?? ""}
                  id={inputConfig.id}
                  label={t(inputConfig.labelKey)}
                  name={inputConfig.name}
                  onBlur={handleInputBlur}
                  onChange={handleInputChange}
                  placeholder={t(inputConfig.placeholderKey)}
                  selectOptions={getInputSelectOptions(inputConfig.name)}
                  type={inputConfig.type}
                  value={paymentStore.customerData[inputConfig.name]}
                />
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
