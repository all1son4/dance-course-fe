"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { PaymentIntentResult, StripeElementsOptions } from "@stripe/stripe-js";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import Button from "@/components/common/Button";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import { trackAnalyticsEvent } from "@/lib/mixpanel-analytics";

import {
  createElementsOptions,
  createPaymentElementOptions,
  getStripeLocale,
  getStripePromise,
} from "./StripePaymentTabs.appearance";
import {
  cancelUnusedPaymentIntents,
  createResultPageUrl,
  PAYMENT_RESULT_PATHS,
  type PaymentCompletion,
  type PaymentRedirectCompletion,
  pollPaymentCompletion,
  redirectToResultPage,
  resolvePaymentCompletion,
  type ResultPageContext,
} from "./StripePaymentTabs.completion";
import {
  createPaymentForm,
  createStripeBillingDetails,
  getLoadingStatusTranslationKey,
  isPaymentSubmissionReady,
  type PaymentForm,
  resolveBillingDetails,
  resolveStripeErrorMessage,
  type StripePaymentFormProps,
} from "./StripePaymentTabs.helpers";
import {
  ActionFeedback,
  Actions,
  Card,
  Description,
  ErrorText,
  Header,
  LoadingAction,
  LoadingField,
  LoadingFieldRow,
  LoadingFooter,
  LoadingPulse,
  LoadingState,
  LoadingTab,
  LoadingTabs,
  PaymentElementShell,
  PaymentStage,
  StageLayer,
  type StageLayerRole,
  StatusLink,
  StatusText,
  Title,
} from "./StripePaymentTabs.styles";
import type { StripePaymentTabsProps } from "./StripePaymentTabs.types";

const PAYMENT_PREPARING_SLOW_THRESHOLD_MS = 8_000;
const PAYMENT_BUTTON_WIDTH = "240px";
const SKELETON_LAYER_KEY = "skeleton";

type StripePaymentElementsProps = {
  form: PaymentForm;
  paymentFormProps: Omit<
    StripePaymentFormProps,
    "isPayLocked" | "onPaymentElementReady" | "paymentIntentId"
  >;
  isPayLocked: boolean;
  onReady: (form: PaymentForm) => void;
  publishableKey: string;
  stripeLocale: StripeElementsOptions["locale"];
};

type PaymentLoadingStateProps = {
  statusText: string;
};

type PaymentActionsProps = {
  feedback: ReactNode;
  isDisabled: boolean;
  isSubmitting: boolean;
  isUpdating: boolean;
  onPayment: () => Promise<void>;
  payButtonText: string;
  processingText: string;
  updatingText: string;
};

type VerificationState = "idle" | "unresolved" | "verifying";

/** The visible form, plus an optional replacement warming up behind it. */
type StageLayerEntry = {
  form: PaymentForm | null;
  key: string;
  role: StageLayerRole;
};

const PaymentActions = ({
  feedback,
  isDisabled,
  isSubmitting,
  isUpdating,
  onPayment,
  payButtonText,
  processingText,
  updatingText,
}: PaymentActionsProps): ReactElement => (
  <Actions>
    <Button
      buttonText={payButtonText}
      loadingText={isSubmitting ? processingText : updatingText}
      disabled={isDisabled}
      isLoading={isSubmitting || isUpdating}
      onClick={onPayment}
      type="button"
      width={PAYMENT_BUTTON_WIDTH}
    />
    <ActionFeedback>{feedback}</ActionFeedback>
  </Actions>
);

const StripePaymentForm = (props: StripePaymentFormProps): ReactElement => {
  const {
    allPaymentIntentIds,
    checkoutSessionId,
    confirmPaymentFailedText,
    isPayLocked,
    isRenewalCheckout,
    onPaymentElementReady,
    onSubmittingChange,
    paymentIntentId,
    payButtonText,
    processingText,
    resultCurrency,
    resultOfferCode,
    resultOfferId,
    resultProductCode,
    resultProductId,
    resultValue,
    updatingText,
    verificationUnresolvedText,
    verifyingText,
  } = props;
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentElementOptions] = useState(() =>
    createPaymentElementOptions(
      props.billingAddressLine1,
      props.billingCity,
      props.billingCountry,
      props.billingEmail,
      props.billingName,
      props.billingPostalCode,
    ),
  );
  const [isPaymentElementReady, setIsPaymentElementReady] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationState>("idle");
  const isMountedRef = useRef(true);
  const onSubmittingChangeRef = useRef(onSubmittingChange);
  // Which instance holds the page-level lock. Several forms can be mounted at
  // once (a replaced one fading out, a replacement warming up); only the one
  // that locked the page may unlock it, and never once Stripe has accepted a
  // confirmation - the page stays locked until the result page takes over.
  const holdsPageLockRef = useRef(false);
  const isConfirmationAcceptedRef = useRef(false);
  const billingDetails = resolveBillingDetails(props);
  const resultPageContext: ResultPageContext = {
    checkoutSessionId,
    resultCurrency,
    resultOfferId,
    resultProductId,
  };
  const analyticsCurrency: "eur" | "pln" | undefined =
    resultCurrency === "eur" || resultCurrency === "pln" ? resultCurrency : undefined;
  const analyticsCommerceProperties = {
    ...(analyticsCurrency ? { currency: analyticsCurrency } : {}),
    is_renewal: Boolean(isRenewalCheckout),
    ...(resultOfferCode ? { offer_code: resultOfferCode } : {}),
    ...(resultOfferId ? { offer_id: resultOfferId } : {}),
    ...(resultProductCode ? { product_code: resultProductCode } : {}),
    ...(resultProductId ? { product_id: resultProductId } : {}),
    ...(typeof resultValue === "number" ? { value: resultValue } : {}),
  } as const;

  useEffect(() => {
    onSubmittingChangeRef.current = onSubmittingChange;
  }, [onSubmittingChange]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      // Should the form leave before Stripe has answered, the page must not
      // stay frozen. After an acceptance the lock is the whole point.
      if (holdsPageLockRef.current && !isConfirmationAcceptedRef.current) {
        holdsPageLockRef.current = false;
        onSubmittingChangeRef.current?.(false);
      }
    };
  }, []);

  useEffect(() => {
    if (isSubmitting === holdsPageLockRef.current) {
      return;
    }

    holdsPageLockRef.current = isSubmitting;
    onSubmittingChangeRef.current?.(isSubmitting);
  }, [isSubmitting]);

  const handlePaymentElementLoading = (): void => {
    setIsPaymentElementReady(false);
  };

  const handlePaymentElementReady = (): void => {
    setIsPaymentElementReady(true);
    onPaymentElementReady?.();
  };

  const finishOnResultPage = (completion: PaymentRedirectCompletion): void => {
    if (completion.cancelUnusedIntents && completion.paymentIntentId) {
      cancelUnusedPaymentIntents({
        allPaymentIntentIds,
        checkoutSessionId,
        usedPaymentIntentId: completion.paymentIntentId,
      });
    }

    // The button stays locked: navigation is under way.
    redirectToResultPage(
      completion.pathname,
      resultPageContext,
      completion.paymentIntentId,
    );
  };

  const handlePayment = async (): Promise<void> => {
    const submission = {
      elements,
      isPaymentElementReady,
      isSubmitting,
      stripe,
    };

    if (isPayLocked || !isPaymentSubmissionReady(submission)) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    void trackAnalyticsEvent("payment_attempted", analyticsCommerceProperties);

    let confirmation: PaymentIntentResult;

    try {
      confirmation = await submission.stripe.confirmPayment({
        elements: submission.elements,
        confirmParams: {
          payment_method_data: {
            billing_details: createStripeBillingDetails(billingDetails),
          },
          return_url: createResultPageUrl(
            PAYMENT_RESULT_PATHS.success,
            resultPageContext,
            paymentIntentId ?? undefined,
          ),
        },
        redirect: "if_required",
      });
    } catch {
      // Stripe.js failed before it could submit anything, so trying again is safe.
      void trackAnalyticsEvent("payment_failed", {
        ...analyticsCommerceProperties,
        failure_stage: "exception",
      });
      setSubmitError(confirmPaymentFailedText);
      setIsSubmitting(false);
      return;
    }

    const isPastConfirmation =
      confirmation.error?.type === "api_connection_error" ||
      confirmation.error?.code === "payment_intent_unexpected_state";

    if (confirmation.error && !isPastConfirmation) {
      void trackAnalyticsEvent("payment_failed", {
        ...analyticsCommerceProperties,
        failure_stage: "confirmation",
      });
      // The Payment Element shows card and validation errors inline, under the
      // field they belong to; repeating them under the button read as two
      // errors. Everything else has no inline home, so it is shown here.
      const isShownInline =
        confirmation.error.type === "card_error" ||
        confirmation.error.type === "validation_error";
      setSubmitError(
        isShownInline
          ? null
          : resolveStripeErrorMessage(
              confirmation.error.message,
              confirmPaymentFailedText,
            ),
      );
      setIsSubmitting(false);
      return;
    }

    // Stripe has accepted the confirmation (or the answer was lost on the way
    // back, or the intent is already past this step): from here the button
    // never unlocks again, whatever the status endpoint says or fails to say.
    // A second tap could only ever mean a second charge. The verification
    // below runs to its end even if this form is unmounted meanwhile: the
    // redirect is what tells the customer how the payment ended.
    isConfirmationAcceptedRef.current = true;
    let completion: PaymentCompletion | null = null;

    try {
      completion = await resolvePaymentCompletion({
        checkoutSessionId,
        fallbackPaymentIntentId: paymentIntentId,
        paymentIntent: confirmation.paymentIntent,
      });
    } catch {
      // The first probe gave up; the follow-up below keeps asking.
    }

    if (completion?.kind === "redirect") {
      finishOnResultPage(completion);
      return;
    }

    if (isMountedRef.current) {
      setVerification("verifying");
    }

    const verificationResult = await pollPaymentCompletion({
      checkoutSessionId,
      paymentIntentId: confirmation.paymentIntent?.id ?? paymentIntentId,
      shouldContinue: () => true,
    });

    if (verificationResult.kind === "redirect") {
      finishOnResultPage(verificationResult);
      return;
    }

    if (isMountedRef.current) {
      setVerification("unresolved");
    }
  };

  const feedback = submitError ? (
    <ErrorText role="alert" aria-live="assertive" aria-atomic="true">
      {submitError}
    </ErrorText>
  ) : verification === "verifying" ? (
    <StatusText role="status" aria-live="polite" aria-atomic="true">
      {verifyingText}
    </StatusText>
  ) : verification === "unresolved" ? (
    <StatusText role="status" aria-live="polite" aria-atomic="true">
      {verificationUnresolvedText}
    </StatusText>
  ) : null;

  return (
    <div>
      <PaymentElementShell>
        <PaymentElement
          options={paymentElementOptions}
          onLoaderStart={handlePaymentElementLoading}
          onReady={handlePaymentElementReady}
        />
      </PaymentElementShell>
      <PaymentActions
        feedback={feedback}
        isDisabled={
          isPayLocked ||
          !isPaymentSubmissionReady({
            elements,
            isPaymentElementReady,
            isSubmitting,
            stripe,
          })
        }
        isSubmitting={isSubmitting}
        isUpdating={isPayLocked && !isSubmitting}
        onPayment={handlePayment}
        payButtonText={payButtonText}
        processingText={processingText}
        updatingText={updatingText}
      />
    </div>
  );
};

const StripePaymentElements = ({
  form,
  isPayLocked,
  onReady,
  paymentFormProps,
  publishableKey,
  stripeLocale,
}: StripePaymentElementsProps): ReactElement => (
  <Elements
    options={createElementsOptions(form.clientSecret, stripeLocale)}
    stripe={getStripePromise(publishableKey)}
  >
    <StripePaymentForm
      {...paymentFormProps}
      isPayLocked={isPayLocked}
      onPaymentElementReady={() => onReady(form)}
      paymentIntentId={form.paymentIntentId}
    />
  </Elements>
);

const PaymentLoadingState = ({ statusText }: PaymentLoadingStateProps): ReactElement => (
  <LoadingState role="status" aria-live="polite" aria-atomic="true">
    <LoadingTabs>
      <LoadingTab />
      <LoadingTab />
    </LoadingTabs>
    <LoadingField />
    <LoadingFieldRow>
      <LoadingField $short />
      <LoadingField $short />
    </LoadingFieldRow>
    <LoadingFooter>
      <LoadingPulse />
      <StatusText>{statusText}</StatusText>
    </LoadingFooter>
    <LoadingAction aria-hidden />
  </LoadingState>
);

export const StripePaymentTabs = ({
  allPaymentIntentIds,
  billingAddressLine1,
  billingCity,
  billingCountry,
  billingEmail,
  billingName,
  billingPostalCode,
  checkoutSessionId,
  clientSecret,
  hasIntentError = false,
  isRenewalCheckout,
  isUpdating = false,
  onSubmittingChange,
  paymentIntentId,
  resultCurrency,
  resultOfferCode,
  resultOfferId,
  resultProductCode,
  resultProductId,
  resultValue,
  publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
}: StripePaymentTabsProps) => {
  const locale = useLocale();
  const t = useTranslations("StripePaymentTabs");
  const stripeLocale = getStripeLocale(locale);
  // What the checkout wants on screen right now. It becomes the current form
  // only once Stripe reports its Elements ready; until then whatever is
  // already mounted keeps showing (typed card details included).
  const requestedForm = createPaymentForm({
    clientSecret,
    paymentIntentId,
    publishableKey,
    stripeLocale: String(stripeLocale),
  });
  const [currentForm, setCurrentForm] = useState<PaymentForm | null>(null);
  const [isPreparingSlow, setIsPreparingSlow] = useState(false);
  const requestedFormKeyRef = useRef<string | null>(null);
  const isSkeletonCurrent = currentForm === null;
  const incomingForm =
    requestedForm && requestedForm.key !== currentForm?.key ? requestedForm : null;
  const isPayLocked =
    isUpdating || currentForm === null || requestedForm?.key !== currentForm.key;

  useEffect(() => {
    requestedFormKeyRef.current = requestedForm?.key ?? null;
  }, [requestedForm?.key]);

  const handleFormReady = (form: PaymentForm): void => {
    // A form that took long enough to be superseded is dropped, not shown.
    if (form.key !== requestedFormKeyRef.current || form.key === currentForm?.key) {
      return;
    }

    setCurrentForm(form);
  };

  // A dropped secret (the replacement intent could not be minted, sales just
  // closed) takes the stale form off the stage: the preparation error above
  // the card explains, and the skeleton says the form is not ready.
  const shouldDropCurrentForm = currentForm !== null && !requestedForm && hasIntentError;

  useEffect(() => {
    if (shouldDropCurrentForm) {
      setCurrentForm(null);
    }
  }, [shouldDropCurrentForm]);

  useEffect(() => {
    setIsPreparingSlow(false);

    if (!isSkeletonCurrent) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsPreparingSlow(true);
    }, PAYMENT_PREPARING_SLOW_THRESHOLD_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isSkeletonCurrent, requestedForm?.key]);

  const loadingStatusText = t(
    getLoadingStatusTranslationKey({
      hasClientSecret: Boolean(clientSecret),
      hasPublishableKey: Boolean(publishableKey),
      isPreparingSlow,
    }),
  );
  const paymentFormProps: StripePaymentElementsProps["paymentFormProps"] = {
    allPaymentIntentIds,
    billingAddressLine1,
    billingCity,
    billingCountry,
    billingEmail,
    billingName,
    billingPostalCode,
    checkoutSessionId,
    confirmPaymentFailedText: t("errors.confirmPaymentFailed"),
    isRenewalCheckout,
    onSubmittingChange,
    payButtonText: t("button.pay"),
    processingText: t("button.processing"),
    resultCurrency,
    resultOfferCode,
    resultOfferId,
    resultProductCode,
    resultProductId,
    resultValue,
    updatingText: t("button.updating"),
    verificationUnresolvedText: t.rich("status.verificationUnresolved", {
      link: (chunks) => (
        <StatusLink href={SUPPORT_TELEGRAM_URL} rel="noopener noreferrer" target="_blank">
          {chunks}
        </StatusLink>
      ),
    }),
    verifyingText: t("status.verifying"),
  };

  // The form on stage first, a replacement warming up behind it second. Keys
  // are the client secret, so promoting the replacement only removes the old
  // layer and never moves the new one: a moved iframe would reload and wipe
  // what was typed.
  const layers: StageLayerEntry[] = [
    { form: currentForm, key: currentForm?.key ?? SKELETON_LAYER_KEY, role: "current" },
    ...(incomingForm
      ? [{ form: incomingForm, key: incomingForm.key, role: "incoming" as const }]
      : []),
  ];

  return (
    <Card aria-busy={isSkeletonCurrent}>
      <Header>
        <Title>{t("title")}</Title>
        <Description>{t("description")}</Description>
      </Header>
      <PaymentStage>
        {layers.map((layer) => {
          const isCurrent = layer.role === "current";

          return (
            <StageLayer
              key={layer.key}
              $role={layer.role}
              aria-hidden={!isCurrent || undefined}
              inert={!isCurrent}
            >
              {layer.form ? (
                <StripePaymentElements
                  form={layer.form}
                  isPayLocked={!isCurrent || isPayLocked}
                  onReady={handleFormReady}
                  paymentFormProps={paymentFormProps}
                  publishableKey={publishableKey}
                  stripeLocale={stripeLocale}
                />
              ) : (
                <PaymentLoadingState statusText={loadingStatusText} />
              )}
            </StageLayer>
          );
        })}
      </PaymentStage>
    </Card>
  );
};

export default StripePaymentTabs;
