"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type {
  StripeElementsOptions,
  StripePaymentElementOptions,
} from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import Button from "@/components/common/Button";
import { GOOGLE_FONTS_MANROPE_CSS_URL } from "@/constants/links";

import {
  Actions,
  Card,
  Description,
  ErrorText,
  Header,
  LoadingField,
  LoadingFieldRow,
  LoadingFooter,
  LoadingPulse,
  LoadingState,
  LoadingTab,
  LoadingTabs,
  PaymentElementShell,
  StatusText,
  Title,
} from "./StripePaymentTabs.styles";
import type { StripePaymentTabsProps } from "./StripePaymentTabs.types";

const stripePromiseCache = new Map<string, ReturnType<typeof loadStripe>>();
const PAYMENT_SUCCESS_PATH = "/payment/success";

const getStripePromise = (publishableKey: string) => {
  const cachedPromise = stripePromiseCache.get(publishableKey);

  if (cachedPromise) {
    return cachedPromise;
  }

  const stripePromise = loadStripe(publishableKey);
  stripePromiseCache.set(publishableKey, stripePromise);

  return stripePromise;
};

const createPaymentElementOptions = (
  billingCountry?: string | null,
  billingEmail?: string | null,
  billingName?: string | null,
): StripePaymentElementOptions => {
  const trimmedCountry = billingCountry?.trim().toUpperCase();
  const trimmedEmail = billingEmail?.trim();
  const trimmedName = billingName?.trim();

  return {
    layout: {
      type: "tabs",
      defaultCollapsed: false,
    },
    defaultValues: {
      billingDetails: {
        address: {
          country: trimmedCountry || undefined,
        },
        email: trimmedEmail || undefined,
        name: trimmedName || undefined,
      },
    },
  };
};

const createElementsOptions = (
  clientSecret: string,
  locale: StripeElementsOptions["locale"],
): StripeElementsOptions => ({
  clientSecret,
  locale,
  fonts: [
    {
      cssSrc: GOOGLE_FONTS_MANROPE_CSS_URL,
    },
  ],
  appearance: {
    theme: "flat",
    variables: {
      colorPrimary: "rgba(0, 0, 0, 1)",
      colorText: "rgba(0, 0, 0, 1)",
      colorTextSecondary: "rgba(72, 72, 72, 1)",
      colorDanger: "rgba(213, 0, 4, 1)",
      colorBackground: "transparent",
      iconColor: "rgba(0, 0, 0, 1)",
      borderRadius: "18px",
      fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSizeBase: "17px",
      spacingUnit: "5px",
      tabIconColor: "rgba(0, 0, 0, 1)",
      tabIconHoverColor: "rgba(0, 0, 0, 1)",
      tabIconSelectedColor: "rgba(0, 0, 0, 1)",
    },
    rules: {
      ".Block": {
        backgroundColor: "transparent",
        border: "1px solid rgba(255, 255, 255, 0.48)",
        boxShadow: "none",
        padding: "0",
      },
      ".Tab": {
        backgroundColor: "transparent",
        border: "1px solid rgba(72, 72, 72, 0.18)",
        borderRadius: "24px",
        boxShadow: "none",
        padding: "20px 22px",
      },
      ".Tab:focus": {
        borderColor: "rgba(0, 0, 0, 1)",
        boxShadow: "none",
        outline: "none",
      },
      ".Tab:focus-visible": {
        borderColor: "rgba(0, 0, 0, 1)",
        boxShadow: "none",
        outline: "none",
      },
      ".Tab:hover": {
        borderColor: "rgba(0, 0, 0, 0.7)",
        color: "rgba(0, 0, 0, 1)",
      },
      ".Tab--selected": {
        backgroundColor: "transparent",
        borderColor: "rgba(0, 0, 0, 1)",
        boxShadow: "none",
        color: "rgba(0, 0, 0, 1)",
      },
      ".Tab--selected:focus": {
        borderColor: "rgba(0, 0, 0, 1)",
        boxShadow: "none",
        outline: "none",
      },
      ".Tab--selected:focus-visible": {
        borderColor: "rgba(0, 0, 0, 1)",
        boxShadow: "none",
        outline: "none",
      },
      ".TabLabel": {
        color: "rgba(0, 0, 0, 1)",
        fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: "15px",
        fontWeight: "500",
      },
      ".TabLabel--selected": {
        color: "rgba(0, 0, 0, 1)",
      },
      ".Input": {
        backgroundColor: "transparent",
        border: "1px solid rgba(72, 72, 72, 0.6)",
        borderRadius: "16px",
        boxShadow: "none",
        color: "rgba(0, 0, 0, 1)",
        caretColor: "rgba(124, 0, 2, 1)",
        height: "55px",
      },
      ".Input:focus": {
        borderColor: "rgba(0, 0, 0, 1)",
        boxShadow: "none",
        outline: "none",
      },
      ".Input:hover": {
        borderColor: "rgba(0, 0, 0, 0.9)",
      },
      ".Input--invalid": {
        borderColor: "rgba(213, 0, 4, 1)",
        boxShadow: "none",
      },
      ".Label": {
        color: "rgba(72, 72, 72, 1)",
        fontSize: "14px",
        fontWeight: "400",
      },
      ".PickerItem": {
        backgroundColor: "rgba(0, 0, 0, 1)",
        border: "1px solid rgba(72, 72, 72, 0.2)",
        boxShadow: "none",
      },
      ".PickerItem:hover": {
        borderColor: "rgba(0, 0, 0, 0.7)",
      },
      ".Error": {
        color: "rgba(213, 0, 4, 1)",
        fontSize: "13px",
      },
    },
  },
  loader: "auto",
});

const getStripeLocale = (locale: string): StripeElementsOptions["locale"] => {
  const normalizedLocale = locale.toLowerCase();

  if (normalizedLocale.startsWith("ru")) {
    return "ru";
  }

  if (normalizedLocale.startsWith("pl")) {
    return "pl";
  }

  if (normalizedLocale.startsWith("en")) {
    return "en";
  }

  return "auto";
};

type StripePaymentFormProps = {
  allPaymentIntentIds?: string[] | null;
  billingCountry?: string | null;
  billingEmail?: string | null;
  billingName?: string | null;
  checkoutSessionId?: string | null;
  confirmedText: string;
  paymentIntentId?: string | null;
  payButtonText: string;
  preparingText: string;
  processingText: string;
  resultCurrency?: string | null;
  resultOfferId?: string | null;
  resultProductId?: string | null;
  technicalErrorText: string;
};

const getConfirmedStatus = async (paymentIntentId: string, checkoutSessionId: string) => {
  const response = await fetch("/api/stripe/payment-intent/status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      checkoutSessionId,
      paymentIntentId,
    }),
  });

  if (!response.ok) {
    throw new Error("payment_intent_status_failed");
  }

  return (await response.json()) as {
    outcome: "canceled" | "failed" | "processing" | "requires_action" | "succeeded";
    paymentIntentId: string;
    status: string;
  };
};

const StripePaymentForm = ({
  allPaymentIntentIds,
  billingCountry,
  billingEmail,
  billingName,
  checkoutSessionId,
  confirmedText,
  paymentIntentId,
  payButtonText,
  preparingText,
  processingText,
  resultCurrency,
  resultOfferId,
  resultProductId,
  technicalErrorText,
}: StripePaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentElementOptions] = useState(() =>
    createPaymentElementOptions(billingCountry, billingEmail, billingName),
  );
  const [isPaymentElementReady, setIsPaymentElementReady] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const cancelUnusedPaymentIntents = (usedPaymentIntentId: string) => {
    if (!checkoutSessionId) {
      return;
    }

    const uniquePaymentIntentIds = [
      ...new Set((allPaymentIntentIds ?? []).map((id) => id.trim()).filter(Boolean)),
    ].filter((id) => id !== usedPaymentIntentId);

    uniquePaymentIntentIds.forEach((paymentIntentId) => {
      void fetch("/api/stripe/payment-intent/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          checkoutSessionId,
          paymentIntentId,
        }),
        keepalive: true,
      }).catch(() => undefined);
    });
  };
  const createResultPageUrl = (pathname: string, nextPaymentIntentId?: string) => {
    const url = new URL(pathname, window.location.origin);

    if (resultProductId) {
      url.searchParams.set("product", resultProductId);
    }

    if (resultOfferId) {
      url.searchParams.set("offer", resultOfferId);
    }

    if (resultCurrency) {
      url.searchParams.set("currency", resultCurrency);
    }

    if (checkoutSessionId) {
      url.searchParams.set("checkout", checkoutSessionId);
    }

    if (nextPaymentIntentId) {
      url.searchParams.set("payment_intent", nextPaymentIntentId);
    }

    return url.toString();
  };

  const redirectToResultPage = (pathname: string, nextPaymentIntentId?: string) => {
    if (typeof window === "undefined") {
      return;
    }

    window.location.assign(createResultPageUrl(pathname, nextPaymentIntentId));
  };

  const handlePayment = async () => {
    if (!stripe || !elements || isSubmitting || !isPaymentElementReady) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    let shouldKeepSubmitting = false;

    const redirectWithLockedButton = (pathname: string, nextPaymentIntentId?: string) => {
      shouldKeepSubmitting = true;
      redirectToResultPage(pathname, nextPaymentIntentId);
    };

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: createResultPageUrl(
            PAYMENT_SUCCESS_PATH,
            paymentIntentId ?? undefined,
          ),
        },
        redirect: "if_required",
      });

      if (error) {
        if (error.type === "api_connection_error" || error.type === "api_error") {
          setSubmitError(technicalErrorText);
        }
        return;
      }

      const resolvedPaymentIntentId = paymentIntent?.id ?? paymentIntentId ?? "";

      if (resolvedPaymentIntentId && checkoutSessionId) {
        const { outcome } = await getConfirmedStatus(
          resolvedPaymentIntentId,
          checkoutSessionId,
        );

        if (outcome === "succeeded") {
          cancelUnusedPaymentIntents(resolvedPaymentIntentId);
          redirectWithLockedButton(PAYMENT_SUCCESS_PATH, resolvedPaymentIntentId);
          return;
        }

        if (outcome === "failed" || outcome === "canceled") {
          return;
        }

        setSubmitSuccess(confirmedText);
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        const usedPaymentIntentId = paymentIntent.id ?? resolvedPaymentIntentId;

        if (usedPaymentIntentId) {
          cancelUnusedPaymentIntents(usedPaymentIntentId);
        }

        redirectWithLockedButton(PAYMENT_SUCCESS_PATH, usedPaymentIntentId || undefined);
        return;
      }

      setSubmitSuccess(confirmedText);
    } catch {
      setSubmitError(technicalErrorText);
    } finally {
      if (!shouldKeepSubmitting) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <>
      <PaymentElementShell>
        <PaymentElement
          options={paymentElementOptions}
          onLoaderStart={() => setIsPaymentElementReady(false)}
          onReady={() => setIsPaymentElementReady(true)}
        />
      </PaymentElementShell>
      <Actions>
        {submitError ? (
          <ErrorText role="alert" aria-live="assertive">
            {submitError}
          </ErrorText>
        ) : submitSuccess ? (
          <StatusText role="status" aria-live="polite" aria-atomic="true">
            {submitSuccess}
          </StatusText>
        ) : !isPaymentElementReady ? (
          <StatusText role="status" aria-live="polite" aria-atomic="true">
            {preparingText}
          </StatusText>
        ) : null}
        <Button
          buttonText={isSubmitting ? processingText : payButtonText}
          disabled={!stripe || !elements || isSubmitting || !isPaymentElementReady}
          onClick={handlePayment}
          type="button"
          width="240px"
        />
      </Actions>
    </>
  );
};

export const StripePaymentTabs = ({
  allPaymentIntentIds,
  billingCountry,
  billingEmail,
  billingName,
  checkoutSessionId,
  clientSecret,
  errorMessage,
  paymentIntentId,
  resultCurrency,
  resultOfferId,
  resultProductId,
  publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
}: StripePaymentTabsProps) => {
  const locale = useLocale();
  const t = useTranslations("StripePaymentTabs");
  const isReady = Boolean(clientSecret && publishableKey);
  const resolvedClientSecret = clientSecret ?? "";
  const stripeLocale = getStripeLocale(locale);
  const errorText = (() => {
    switch (errorMessage) {
      case "missing_client_secret":
        return t("errors.missingClientSecret");
      case "missing_secret_key":
        return t("errors.missingSecretKey");
      case "payment_intent_failed":
        return t("errors.paymentIntentFailed");
      case "payment_intent_request_failed":
        return t("errors.paymentIntentRequestFailed");
      default:
        return errorMessage ? t("errors.paymentIntentRequestFailed") : null;
    }
  })();

  return (
    <Card aria-busy={!isReady}>
      <Header>
        <Title>{t("title")}</Title>
        <Description>{t("description")}</Description>
      </Header>

      {isReady ? (
        <Elements
          options={createElementsOptions(resolvedClientSecret, stripeLocale)}
          stripe={getStripePromise(publishableKey)}
        >
          <StripePaymentForm
            allPaymentIntentIds={allPaymentIntentIds}
            billingCountry={billingCountry}
            billingEmail={billingEmail}
            billingName={billingName}
            checkoutSessionId={checkoutSessionId}
            confirmedText={t("status.confirmed")}
            paymentIntentId={paymentIntentId}
            payButtonText={t("button.pay")}
            preparingText={t("status.preparing")}
            processingText={t("button.processing")}
            resultCurrency={resultCurrency}
            resultOfferId={resultOfferId}
            resultProductId={resultProductId}
            technicalErrorText={t("errors.paymentIntentRequestFailed")}
          />
        </Elements>
      ) : (
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
          <LoadingField />
          <LoadingFooter>
            <LoadingPulse />
            <StatusText>{t("status.preparing")}</StatusText>
          </LoadingFooter>
        </LoadingState>
      )}

      {!isReady && errorText ? (
        <ErrorText role="alert" aria-live="assertive">
          {errorText}
        </ErrorText>
      ) : null}
    </Card>
  );
};

export default StripePaymentTabs;
