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

import { Button } from "@/components";

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
  billingEmail?: string | null,
  billingName?: string | null,
): StripePaymentElementOptions => {
  const trimmedEmail = billingEmail?.trim();
  const trimmedName = billingName?.trim();

  return {
    layout: {
      type: "tabs",
      defaultCollapsed: false,
    },
    defaultValues: {
      billingDetails: {
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
      cssSrc:
        "https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600&display=swap",
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
      ".Tab:focusVisible": {
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
      ".Tab--selected:focusVisible": {
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
  billingEmail?: string | null;
  billingName?: string | null;
  confirmFailedText: string;
  confirmedText: string;
  payButtonText: string;
  processingText: string;
  successText: string;
};

const StripePaymentForm = ({
  billingEmail,
  billingName,
  confirmFailedText,
  confirmedText,
  payButtonText,
  processingText,
  successText,
}: StripePaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentElementOptions] = useState(() =>
    createPaymentElementOptions(billingEmail, billingName),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const handlePayment = async () => {
    if (!stripe || !elements || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href.split("?")[0],
        },
        redirect: "if_required",
      });

      if (error) {
        setSubmitError(confirmFailedText);
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        setSubmitSuccess(successText);
        return;
      }

      setSubmitSuccess(confirmedText);
    } catch {
      setSubmitError(confirmFailedText);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PaymentElementShell>
        <PaymentElement options={paymentElementOptions} />
      </PaymentElementShell>
      <Actions>
        {submitError ? <ErrorText>{submitError}</ErrorText> : null}
        {submitSuccess ? <StatusText>{submitSuccess}</StatusText> : null}
        <Button
          buttonText={isSubmitting ? processingText : payButtonText}
          disabled={!stripe || !elements || isSubmitting}
          onClick={handlePayment}
          type="button"
          width="240px"
        />
      </Actions>
    </>
  );
};

export const StripePaymentTabs = ({
  billingEmail,
  billingName,
  clientSecret,
  errorMessage,
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
    <Card>
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
            billingEmail={billingEmail}
            billingName={billingName}
            confirmFailedText={t("errors.confirmPaymentFailed")}
            confirmedText={t("status.confirmed")}
            payButtonText={t("button.pay")}
            processingText={t("button.processing")}
            successText={t("status.succeeded")}
          />
        </Elements>
      ) : (
        <LoadingState>
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

      {!isReady && errorText ? <ErrorText>{errorText}</ErrorText> : null}
    </Card>
  );
};

export default StripePaymentTabs;
