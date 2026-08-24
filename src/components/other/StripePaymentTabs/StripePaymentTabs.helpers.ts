import type {
  PaymentIntent,
  PaymentMethodCreateParams,
  Stripe,
  StripeElements,
  StripeElementsOptions,
  StripePaymentElementOptions,
} from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { CSSProperties } from "react";

import { GOOGLE_FONTS_MANROPE_CSS_URL } from "@/constants/links";
import { PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY } from "@/lib/payment-draft";

import type { StripePaymentTabsProps } from "./StripePaymentTabs.types";

const stripePromiseCache = new Map<string, ReturnType<typeof loadStripe>>();

const PAYMENT_API_ENDPOINTS = {
  cancelIntent: "/api/stripe/payment-intent/cancel",
  getIntentStatus: "/api/stripe/payment-intent/status",
} as const;
export const PAYMENT_RESULT_PATHS = {
  failed: "/payment/failed",
  success: "/payment/success",
} as const;
const PAYMENT_STATUS_REQUEST_ERROR = "payment_intent_status_failed";
const PAYMENT_STATUS_REQUEST_TIMEOUT_MS = 8_000;
const PAYMENT_STATUS_MAX_ATTEMPTS = 3;
const PAYMENT_STATUS_RETRY_BASE_DELAY_MS = 320;
const PAYMENT_STATUS_RETRY_MAX_DELAY_MS = 1_400;
const PAYMENT_STATUS_RETRY_JITTER_MS = 140;
const MILLISECONDS_PER_SECOND = 1_000;
const STRIPE_LOCALE_PREFIXES = ["ru", "pl", "en"] as const;

const STRIPE_APPEARANCE = {
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
} satisfies NonNullable<StripeElementsOptions["appearance"]>;

const wait = (delayMs: number): Promise<void> =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });

export const getStripePromise = (
  publishableKey: string,
): ReturnType<typeof loadStripe> => {
  const cachedPromise = stripePromiseCache.get(publishableKey);

  if (cachedPromise) {
    return cachedPromise;
  }

  const stripePromise = loadStripe(publishableKey);
  stripePromiseCache.set(publishableKey, stripePromise);

  return stripePromise;
};

const trimOptionalValue = (value?: string | null): string | undefined =>
  value?.trim() || undefined;

const normalizeOptionalCountry = (value?: string | null): string | undefined =>
  value?.trim().toUpperCase() || undefined;

const trimValue = (value?: string | null): string => value?.trim() ?? "";

const normalizeCountry = (value?: string | null): string =>
  value?.trim().toUpperCase() ?? "";

export const createPaymentElementOptions = (
  billingAddressLine1?: string | null,
  billingCity?: string | null,
  billingCountry?: string | null,
  billingEmail?: string | null,
  billingName?: string | null,
  billingPostalCode?: string | null,
): StripePaymentElementOptions => {
  return {
    layout: {
      type: "tabs",
      defaultCollapsed: false,
    },
    defaultValues: {
      billingDetails: {
        address: {
          city: trimOptionalValue(billingCity),
          country: normalizeOptionalCountry(billingCountry),
          line1: trimOptionalValue(billingAddressLine1),
          postal_code: trimOptionalValue(billingPostalCode),
        },
        email: trimOptionalValue(billingEmail),
        name: trimOptionalValue(billingName),
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

export const createElementsOptions = (
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
  appearance: STRIPE_APPEARANCE,
  loader: "auto",
});

export const getStripeLocale = (locale: string): StripeElementsOptions["locale"] => {
  const normalizedLocale = locale.toLowerCase();
  const supportedLocale = STRIPE_LOCALE_PREFIXES.find((localePrefix) =>
    normalizedLocale.startsWith(localePrefix),
  );

  return supportedLocale ?? "auto";
};

export type StripePaymentFormProps = {
  allPaymentIntentIds?: string[] | null;
  billingAddressLine1?: string | null;
  billingCity?: string | null;
  billingCountry?: string | null;
  billingEmail?: string | null;
  billingName?: string | null;
  billingPostalCode?: string | null;
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

export type ResolvedBillingDetails = {
  addressLine1: string;
  city: string;
  country: string;
  email: string;
  name: string;
  postalCode: string;
};

export type ResultPageContext = Pick<
  StripePaymentTabsProps,
  "checkoutSessionId" | "resultCurrency" | "resultOfferId" | "resultProductId"
>;

export type PaymentCompletion =
  | {
      kind: "confirmed";
    }
  | {
      cancelUnusedIntents: boolean;
      kind: "redirect";
      pathname: string;
      paymentIntentId?: string;
    };

export type PaymentSubmissionState = {
  elements: StripeElements | null;
  isPaymentElementReady: boolean;
  isSubmitting: boolean;
  stripe: Stripe | null;
};

type ReadyPaymentSubmissionState = PaymentSubmissionState & {
  elements: StripeElements;
  stripe: Stripe;
};

const hasRemainingStatusAttempt = (attempt: number): boolean =>
  attempt < PAYMENT_STATUS_MAX_ATTEMPTS - 1;

const getPaymentStatusRetryDelayMs = ({
  attempt,
  retryAfterSeconds,
}: {
  attempt: number;
  retryAfterSeconds?: number;
}): number => {
  if (Number.isFinite(retryAfterSeconds) && (retryAfterSeconds ?? 0) > 0) {
    return Math.ceil((retryAfterSeconds ?? 0) * MILLISECONDS_PER_SECOND);
  }

  const exponentialDelay = Math.min(
    PAYMENT_STATUS_RETRY_BASE_DELAY_MS * 2 ** attempt,
    PAYMENT_STATUS_RETRY_MAX_DELAY_MS,
  );
  const jitter = Math.floor(Math.random() * PAYMENT_STATUS_RETRY_JITTER_MS);

  return exponentialDelay + jitter;
};

const shouldRetryPaymentStatusRequest = (status: number): boolean =>
  status === 429 || status >= 500;

const getRetryAfterSeconds = (response: Response): number | undefined => {
  const retryAfterHeader = Number(response.headers.get("retry-after") ?? "");

  return Number.isFinite(retryAfterHeader) ? retryAfterHeader : undefined;
};

const isRetryablePaymentStatusError = (error: unknown): boolean =>
  (error instanceof Error && error.name === "AbortError") || error instanceof TypeError;

const getConfirmedStatus = async (
  paymentIntentId: string,
  checkoutSessionId: string,
): Promise<PaymentIntentStatusResponse> => {
  for (let attempt = 0; attempt < PAYMENT_STATUS_MAX_ATTEMPTS; attempt += 1) {
    const requestController = new AbortController();
    const timeoutId = window.setTimeout(() => {
      requestController.abort();
    }, PAYMENT_STATUS_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(PAYMENT_API_ENDPOINTS.getIntentStatus, {
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
        hasRemainingStatusAttempt(attempt) &&
        shouldRetryPaymentStatusRequest(response.status)
      ) {
        await wait(
          getPaymentStatusRetryDelayMs({
            attempt,
            retryAfterSeconds: getRetryAfterSeconds(response),
          }),
        );
        continue;
      }

      throw new Error(PAYMENT_STATUS_REQUEST_ERROR);
    } catch (error) {
      if (hasRemainingStatusAttempt(attempt) && isRetryablePaymentStatusError(error)) {
        await wait(
          getPaymentStatusRetryDelayMs({
            attempt,
          }),
        );
        continue;
      }

      throw new Error(PAYMENT_STATUS_REQUEST_ERROR);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw new Error(PAYMENT_STATUS_REQUEST_ERROR);
};

export const resolveBillingDetails = ({
  billingAddressLine1,
  billingCity,
  billingCountry,
  billingEmail,
  billingName,
  billingPostalCode,
}: StripePaymentFormProps): ResolvedBillingDetails => ({
  addressLine1: trimValue(billingAddressLine1),
  city: trimValue(billingCity),
  country: normalizeCountry(billingCountry),
  email: trimValue(billingEmail),
  name: trimValue(billingName),
  postalCode: trimValue(billingPostalCode),
});

export const createStripeBillingDetails = ({
  addressLine1,
  city,
  country,
  email,
  name,
  postalCode,
}: ResolvedBillingDetails): PaymentMethodCreateParams.BillingDetails => ({
  email,
  name: name || undefined,
  address: {
    city: city || undefined,
    country: country || undefined,
    line1: addressLine1 || undefined,
    postal_code: postalCode || undefined,
  },
});

export const resolveStripeErrorMessage = (
  message: string | undefined,
  fallbackMessage: string,
): string => message?.trim() || fallbackMessage;

const setResultSearchParam = (url: URL, name: string, value?: string | null): void => {
  if (value) {
    url.searchParams.set(name, value);
  }
};

export const createResultPageUrl = (
  pathname: string,
  {
    checkoutSessionId,
    resultCurrency,
    resultOfferId,
    resultProductId,
  }: ResultPageContext,
  nextPaymentIntentId?: string,
): string => {
  const url = new URL(pathname, window.location.origin);

  // Keep the parameter order stable because it is visible in browser history.
  setResultSearchParam(url, "product", resultProductId);
  setResultSearchParam(url, "offer", resultOfferId);
  setResultSearchParam(url, "currency", resultCurrency);
  setResultSearchParam(url, "checkout", checkoutSessionId);
  setResultSearchParam(url, "payment_intent", nextPaymentIntentId);

  return url.toString();
};

export const redirectToResultPage = (
  pathname: string,
  resultPageContext: ResultPageContext,
  nextPaymentIntentId?: string,
): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.removeItem(PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY);
  } catch {
    // Payment completion must not be blocked by strict browser storage policies.
  }

  window.location.assign(
    createResultPageUrl(pathname, resultPageContext, nextPaymentIntentId),
  );
};

export const cancelUnusedPaymentIntents = ({
  allPaymentIntentIds,
  checkoutSessionId,
  usedPaymentIntentId,
}: Pick<StripePaymentFormProps, "allPaymentIntentIds" | "checkoutSessionId"> & {
  usedPaymentIntentId: string;
}): void => {
  if (!checkoutSessionId) {
    return;
  }

  const unusedPaymentIntentIds = [
    ...new Set((allPaymentIntentIds ?? []).map((id) => id.trim()).filter(Boolean)),
  ].filter((id) => id !== usedPaymentIntentId);

  // Cancellation is intentionally fire-and-forget so it cannot delay navigation.
  unusedPaymentIntentIds.forEach((paymentIntentId) => {
    void fetch(PAYMENT_API_ENDPOINTS.cancelIntent, {
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

const resolveServerPaymentCompletion = (
  outcome: PaymentIntentStatusResponse["outcome"],
  paymentIntentId: string,
): PaymentCompletion => {
  if (outcome === "succeeded") {
    return {
      cancelUnusedIntents: true,
      kind: "redirect",
      pathname: PAYMENT_RESULT_PATHS.success,
      paymentIntentId,
    };
  }

  if (outcome === "failed" || outcome === "canceled") {
    return {
      cancelUnusedIntents: false,
      kind: "redirect",
      pathname: PAYMENT_RESULT_PATHS.failed,
      paymentIntentId,
    };
  }

  return { kind: "confirmed" };
};

export const resolvePaymentCompletion = async ({
  checkoutSessionId,
  fallbackPaymentIntentId,
  paymentIntent,
}: {
  checkoutSessionId?: string | null;
  fallbackPaymentIntentId?: string | null;
  paymentIntent?: PaymentIntent;
}): Promise<PaymentCompletion> => {
  const resolvedPaymentIntentId = paymentIntent?.id ?? fallbackPaymentIntentId ?? "";

  if (resolvedPaymentIntentId && checkoutSessionId) {
    const { outcome } = await getConfirmedStatus(
      resolvedPaymentIntentId,
      checkoutSessionId,
    );

    return resolveServerPaymentCompletion(outcome, resolvedPaymentIntentId);
  }

  if (paymentIntent?.status === "succeeded") {
    const usedPaymentIntentId = paymentIntent.id ?? resolvedPaymentIntentId;

    return {
      cancelUnusedIntents: Boolean(usedPaymentIntentId),
      kind: "redirect",
      pathname: PAYMENT_RESULT_PATHS.success,
      paymentIntentId: usedPaymentIntentId || undefined,
    };
  }

  return { kind: "confirmed" };
};

export const createPaymentContentStyle = (isContentVisible: boolean): CSSProperties => ({
  visibility: isContentVisible ? "visible" : "hidden",
  pointerEvents: isContentVisible ? "auto" : "none",
});

export const isPaymentSubmissionReady = (
  submission: PaymentSubmissionState,
): submission is ReadyPaymentSubmissionState =>
  Boolean(
    submission.stripe &&
    submission.elements &&
    !submission.isSubmitting &&
    submission.isPaymentElementReady,
  );

export const createStripeElementsStyle = (isLoading: boolean): CSSProperties => ({
  position: isLoading ? "absolute" : "relative",
  inset: isLoading ? 0 : undefined,
  opacity: isLoading ? 0 : 1,
  pointerEvents: isLoading ? "none" : "auto",
});

export type LoadingStatusTranslationKey =
  | "placeholder.awaitingClientSecret"
  | "placeholder.missingPublishableKey"
  | "status.preparing"
  | "status.preparingSlow";

export const getLoadingStatusTranslationKey = ({
  hasClientSecret,
  hasPublishableKey,
  isPreparingSlow,
}: {
  hasClientSecret: boolean;
  hasPublishableKey: boolean;
  isPreparingSlow: boolean;
}): LoadingStatusTranslationKey => {
  if (!hasPublishableKey) {
    return "placeholder.missingPublishableKey";
  }

  if (!hasClientSecret) {
    return isPreparingSlow ? "status.preparingSlow" : "placeholder.awaitingClientSecret";
  }

  return isPreparingSlow ? "status.preparingSlow" : "status.preparing";
};
