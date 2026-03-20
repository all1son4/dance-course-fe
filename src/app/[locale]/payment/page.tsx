"use client";

import { observer } from "mobx-react-lite";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent, FocusEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import styled from "styled-components";

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
import { Link } from "@/i18n/navigation";
import { usePaymentStore } from "@/stores";
import { glass } from "@/styles/mixins/glass";

import {
  PAYMENT_CHECKBOXES,
  PAYMENT_INPUTS,
  PAYMENT_LESSON_LANGUAGE_OPTIONS,
  type PaymentAgreementFieldName,
  type PaymentCustomerFieldName,
} from "./payment.constants";

const PaymentSection = styled.section`
  display: flex;
  align-items: flex-start;
  gap: 20px;
  padding: 0;
  box-sizing: border-box;
  width: 100%;
  max-width: 1240px;
  justify-content: space-between;
  margin: 200px auto 100px;
  position: relative;

  @media (max-width: 1024px) {
    padding: 0 20px;
  }

  @media (max-width: 920px) {
    flex-direction: column;
    margin: 130px auto 80px;
  }

  @media (max-width: 767px) {
    margin: 100px auto 60px;
  }
`;

const InteractiveBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 50px;
  width: 100%;
  max-width: 660px;
  min-width: 0;
  position: relative;

  @media (max-width: 920px) {
    max-width: 100%;
    gap: 30px;
  }
`;

const TextBox = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 40px;

  @media (max-width: 920px) {
    gap: 20px;
  }
`;

const PaymentTitle = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 767px) {
    font-size: 50px;
  }
`;

const PaymentDescription = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  color: rgba(72, 72, 72, 1);
  margin: 0;

  @media (max-width: 767px) {
    font-size: 15px;
  }
`;

const FormBox = styled.form`
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
`;

const PersonalData = styled.div`
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 40px;
  width: 100%;
  padding: 50px;
  box-sizing: border-box;

  ${glass({
    radius: "60px",
  })}

  @media (max-width: 767px) {
    gap: 30px;
    padding: 30px 20px;
    border-radius: 40px !important;
  }
`;

const StripeReveal = styled.div<{ $isVisible: boolean }>`
  position: relative;
  z-index: 1;
  padding-top: ${({ $isVisible }) => ($isVisible ? "20px" : "0")};
  width: 100%;
  min-width: 0;
  overflow: ${({ $isVisible }) => ($isVisible ? "unset" : "hidden")};
  max-height: ${({ $isVisible }) => ($isVisible ? "920px" : "0")};
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  transform: translateY(${({ $isVisible }) => ($isVisible ? "0" : "-18px")});
  pointer-events: ${({ $isVisible }) => ($isVisible ? "auto" : "none")};
  transition:
    padding-top 0.45s ease,
    max-height 0.45s ease,
    opacity 0.16s ease,
    transform 0.45s ease;

  @media (max-width: 767px) {
    max-height: ${({ $isVisible }) => ($isVisible ? "1240px" : "0")};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    transform: none;
  }
`;

const PersonalDataTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 28px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

const Inputs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 22px;
  width: 100%;

  @media (max-width: 767px) {
    gap: 20px;
  }
`;

const Checkboxes = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
`;

const SummaryBoxDesktop = styled.div`
  display: flex;
  width: 100%;
  max-width: 480px;
  height: fit-content;
  position: sticky;
  top: 200px;
  right: 0;

  @media (max-width: 1140px) {
    max-width: 420px;
  }

  @media (max-width: 1024px) {
    max-width: 400px;
  }

  @media (max-width: 920px) {
    display: none;
  }
`;

const SummaryBoxMobile = styled.div`
  display: none;
  width: 100%;
  max-width: 100%;

  @media (max-width: 920px) {
    display: flex;
  }

  @media (max-width: 767px) {
    position: sticky;
    top: 86px;
    z-index: 30;
  }
`;

const SummaryTopContent = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const SummaryBoxParahraphs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  margin: 0 0 40px 0;

  & p {
    font-weight: 300;
    font-style: normal;
    font-size: 17px;
    line-height: 150%;
    letter-spacing: 0;
    margin: 0;
    color: rgba(72, 72, 72, 1);
  }
`;

const SummaryBottomContent = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  width: 100%;

  @media (max-width: 365px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const CurrencyBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
`;

const MoneyTitle = styled.p`
  font-weight: 500;
  font-style: normal;
  font-size: 15px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);
`;

const PriceBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;

  @media (max-width: 365px) {
    align-items: flex-start;
  }
`;

const Price = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 36px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 767px) {
    font-size: 30px;
  }
`;

const AdditionalNotification = styled.div`
  font-weight: 600;
  font-style: normal;
  font-size: 17px;
  line-height: 140%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);

  @media (max-width: 767px) {
    font-size: 15px;
  }
`;

const AgreementLink = styled(Link)`
  text-decoration: underline;
  text-underline-offset: 2px;
  color: rgba(72, 72, 72, 1);
  transition: color 0.2s ease;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: #000000;
    }
  }
`;

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
      title={productT(paymentStore.selectedProduct.titleKey)}
      topRowContent={summaryTopContent}
      bottomRowContent={summaryBottomContent}
    />
  );

  const interactiveCardMobileComponent = (
    <InteractiveCard
      title={productT(paymentStore.selectedProduct.titleKey)}
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
              errorMessage={
                paymentStore.stripeIntentErrors?.[paymentStore.selectedCurrency] ?? null
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
