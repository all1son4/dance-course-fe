import type { ChangeEvent, FocusEvent, FormEvent } from "react";

import Checkbox from "@/components/common/Checkbox";
import Input from "@/components/common/Input";
import StripePaymentTabs, {
  type StripePaymentTabsProps,
} from "@/components/other/StripePaymentTabs";

import {
  Checkboxes,
  FormBox,
  InputField,
  Inputs,
  PaymentPreparationError,
  PersonalData,
  PersonalDataTitle,
  StripeReveal,
  StripeRevealContent,
  TelegramInputControl,
  TelegramInputStatus,
  TelegramVerifyButton,
} from "./page.styles";
import {
  normalizeTelegramNickname,
  type PaymentAgreementFieldName,
} from "./payment.constants";
import {
  type CheckoutAgreement,
  type CheckoutInputField,
  isRenewalInputDisabled,
  isTelegramVerificationDisabled,
  type RenewalStatus,
  type RenewalStatusTone,
} from "./payment.helpers";

const TelegramPlaneIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <path
      d="M20.6 4.4 3.9 10.9c-1.1.4-1.1 1.1-.2 1.4l4.3 1.3 1.6 5c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.1-2 4.4 3.2c.8.4 1.3.2 1.5-.8l2.7-12.7c.3-1.2-.4-1.7-1.4-1.2Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    />
    <path
      d="m8 13.6 9.8-6.1-7.6 7.3"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    />
  </svg>
);

type CheckoutInputProps = {
  field: CheckoutInputField;
  isRenewalCheckout: boolean;
  isRenewalVerified: boolean;
  onBlur: (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onFocus: (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onVerify: () => void | Promise<void>;
  renewalClientId: string;
  renewalNonce: string;
  renewalStatus: RenewalStatus;
  renewalStatusText: string;
  renewalStatusTone: RenewalStatusTone;
  verifyLabel: string;
};

const CheckoutInput = ({
  field,
  isRenewalCheckout,
  isRenewalVerified,
  onBlur,
  onChange,
  onFocus,
  onVerify,
  renewalClientId,
  renewalNonce,
  renewalStatus,
  renewalStatusText,
  renewalStatusTone,
  verifyLabel,
}: CheckoutInputProps) => {
  const inputNode = (
    <Input
      autoComplete={field.autoComplete}
      enterKeyHint={field.enterKeyHint}
      errorMessage={field.errorMessage}
      id={field.id}
      inputMode={field.inputMode ?? "text"}
      label={field.label}
      name={field.name}
      disabled={isRenewalInputDisabled({
        fieldName: field.name,
        isRenewalCheckout,
        isRenewalVerified,
        renewalStatus,
      })}
      onBlur={onBlur}
      onChange={onChange}
      onFocus={onFocus}
      placeholder={field.placeholder}
      selectOptions={field.selectOptions}
      type={field.type}
      value={field.value}
    />
  );
  const isRenewalNickname = field.name === "nickname" && isRenewalCheckout;

  return (
    <InputField $layout={field.layout ?? "full"}>
      {isRenewalNickname ? (
        <>
          <TelegramInputControl $status={renewalStatus}>
            {inputNode}
            <TelegramVerifyButton
              aria-label={verifyLabel}
              disabled={isTelegramVerificationDisabled({
                clientId: renewalClientId,
                // The field holds the handle as typed until blur; the button
                // judges the form it will take.
                nickname: normalizeTelegramNickname(field.value),
                nonce: renewalNonce,
                status: renewalStatus,
              })}
              onClick={onVerify}
              title={verifyLabel}
              type="button"
              $isVerified={renewalStatus === "verified"}
            >
              <TelegramPlaneIcon />
            </TelegramVerifyButton>
          </TelegramInputControl>
          {renewalStatusText && (
            <TelegramInputStatus $tone={renewalStatusTone}>
              {renewalStatusText}
            </TelegramInputStatus>
          )}
        </>
      ) : (
        inputNode
      )}
    </InputField>
  );
};

export type CheckoutFormProps = {
  agreements: CheckoutAgreement[];
  canRevealStripe: boolean;
  fields: CheckoutInputField[];
  /** Stripe is confirming the payment: the details it was minted for are frozen. */
  isPersonalDataLocked: boolean;
  isRenewalCheckout: boolean;
  isRenewalVerified: boolean;
  onAgreementChange: (
    fieldName: PaymentAgreementFieldName,
    event: ChangeEvent<HTMLInputElement>,
  ) => void;
  onInputBlur: (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onInputChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onInputFocus: (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onVerify: () => void | Promise<void>;
  personalDataTitle: string;
  renewalClientId: string;
  renewalNonce: string;
  renewalStatus: RenewalStatus;
  renewalStatusText: string;
  renewalStatusTone: RenewalStatusTone;
  stripeIntentErrorText: string;
  stripeProps: StripePaymentTabsProps;
  verifyLabel: string;
};

export const CheckoutForm = ({
  agreements,
  canRevealStripe,
  fields,
  isPersonalDataLocked,
  isRenewalCheckout,
  isRenewalVerified,
  onAgreementChange,
  onInputBlur,
  onInputChange,
  onInputFocus,
  onSubmit,
  onVerify,
  personalDataTitle,
  renewalClientId,
  renewalNonce,
  renewalStatus,
  renewalStatusText,
  renewalStatusTone,
  stripeIntentErrorText,
  stripeProps,
  verifyLabel,
}: CheckoutFormProps) => (
  <FormBox onSubmit={onSubmit}>
    <PersonalData
      aria-busy={isPersonalDataLocked || undefined}
      disabled={isPersonalDataLocked}
    >
      <PersonalDataTitle>{personalDataTitle}</PersonalDataTitle>
      <Inputs>
        {fields.map((field) => (
          <CheckoutInput
            key={field.name}
            field={field}
            isRenewalCheckout={isRenewalCheckout}
            isRenewalVerified={isRenewalVerified}
            onBlur={onInputBlur}
            onChange={onInputChange}
            onFocus={onInputFocus}
            onVerify={onVerify}
            renewalClientId={renewalClientId}
            renewalNonce={renewalNonce}
            renewalStatus={renewalStatus}
            renewalStatusText={renewalStatusText}
            renewalStatusTone={renewalStatusTone}
            verifyLabel={verifyLabel}
          />
        ))}
      </Inputs>
      <Checkboxes>
        {agreements.map((agreement) => (
          <Checkbox
            key={agreement.name}
            checked={agreement.checked}
            disabled={agreement.disabled}
            name={agreement.formName}
            onChange={(event) => onAgreementChange(agreement.name, event)}
            placeholder={agreement.placeholder}
          />
        ))}
      </Checkboxes>
    </PersonalData>
    {stripeIntentErrorText ? (
      <PaymentPreparationError role="alert">
        {stripeIntentErrorText}
      </PaymentPreparationError>
    ) : null}
    <StripeReveal
      $isVisible={canRevealStripe}
      aria-hidden={!canRevealStripe}
      inert={!canRevealStripe}
    >
      {/* Not keyed on the currency: the mounted Elements stay on screen until
          the intent for the new currency is ready (see StripePaymentTabs). */}
      <StripeRevealContent $isVisible={canRevealStripe}>
        <StripePaymentTabs {...stripeProps} />
      </StripeRevealContent>
    </StripeReveal>
  </FormBox>
);
