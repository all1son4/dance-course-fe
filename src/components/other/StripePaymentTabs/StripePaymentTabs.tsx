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
import { useEffect, useState } from "react";

import Button from "@/components/common/Button";
import { GOOGLE_FONTS_MANROPE_CSS_URL } from "@/constants/links";
import { PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY } from "@/lib/payment-draft";

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
  PaymentElementShell,
  StatusText,
  Title,
} from "./StripePaymentTabs.styles";
import type { StripePaymentTabsProps } from "./StripePaymentTabs.types";

const stripePromiseCache = new Map<string, ReturnType<typeof loadStripe>>();
const PAYMENT_SUCCESS_PATH = "/payment/success";
const PAYMENT_FAILED_PATH = "/payment/failed";
const PAYMENT_STATUS_REQUEST_TIMEOUT_MS = 8_000;
const PAYMENT_STATUS_MAX_ATTEMPTS = 3;
const PAYMENT_STATUS_RETRY_BASE_DELAY_MS = 320;
const PAYMENT_STATUS_RETRY_MAX_DELAY_MS = 1_400;
const PAYMENT_PREPARING_SLOW_THRESHOLD_MS = 8_000;

const wait = (delayMs: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });

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
    fields: {
      billingDetails: {
        email: "never",
        address: {
          country: "never",
        },
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
        border: "none",
        boxShadow: "none",
        padding: "0",
      },
      ".Tab": {
        backgroundColor: "transparent",
        border: "1px solid rgba(72, 72, 72, 0.18)",
        borderRadius: "16px",
        boxShadow: "none",
        boxSizing: "border-box",
        minHeight: "54px",
        padding: "14px 20px",
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
        fontSize: "17px",
        fontWeight: "300",
        lineHeight: "150%",
      },
      ".TabLabel--selected": {
        color: "rgba(0, 0, 0, 1)",
      },
      ".Input": {
        backgroundColor: "transparent",
        border: "1px solid rgba(72, 72, 72, 0.6)",
        borderRadius: "16px",
        boxShadow: "none",
        boxSizing: "border-box",
        color: "rgba(0, 0, 0, 1)",
        caretColor: "rgba(124, 0, 2, 1)",
        minHeight: "54px",
        padding: "14px 20px",
        fontSize: "17px",
        fontWeight: "300",
        lineHeight: "150%",
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
        fontSize: "17px",
        fontWeight: "300",
        lineHeight: "150%",
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
  confirmPaymentFailedText: string;
  isContentVisible: boolean;
  onPaymentElementReadyChange?: (isReady: boolean) => void;
  paymentIntentId?: string | null;
  payButtonText: string;
  processingText: string;
  resultCurrency?: string | null;
  resultOfferId?: string | null;
  resultProductId?: string | null;
};

type PaymentIntentStatusResponse = {
  outcome: "canceled" | "failed" | "processing" | "requires_action" | "succeeded";
  paymentIntentId: string;
  status: string;
};

const getPaymentStatusRetryDelayMs = ({
  attempt,
  retryAfterSeconds,
}: {
  attempt: number;
  retryAfterSeconds?: number;
}) => {
  if (Number.isFinite(retryAfterSeconds) && (retryAfterSeconds ?? 0) > 0) {
    return Math.ceil((retryAfterSeconds ?? 0) * 1000);
  }

  const exponentialDelay = Math.min(
    PAYMENT_STATUS_RETRY_BASE_DELAY_MS * 2 ** attempt,
    PAYMENT_STATUS_RETRY_MAX_DELAY_MS,
  );
  const jitter = Math.floor(Math.random() * 140);

  return exponentialDelay + jitter;
};

const shouldRetryPaymentStatusRequest = (status: number) =>
  status === 429 || status >= 500;

const getConfirmedStatus = async (paymentIntentId: string, checkoutSessionId: string) => {
  for (let attempt = 0; attempt < PAYMENT_STATUS_MAX_ATTEMPTS; attempt += 1) {
    const requestController = new AbortController();
    const timeoutId = window.setTimeout(() => {
      requestController.abort();
    }, PAYMENT_STATUS_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("/api/stripe/payment-intent/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          checkoutSessionId,
          paymentIntentId,
        }),
        cache: "no-store",
        signal: requestController.signal,
      });

      if (response.ok) {
        return (await response.json()) as PaymentIntentStatusResponse;
      }

      if (
        attempt < PAYMENT_STATUS_MAX_ATTEMPTS - 1 &&
        shouldRetryPaymentStatusRequest(response.status)
      ) {
        const retryAfterHeader = Number(response.headers.get("retry-after") ?? "");
        const retryAfterSeconds = Number.isFinite(retryAfterHeader)
          ? retryAfterHeader
          : undefined;

        await wait(
          getPaymentStatusRetryDelayMs({
            attempt,
            retryAfterSeconds,
          }),
        );
        continue;
      }

      throw new Error("payment_intent_status_failed");
    } catch (error) {
      const isRetryableNetworkError =
        (error instanceof Error && error.name === "AbortError") ||
        error instanceof TypeError;

      if (attempt < PAYMENT_STATUS_MAX_ATTEMPTS - 1 && isRetryableNetworkError) {
        await wait(
          getPaymentStatusRetryDelayMs({
            attempt,
          }),
        );
        continue;
      }

      throw new Error("payment_intent_status_failed");
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw new Error("payment_intent_status_failed");
};

const StripePaymentForm = ({
  allPaymentIntentIds,
  billingCountry,
  billingEmail,
  billingName,
  checkoutSessionId,
  confirmedText,
  confirmPaymentFailedText,
  isContentVisible,
  onPaymentElementReadyChange,
  paymentIntentId,
  payButtonText,
  processingText,
  resultCurrency,
  resultOfferId,
  resultProductId,
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
  const resolvedBillingEmail = billingEmail?.trim() ?? "";
  const resolvedBillingName = billingName?.trim() ?? "";
  const resolvedBillingCountry = billingCountry?.trim().toUpperCase() ?? "";

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

    try {
      sessionStorage.removeItem(PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY);
    } catch {
      // Ignore storage access failures (e.g. strict browser privacy mode).
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
          payment_method_data: {
            billing_details: {
              email: resolvedBillingEmail,
              name: resolvedBillingName || undefined,
              address: {
                country: resolvedBillingCountry || undefined,
              },
            },
          },
          return_url: createResultPageUrl(
            PAYMENT_SUCCESS_PATH,
            paymentIntentId ?? undefined,
          ),
        },
        redirect: "if_required",
      });

      if (error) {
        setSubmitError(error.message?.trim() || confirmPaymentFailedText);
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
          redirectWithLockedButton(PAYMENT_FAILED_PATH, resolvedPaymentIntentId);
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
      setSubmitError(confirmPaymentFailedText);
    } finally {
      if (!shouldKeepSubmitting) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div
      style={{
        visibility: isContentVisible ? "visible" : "hidden",
        pointerEvents: isContentVisible ? "auto" : "none",
      }}
    >
      <PaymentElementShell>
        <PaymentElement
          options={paymentElementOptions}
          onLoaderStart={() => {
            setIsPaymentElementReady(false);
            onPaymentElementReadyChange?.(false);
          }}
          onReady={() => {
            setIsPaymentElementReady(true);
            onPaymentElementReadyChange?.(true);
          }}
        />
      </PaymentElementShell>
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
          buttonText={isSubmitting ? processingText : payButtonText}
          disabled={!stripe || !elements || isSubmitting || !isPaymentElementReady}
          isLoading={isSubmitting}
          onClick={handlePayment}
          type="button"
          width="240px"
        />
      </Actions>
    </div>
  );
};

export const StripePaymentTabs = ({
  allPaymentIntentIds,
  billingCountry,
  billingEmail,
  billingName,
  checkoutSessionId,
  clientSecret,
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
  const paymentFormReadyKey = `${resolvedClientSecret}:${publishableKey}:${stripeLocale}`;
  const [readyPaymentFormKey, setReadyPaymentFormKey] = useState<string | null>(null);
  const [isPreparingSlow, setIsPreparingSlow] = useState(false);
  const isPaymentFormReady = readyPaymentFormKey === paymentFormReadyKey;

  const shouldShowLoadingSkeleton = !isReady || !isPaymentFormReady;

  useEffect(() => {
    const resetId = window.setTimeout(() => {
      setIsPreparingSlow(false);
    }, 0);

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

  const loadingStatusText = (() => {
    if (!publishableKey) {
      return t("placeholder.missingPublishableKey");
    }

    if (!resolvedClientSecret) {
      return isPreparingSlow
        ? t("status.preparingSlow")
        : t("placeholder.awaitingClientSecret");
    }

    return isPreparingSlow ? t("status.preparingSlow") : t("status.preparing");
  })();

  return (
    <Card aria-busy={!isReady}>
      <Header>
        <Title>{t("title")}</Title>
        <Description>{t("description")}</Description>
      </Header>
      <div style={{ position: "relative" }}>
        {isReady ? (
          <div
            style={{
              position: shouldShowLoadingSkeleton ? "absolute" : "relative",
              inset: shouldShowLoadingSkeleton ? 0 : undefined,
              opacity: shouldShowLoadingSkeleton ? 0 : 1,
              pointerEvents: shouldShowLoadingSkeleton ? "none" : "auto",
            }}
          >
            <Elements
              options={createElementsOptions(resolvedClientSecret, stripeLocale)}
              stripe={getStripePromise(publishableKey)}
            >
              <StripePaymentForm
                key={paymentFormReadyKey}
                allPaymentIntentIds={allPaymentIntentIds}
                billingCountry={billingCountry}
                billingEmail={billingEmail}
                billingName={billingName}
                checkoutSessionId={checkoutSessionId}
                confirmedText={t("status.confirmed")}
                confirmPaymentFailedText={t("errors.confirmPaymentFailed")}
                isContentVisible={!shouldShowLoadingSkeleton}
                onPaymentElementReadyChange={(isFormReady) => {
                  if (isFormReady) {
                    setReadyPaymentFormKey(paymentFormReadyKey);
                    return;
                  }

                  setReadyPaymentFormKey((currentReadyKey) =>
                    currentReadyKey === paymentFormReadyKey ? null : currentReadyKey,
                  );
                }}
                paymentIntentId={paymentIntentId}
                payButtonText={t("button.pay")}
                processingText={t("button.processing")}
                resultCurrency={resultCurrency}
                resultOfferId={resultOfferId}
                resultProductId={resultProductId}
              />
            </Elements>
          </div>
        ) : null}

        {shouldShowLoadingSkeleton ? (
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
              <StatusText>{loadingStatusText}</StatusText>
            </LoadingFooter>
            <LoadingAction aria-hidden />
          </LoadingState>
        ) : null}
      </div>
    </Card>
  );
};

export default StripePaymentTabs;
