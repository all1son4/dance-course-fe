"use client";

import { observer } from "mobx-react-lite";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent, FocusEvent, FormEvent } from "react";
import { useEffect } from "react";
import styled from "styled-components";

import {
  Checkbox,
  CurrencySwitch,
  Input,
  InteractiveCard,
  StripePaymentTabs,
} from "@/components";
import {
  formatCheckoutPrice,
  getDefaultCheckoutCurrencyByLocale,
  type SupportedCheckoutCurrency,
} from "@/constants/sellable-products";
import { usePaymentStore } from "@/stores";
import { glass } from "@/styles/mixins/glass";

import {
  PAYMENT_CHECKBOXES,
  PAYMENT_INPUTS,
  type PaymentAgreementFieldName,
  type PaymentCustomerFieldName,
} from "./payment.constants";

const SUPPORTED_CURRENCIES: SupportedCheckoutCurrency[] = ["pln", "eur"];

const PaymentSection = styled.section`
  display: flex;
  gap: 20px;
  padding: 0;
  box-sizing: border-box;
  width: 100%;
  max-width: 1240px;
  justify-content: space-between;
  margin: 200px auto 100px;
  position: relative;
`;

const InteractiveBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 50px;
  width: 100%;
  max-width: 660px;
  min-width: 0;
`;

const TextBox = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 40px;
`;

const PaymentTitle = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

const PaymentDescription = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  color: rgba(72, 72, 72, 1);
  margin: 0;
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
`;

const StripeReveal = styled.div<{ $isVisible: boolean }>`
  position: relative;
  z-index: 1;
  padding-top: 20px;
  width: 100%;
  min-width: 0;
  max-height: ${({ $isVisible }) => ($isVisible ? "920px" : "0")};
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  transform: translateY(${({ $isVisible }) => ($isVisible ? "0" : "-18px")});
  pointer-events: ${({ $isVisible }) => ($isVisible ? "auto" : "none")};
  transition:
    max-height 0.45s ease,
    opacity 0.16s ease,
    transform 0.45s ease;

  @media (max-width: 767px) {
    max-height: ${({ $isVisible }) => ($isVisible ? "1240px" : "0")};
  }
`;

const StripePanels = styled.div`
  display: grid;
  width: 100%;
`;

const StripePanel = styled.div<{ $isActive: boolean }>`
  grid-area: 1 / 1;
  width: 100%;
  opacity: ${({ $isActive }) => ($isActive ? 1 : 0)};
  pointer-events: ${({ $isActive }) => ($isActive ? "auto" : "none")};
  visibility: ${({ $isActive }) => ($isActive ? "visible" : "hidden")};
  transition: opacity 0.18s ease;
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
`;

const Checkboxes = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
`;

const SummaryBox = styled.div`
  display: flex;
  width: 100%;
  max-width: 480px;
  height: fit-content;
  position: sticky;
  top: 200px;
  right: 0;
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
  margin: 0 0 40px;

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
  gap: 26px;
  width: 100%;
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
`;

const Price = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 36px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

const AdditionalNotification = styled.div`
  font-weight: 600;
  font-style: normal;
  font-size: 17px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);
`;

const PaymentPage = observer(function PaymentPage() {
  const paymentStore = usePaymentStore();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const t = useTranslations("PaymentPage");
  const productT = useTranslations("SellableProducts");

  useEffect(() => {
    paymentStore.initializeCheckoutCurrency(getDefaultCheckoutCurrencyByLocale(locale));
  }, [locale, paymentStore]);

  useEffect(() => {
    paymentStore.configureCheckoutSelection({
      offerId: searchParams.get("offer"),
      productId: searchParams.get("product"),
    });
  }, [paymentStore, searchParams]);

  useEffect(() => {
    if (paymentStore.canShowStripe) {
      SUPPORTED_CURRENCIES.forEach((currency) => {
        void paymentStore.ensureStripePaymentIntent(currency);
      });
    }
  }, [
    paymentStore,
    paymentStore.canShowStripe,
    paymentStore.selectedOfferId,
    paymentStore.selectedProductId,
    paymentStore.selectedCurrency,
  ]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    paymentStore.setCustomerField(
      event.target.name as PaymentCustomerFieldName,
      event.target.value,
    );
  };

  const handleInputBlur = (event: FocusEvent<HTMLInputElement>) => {
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

  return (
    <PaymentSection>
      <InteractiveBox>
        <TextBox>
          <PaymentTitle>{t("title")}</PaymentTitle>
          <PaymentDescription>{t("description")}</PaymentDescription>
        </TextBox>
        <FormBox onSubmit={handleSubmit}>
          <PersonalData>
            <PersonalDataTitle>{t("personalDataTitle")}</PersonalDataTitle>
            <Inputs>
              {PAYMENT_INPUTS.map((inputConfig) => (
                <Input
                  key={inputConfig.name}
                  errorMessage={paymentStore.customerErrors[inputConfig.name] ?? ""}
                  id={inputConfig.id}
                  label={t(inputConfig.labelKey)}
                  name={inputConfig.name}
                  onBlur={handleInputBlur}
                  onChange={handleInputChange}
                  placeholder={t(inputConfig.placeholderKey)}
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
                  placeholder={t(checkboxConfig.placeholderKey)}
                />
              ))}
            </Checkboxes>
          </PersonalData>
          <StripeReveal $isVisible={paymentStore.canShowStripe}>
            <StripePanels>
              {SUPPORTED_CURRENCIES.map((currency) => (
                <StripePanel
                  key={currency}
                  $isActive={paymentStore.selectedCurrency === currency}
                >
                  <StripePaymentTabs
                    billingEmail={paymentStore.customerData.email}
                    billingName={`${paymentStore.customerData.name} ${paymentStore.customerData.lastName}`.trim()}
                    clientSecret={paymentStore.getStripeClientSecret(currency)}
                    errorMessage={paymentStore.getStripeIntentError(currency)}
                  />
                </StripePanel>
              ))}
            </StripePanels>
          </StripeReveal>
        </FormBox>
      </InteractiveBox>
      <SummaryBox>
        <InteractiveCard
          title={productT(paymentStore.selectedProduct.titleKey)}
          topRowContent={
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
          }
          bottomRowContent={
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
                  {formatCheckoutPrice(
                    paymentStore.selectedPrice,
                    paymentStore.selectedCurrency,
                  )}
                </Price>
              </PriceBox>
            </SummaryBottomContent>
          }
        />
      </SummaryBox>
    </PaymentSection>
  );
});

export default PaymentPage;
