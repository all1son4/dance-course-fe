"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import Button from "@/components/common/Button";
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
  redirectToResultPage,
  resolvePaymentCompletion,
  type ResultPageContext,
} from "./StripePaymentTabs.completion";
import {
  createPaymentContentStyle,
  createStripeBillingDetails,
  createStripeElementsStyle,
  getLoadingStatusTranslationKey,
  isPaymentSubmissionReady,
  resolveBillingDetails,
  resolveStripeErrorMessage,
  type StripePaymentFormProps,
} from "./StripePaymentTabs.helpers";
import {
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
  PaymentButtonLabel,
  PaymentElementShell,
  StatusText,
  Title,
} from "./StripePaymentTabs.styles";
import type { StripePaymentTabsProps } from "./StripePaymentTabs.types";

const PAYMENT_PREPARING_SLOW_THRESHOLD_MS = 8_000;
const PAYMENT_PREPARING_RESET_DELAY_MS = 0;
const PAYMENT_BUTTON_WIDTH = "240px";

type StripePaymentElementsProps = {
  clientSecret: string;
  isLoading: boolean;
  paymentFormKey: string;
  paymentFormProps: Omit<StripePaymentFormProps, "isContentVisible">;
  publishableKey: string;
  stripeLocale: StripeElementsOptions["locale"];
};

type PaymentLoadingStateProps = {
  statusText: string;
};

type PaymentActionsProps = {
  isContentVisible: boolean;
  isDisabled: boolean;
  isSubmitting: boolean;
  onPayment: () => Promise<void>;
  payButtonText: string;
  processingText: string;
  submitError: string | null;
  submitSuccess: string | null;
};

const PaymentActions = ({
  isContentVisible,
  isDisabled,
  isSubmitting,
  onPayment,
  payButtonText,
  processingText,
  submitError,
  submitSuccess,
}: PaymentActionsProps): ReactElement => (
  <Actions>
    {submitSuccess && isContentVisible ? (
      <StatusText role="status" aria-live="polite" aria-atomic="true">
        {submitSuccess}
      </StatusText>
    ) : null}
    {submitError && isContentVisible ? (
      <ErrorText role="alert" aria-live="assertive" aria-atomic="true">
        {submitError}
      </ErrorText>
    ) : null}
    <Button
      disabled={isDisabled}
      isLoading={isSubmitting}
      onClick={onPayment}
      type="button"
      width={PAYMENT_BUTTON_WIDTH}
    >
      <PaymentButtonLabel>
        <span aria-hidden={isSubmitting || undefined}>{payButtonText}</span>
        <span aria-hidden={!isSubmitting || undefined}>{processingText}</span>
      </PaymentButtonLabel>
    </Button>
  </Actions>
);

const StripePaymentForm = (props: StripePaymentFormProps): ReactElement => {
  const {
    allPaymentIntentIds,
    billingAddressLine1,
    billingCity,
    billingCountry,
    billingEmail,
    billingName,
    billingPostalCode,
    checkoutSessionId,
    confirmedText,
    confirmPaymentFailedText,
    isContentVisible,
    isRenewalCheckout,
    onPaymentElementReadyChange,
    paymentIntentId,
    payButtonText,
    processingText,
    resultCurrency,
    resultOfferCode,
    resultOfferId,
    resultProductCode,
    resultProductId,
    resultValue,
  } = props;
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentElementOptions] = useState(() =>
    createPaymentElementOptions(
      billingAddressLine1,
      billingCity,
      billingCountry,
      billingEmail,
      billingName,
      billingPostalCode,
    ),
  );
  const [isPaymentElementReady, setIsPaymentElementReady] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
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

  const handlePaymentElementLoading = (): void => {
    setIsPaymentElementReady(false);
    onPaymentElementReadyChange?.(false);
  };

  const handlePaymentElementReady = (): void => {
    setIsPaymentElementReady(true);
    onPaymentElementReadyChange?.(true);
  };

  const handlePayment = async (): Promise<void> => {
    const submission = {
      elements,
      isPaymentElementReady,
      isSubmitting,
      stripe,
    };

    if (!isPaymentSubmissionReady(submission)) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    void trackAnalyticsEvent("payment_attempted", analyticsCommerceProperties);

    let shouldKeepSubmitting = false;

    try {
      const { error, paymentIntent } = await submission.stripe.confirmPayment({
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

      if (error) {
        void trackAnalyticsEvent("payment_failed", {
          ...analyticsCommerceProperties,
          failure_stage: "confirmation",
        });
        setSubmitError(
          resolveStripeErrorMessage(error.message, confirmPaymentFailedText),
        );
        return;
      }

      const completion = await resolvePaymentCompletion({
        checkoutSessionId,
        fallbackPaymentIntentId: paymentIntentId,
        paymentIntent,
      });

      if (completion.kind === "confirmed") {
        setSubmitSuccess(confirmedText);
        return;
      }

      if (completion.cancelUnusedIntents && completion.paymentIntentId) {
        cancelUnusedPaymentIntents({
          allPaymentIntentIds,
          checkoutSessionId,
          usedPaymentIntentId: completion.paymentIntentId,
        });
      }

      // Keep the button locked once navigation starts to prevent duplicate intents.
      shouldKeepSubmitting = true;
      redirectToResultPage(
        completion.pathname,
        resultPageContext,
        completion.paymentIntentId,
      );
    } catch {
      void trackAnalyticsEvent("payment_failed", {
        ...analyticsCommerceProperties,
        failure_stage: "exception",
      });
      setSubmitError(confirmPaymentFailedText);
    } finally {
      if (!shouldKeepSubmitting) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div style={createPaymentContentStyle(isContentVisible)}>
      <PaymentElementShell>
        <PaymentElement
          options={paymentElementOptions}
          onLoaderStart={handlePaymentElementLoading}
          onReady={handlePaymentElementReady}
        />
      </PaymentElementShell>
      <PaymentActions
        isContentVisible={isContentVisible}
        isDisabled={
          !isPaymentSubmissionReady({
            elements,
            isPaymentElementReady,
            isSubmitting,
            stripe,
          })
        }
        isSubmitting={isSubmitting}
        onPayment={handlePayment}
        payButtonText={payButtonText}
        processingText={processingText}
        submitError={submitError}
        submitSuccess={submitSuccess}
      />
    </div>
  );
};

const StripePaymentElements = ({
  clientSecret,
  isLoading,
  paymentFormKey,
  paymentFormProps,
  publishableKey,
  stripeLocale,
}: StripePaymentElementsProps): ReactElement => (
  <div style={createStripeElementsStyle(isLoading)}>
    <Elements
      options={createElementsOptions(clientSecret, stripeLocale)}
      stripe={getStripePromise(publishableKey)}
    >
      <StripePaymentForm
        key={paymentFormKey}
        {...paymentFormProps}
        isContentVisible={!isLoading}
      />
    </Elements>
  </div>
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
  isRenewalCheckout,
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
  const isReady = Boolean(clientSecret && publishableKey);
  const resolvedClientSecret = clientSecret ?? "";
  const stripeLocale = getStripeLocale(locale);
  const paymentFormReadyKey = `${resolvedClientSecret}:${publishableKey}:${stripeLocale}`;
  const [readyPaymentFormKey, setReadyPaymentFormKey] = useState<string | null>(null);
  const [isPreparingSlow, setIsPreparingSlow] = useState(false);

  const shouldShowLoadingSkeleton =
    !isReady || readyPaymentFormKey !== paymentFormReadyKey;

  useEffect(() => {
    const resetId = window.setTimeout(() => {
      setIsPreparingSlow(false);
    }, PAYMENT_PREPARING_RESET_DELAY_MS);

    if (!shouldShowLoadingSkeleton) {
      return () => {
        window.clearTimeout(resetId);
      };
    }

    const timeoutId = window.setTimeout(() => {
      setIsPreparingSlow(true);
    }, PAYMENT_PREPARING_SLOW_THRESHOLD_MS);

    return () => {
      window.clearTimeout(resetId);
      window.clearTimeout(timeoutId);
    };
  }, [paymentFormReadyKey, shouldShowLoadingSkeleton]);

  const loadingStatusText = t(
    getLoadingStatusTranslationKey({
      hasClientSecret: Boolean(resolvedClientSecret),
      hasPublishableKey: Boolean(publishableKey),
      isPreparingSlow,
    }),
  );

  const handlePaymentElementReadyChange = (isFormReady: boolean): void => {
    if (isFormReady) {
      setReadyPaymentFormKey(paymentFormReadyKey);
      return;
    }

    // Ignore stale readiness events from an Elements instance being replaced.
    setReadyPaymentFormKey((currentReadyKey) =>
      currentReadyKey === paymentFormReadyKey ? null : currentReadyKey,
    );
  };

  return (
    <Card aria-busy={!isReady}>
      <Header>
        <Title>{t("title")}</Title>
        <Description>{t("description")}</Description>
      </Header>
      <div style={{ position: "relative" }}>
        {isReady ? (
          <StripePaymentElements
            clientSecret={resolvedClientSecret}
            isLoading={shouldShowLoadingSkeleton}
            paymentFormKey={paymentFormReadyKey}
            paymentFormProps={{
              allPaymentIntentIds,
              billingAddressLine1,
              billingCity,
              billingCountry,
              billingEmail,
              billingName,
              billingPostalCode,
              checkoutSessionId,
              confirmedText: t("status.confirmed"),
              confirmPaymentFailedText: t("errors.confirmPaymentFailed"),
              isRenewalCheckout,
              onPaymentElementReadyChange: handlePaymentElementReadyChange,
              paymentIntentId,
              payButtonText: t("button.pay"),
              processingText: t("button.processing"),
              resultCurrency,
              resultOfferCode,
              resultOfferId,
              resultProductCode,
              resultProductId,
              resultValue,
            }}
            publishableKey={publishableKey}
            stripeLocale={stripeLocale}
          />
        ) : null}

        {shouldShowLoadingSkeleton ? (
          <PaymentLoadingState statusText={loadingStatusText} />
        ) : null}
      </div>
    </Card>
  );
};

export default StripePaymentTabs;
