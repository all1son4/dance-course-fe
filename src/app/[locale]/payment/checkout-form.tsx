import type { ChangeEvent, FocusEvent, FormEvent, KeyboardEvent, ReactNode } from "react";
import { useId, useState } from "react";

import Button from "@/components/common/Button";
import Checkbox from "@/components/common/Checkbox";
import Input from "@/components/common/Input";
import StripePaymentTabs, {
  type StripePaymentTabsProps,
} from "@/components/other/StripePaymentTabs";

import {
  Checkboxes,
  type CheckoutStepState,
  ConsentBox,
  ConsentList,
  ConsentListReveal,
  ConsentToggle,
  FormBox,
  InputField,
  Inputs,
  PaymentLocked,
  PaymentLockedIcon,
  PaymentLockedText,
  PaymentPreparationError,
  PersonalData,
  StepActions,
  StepBody,
  StepBodyContent,
  StepDot,
  StepEdit,
  StepHeader,
  StepHeading,
  StepMeta,
  StepSection,
  StepSummary,
  StepTitle,
  StripeReveal,
  StripeRevealContent,
  TelegramInputControl,
  TelegramInputStatus,
  TelegramVerifyButton,
} from "./page.styles";
import {
  normalizeTelegramNickname,
  type PaymentAgreementFieldName,
  type PaymentFieldStep,
  type PaymentStep,
} from "./payment.constants";
import {
  type CheckoutAgreement,
  type CheckoutInputField,
  isRenewalInputDisabled,
  isTelegramVerificationDisabled,
  type RenewalStatus,
  type RenewalStatusTone,
} from "./payment.helpers";

/** Anchors the step buttons move the buyer to. */
export const CHECKOUT_CONSENT_ID = "checkout-accept-all";
export const CHECKOUT_PAYMENT_ID = "checkout-payment";
export const getCheckoutStepId = (stepId: PaymentStep) => `checkout-step-${stepId}`;

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

const StepCheckIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <path
      d="M5 12.5l4.5 4.5L19 7.5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
    />
  </svg>
);

const LockIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <rect
      x="5"
      y="10.5"
      width="14"
      height="10"
      rx="3"
      stroke="currentColor"
      strokeWidth="1.7"
    />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <path
      d="M7 10l5 5 5-5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  </svg>
);

export type CheckoutStepView = {
  canContinue: boolean;
  id: PaymentStep;
  isOpen: boolean;
  meta: string;
  number: number;
  state: CheckoutStepState;
  /** What a finished step holds, shown while it is folded ("email · @handle"). */
  summary: string;
  title: string;
};

type CheckoutStepHeaderProps = {
  editLabel: string;
  onEdit: () => void;
  step: CheckoutStepView;
};

const CheckoutStepHeader = ({ editLabel, onEdit, step }: CheckoutStepHeaderProps) => {
  const isFoldedDone = step.state === "done" && !step.isOpen;

  return (
    <StepHeader>
      <StepDot $state={step.state} aria-hidden="true">
        {step.state === "done" ? <StepCheckIcon /> : step.number}
      </StepDot>
      <StepHeading>
        <StepTitle $state={step.state}>{step.title}</StepTitle>
        {isFoldedDone && step.summary ? <StepSummary>{step.summary}</StepSummary> : null}
      </StepHeading>
      {isFoldedDone ? (
        <StepEdit onClick={onEdit} type="button">
          {editLabel}
        </StepEdit>
      ) : step.isOpen && step.meta ? (
        <StepMeta>{step.meta}</StepMeta>
      ) : null}
    </StepHeader>
  );
};

export type CheckoutFormField = CheckoutInputField & {
  hint?: ReactNode;
  isComplete: boolean;
  step: PaymentFieldStep;
};

type CheckoutInputProps = {
  field: CheckoutFormField;
  isRenewalCheckout: boolean;
  isRenewalVerified: boolean;
  onBlur: (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onFocus: (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onVerify: () => void | Promise<void>;
  renewalClientId: string;
  renewalNonce: string;
  renewalStatus: RenewalStatus;
  renewalStatusText: ReactNode;
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
  const isNickname = field.name === "nickname";
  const isRenewalNickname = isNickname && isRenewalCheckout;
  const inputNode = (
    <Input
      autoComplete={field.autoComplete}
      enterKeyHint={field.enterKeyHint}
      errorMessage={field.errorMessage}
      // On a renewal the status line below the handle speaks for it.
      hint={isRenewalNickname ? undefined : field.hint}
      id={field.id}
      inputMode={field.inputMode ?? "text"}
      // The verify button owns the end of the renewal handle field.
      isComplete={field.isComplete && !isRenewalNickname}
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
      // The "@" is drawn in front of the handle, so the value shows without it.
      prefix={isNickname ? "@" : undefined}
      selectOptions={field.selectOptions}
      type={field.type}
      value={isNickname ? field.value.replace(/^@+/, "") : field.value}
    />
  );

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

export type CheckoutConsentCopy = {
  acceptAll: ReactNode;
  hideAll: string;
  showAll: string;
};

export type CheckoutPaymentLockedCopy = {
  text: string;
  title: string;
};

export type CheckoutFormProps = {
  agreements: CheckoutAgreement[];
  canRevealStripe: boolean;
  consentCopy: CheckoutConsentCopy;
  fields: CheckoutFormField[];
  /** Stripe is confirming the payment: the details it was minted for are frozen. */
  isPersonalDataLocked: boolean;
  isRenewalCheckout: boolean;
  isRenewalVerified: boolean;
  onAcceptAllChange: (isAccepted: boolean) => void;
  onAgreementChange: (
    fieldName: PaymentAgreementFieldName,
    event: ChangeEvent<HTMLInputElement>,
  ) => void;
  onInputBlur: (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onInputChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onInputFocus: (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onVerify: () => void | Promise<void>;
  paymentLockedCopy: CheckoutPaymentLockedCopy;
  renewalClientId: string;
  renewalNonce: string;
  renewalStatus: RenewalStatus;
  renewalStatusText: ReactNode;
  renewalStatusTone: RenewalStatusTone;
  /** Re-asks for the payment intent after a failure; absent when there is nothing to retry. */
  onRetryPaymentPreparation?: () => void;
  retryLabel: string;
  onStepContinue: (stepId: PaymentStep) => void;
  onStepEdit: (stepId: PaymentStep) => void;
  stepCopy: { continue: string; edit: string };
  steps: CheckoutStepView[];
  stripeIntentErrorText: string;
  stripeProps: StripePaymentTabsProps;
  verifyLabel: string;
};

export const CheckoutForm = ({
  agreements,
  canRevealStripe,
  consentCopy,
  fields,
  isPersonalDataLocked,
  isRenewalCheckout,
  isRenewalVerified,
  onAcceptAllChange,
  onAgreementChange,
  onInputBlur,
  onInputChange,
  onInputFocus,
  onSubmit,
  onVerify,
  paymentLockedCopy,
  renewalClientId,
  renewalNonce,
  renewalStatus,
  renewalStatusText,
  renewalStatusTone,
  onRetryPaymentPreparation,
  retryLabel,
  onStepContinue,
  onStepEdit,
  stepCopy,
  steps,
  stripeIntentErrorText,
  stripeProps,
  verifyLabel,
}: CheckoutFormProps) => {
  const [isConsentListOpen, setIsConsentListOpen] = useState(false);
  const consentListId = useId();
  const areAllAgreementsAccepted = agreements.every((agreement) => agreement.checked);
  const areAgreementsDisabled = agreements.some((agreement) => agreement.disabled);
  const renderInput = (field: CheckoutFormField) => (
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
  );
  // Enter walks through the open step: to its next field, and from the last
  // one it continues like the step's button. The form has no submit button,
  // so the browser would otherwise do nothing at all.
  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    const target = event.target;
    const openStep = steps.find((step) => step.isOpen);

    if (
      event.key !== "Enter" ||
      event.nativeEvent.isComposing ||
      !openStep ||
      openStep.id === "payment" ||
      !(target instanceof HTMLInputElement) ||
      target.type === "checkbox"
    ) {
      return;
    }

    event.preventDefault();

    const stepFieldIds = fields
      .filter((field) => field.step === openStep.id)
      .map((field) => field.id);
    const nextFieldId =
      stepFieldIds[stepFieldIds.indexOf(target.id as (typeof stepFieldIds)[number]) + 1];

    if (nextFieldId) {
      document.getElementById(nextFieldId)?.focus();
      return;
    }

    onStepContinue(openStep.id);
  };

  return (
    <FormBox onKeyDown={handleKeyDown} onSubmit={onSubmit}>
      <PersonalData
        aria-busy={isPersonalDataLocked || undefined}
        disabled={isPersonalDataLocked}
      >
        {steps.map((step) => (
          <StepSection
            key={step.id}
            aria-label={step.title}
            id={getCheckoutStepId(step.id)}
            $isOpen={step.isOpen}
          >
            <CheckoutStepHeader
              editLabel={stepCopy.edit}
              onEdit={() => onStepEdit(step.id)}
              step={step}
            />
            {/* One step is open at a time; the others stay folded but in the
                form, so the draft, validation and autofill still see them. */}
            <StepBody $isOpen={step.isOpen}>
              <StepBodyContent $isOpen={step.isOpen} inert={!step.isOpen}>
                {step.id === "payment" ? (
                  <ConsentBox>
                    {/* One box for the whole set: it ticks every agreement, and
                    each of them is still recorded on its own, as before. */}
                    <Checkbox
                      checked={areAllAgreementsAccepted}
                      disabled={areAgreementsDisabled}
                      name={CHECKOUT_CONSENT_ID}
                      onChange={(event) => onAcceptAllChange(event.target.checked)}
                      placeholder={consentCopy.acceptAll}
                    />
                    <ConsentToggle
                      aria-controls={consentListId}
                      aria-expanded={isConsentListOpen}
                      onClick={() => setIsConsentListOpen((isOpen) => !isOpen)}
                      type="button"
                    >
                      {isConsentListOpen ? consentCopy.hideAll : consentCopy.showAll}
                      <ChevronDownIcon />
                    </ConsentToggle>
                    <ConsentListReveal $isOpen={isConsentListOpen} id={consentListId}>
                      <div inert={!isConsentListOpen}>
                        <ConsentList>
                          <Checkboxes>
                            {agreements.map((agreement) => (
                              <Checkbox
                                key={agreement.name}
                                checked={agreement.checked}
                                disabled={agreement.disabled}
                                name={agreement.formName}
                                onChange={(event) =>
                                  onAgreementChange(agreement.name, event)
                                }
                                placeholder={agreement.placeholder}
                              />
                            ))}
                          </Checkboxes>
                        </ConsentList>
                      </div>
                    </ConsentListReveal>
                  </ConsentBox>
                ) : (
                  <>
                    <Inputs>
                      {fields.filter((field) => field.step === step.id).map(renderInput)}
                    </Inputs>
                    {step.canContinue ? (
                      <StepActions>
                        <Button
                          analytics={{
                            id: `checkout_step_${step.id}_continue`,
                            placement: "checkout",
                          }}
                          buttonText={stepCopy.continue}
                          onClick={() => onStepContinue(step.id)}
                          size="sm"
                          type="button"
                          width="fit-content"
                        />
                      </StepActions>
                    ) : null}
                  </>
                )}
              </StepBodyContent>
            </StepBody>
          </StepSection>
        ))}
      </PersonalData>
      {stripeIntentErrorText ? (
        <PaymentPreparationError role="alert">
          <p>{stripeIntentErrorText}</p>
          {/* Without this the message asks the buyer to try again with nothing
              to press: the request only re-runs when a form field changes. */}
          {onRetryPaymentPreparation ? (
            <Button
              analytics={{ id: "payment_preparation_retry", placement: "checkout" }}
              buttonText={retryLabel}
              onClick={onRetryPaymentPreparation}
              size="sm"
              type="button"
              variant="secondary"
              width="fit-content"
            />
          ) : null}
        </PaymentPreparationError>
      ) : null}
      <div id={CHECKOUT_PAYMENT_ID}>
        {/* The card below is empty until the form is complete; this stands in
            its place so the payment step is on the page from the start. */}
        {!canRevealStripe && !stripeIntentErrorText ? (
          <PaymentLocked>
            <PaymentLockedIcon>
              <LockIcon />
            </PaymentLockedIcon>
            <PaymentLockedText>
              <b>{paymentLockedCopy.title}</b>
              <p>{paymentLockedCopy.text}</p>
            </PaymentLockedText>
          </PaymentLocked>
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
      </div>
    </FormBox>
  );
};
