import type {
  PaymentMethodCreateParams,
  Stripe,
  StripeElements,
} from "@stripe/stripe-js";
import type { ReactNode } from "react";

export type StripePaymentFormProps = {
  allPaymentIntentIds?: string[] | null;
  billingAddressLine1?: string | null;
  billingCity?: string | null;
  billingCountry?: string | null;
  billingEmail?: string | null;
  billingName?: string | null;
  billingPostalCode?: string | null;
  checkoutSessionId?: string | null;
  confirmPaymentFailedText: string;
  /**
   * The mounted intent is being replaced (form data changed, currency
   * switched): paying waits for the new one so the amount and the customer
   * data always match the intent that gets confirmed.
   */
  isPayLocked: boolean;
  isRenewalCheckout?: boolean;
  onPaymentElementReady?: () => void;
  onSubmittingChange?: (isSubmitting: boolean) => void;
  paymentIntentId?: string | null;
  payButtonText: string;
  processingText: string;
  resultCurrency?: string | null;
  resultOfferCode?: string | null;
  resultOfferId?: string | null;
  resultProductCode?: string | null;
  resultProductId?: string | null;
  resultValue?: number | null;
  updatingText: string;
  verificationUnresolvedText: ReactNode;
  verifyingText: string;
};

export type ResolvedBillingDetails = {
  addressLine1: string;
  city: string;
  country: string;
  email: string;
  name: string;
  postalCode: string;
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

const trimValue = (value?: string | null): string => value?.trim() ?? "";

const normalizeCountry = (value?: string | null): string =>
  value?.trim().toUpperCase() ?? "";

export const resolveBillingDetails = ({
  billingAddressLine1,
  billingCity,
  billingCountry,
  billingEmail,
  billingName,
  billingPostalCode,
}: Pick<
  StripePaymentFormProps,
  | "billingAddressLine1"
  | "billingCity"
  | "billingCountry"
  | "billingEmail"
  | "billingName"
  | "billingPostalCode"
>): ResolvedBillingDetails => ({
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

export const isPaymentSubmissionReady = (
  submission: PaymentSubmissionState,
): submission is ReadyPaymentSubmissionState =>
  Boolean(
    submission.stripe &&
    submission.elements &&
    !submission.isSubmitting &&
    submission.isPaymentElementReady,
  );

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

/** One mounted Elements instance: an intent, identified by what it was created from. */
export type PaymentForm = {
  clientSecret: string;
  key: string;
  paymentIntentId: string;
};

export const createPaymentForm = ({
  clientSecret,
  paymentIntentId,
  publishableKey,
  stripeLocale,
}: {
  clientSecret?: string | null;
  paymentIntentId?: string | null;
  publishableKey: string;
  stripeLocale: string;
}): PaymentForm | null =>
  clientSecret && publishableKey
    ? {
        clientSecret,
        key: `${clientSecret}:${publishableKey}:${stripeLocale}`,
        paymentIntentId: paymentIntentId ?? "",
      }
    : null;

/**
 * Glides a container from one content height to the next. The height is
 * pinned to `from`, committed, then transitioned to `to`; while it runs a
 * ResizeObserver keeps retargeting the end value in case the new content
 * (Stripe's iframe finishing its fonts and layout) is still settling. Inline
 * styles are cleared once the transition ends, so the container follows its
 * content again. Returns the cleanup that also settles early.
 */
export const glideHeight = ({
  container,
  content,
  durationMs,
  from,
  to,
}: {
  container: HTMLElement;
  content: HTMLElement | null;
  durationMs: number;
  from: number;
  to: number;
}): (() => void) => {
  container.style.height = `${from}px`;
  container.style.overflow = "hidden";
  // Commit the start height before switching to the end height, or there is
  // nothing to transition from.
  container.getBoundingClientRect();
  container.style.transition = `height ${durationMs}ms var(--ease-emphasized, ease)`;
  container.style.height = `${to}px`;

  const observer =
    content && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          container.style.height = `${content.offsetHeight}px`;
        })
      : null;

  const settle = () => {
    window.clearTimeout(fallback);
    container.removeEventListener("transitionend", handleTransitionEnd);
    observer?.disconnect();
    container.style.height = "";
    container.style.overflow = "";
    container.style.transition = "";
  };
  const handleTransitionEnd = (event: TransitionEvent) => {
    // Layers inside fade at the same time; only the container's own height matters.
    if (event.target === container && event.propertyName === "height") {
      settle();
    }
  };
  const fallback = window.setTimeout(settle, durationMs + 200);

  container.addEventListener("transitionend", handleTransitionEnd);
  observer?.observe(content as Element);

  return settle;
};
