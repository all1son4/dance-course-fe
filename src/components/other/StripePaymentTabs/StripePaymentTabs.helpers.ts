import type {
  PaymentMethodCreateParams,
  Stripe,
  StripeElements,
} from "@stripe/stripe-js";
import type { CSSProperties } from "react";

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
  isRenewalCheckout?: boolean;
  onPaymentElementReadyChange?: (isReady: boolean) => void;
  paymentIntentId?: string | null;
  payButtonText: string;
  processingText: string;
  resultCurrency?: string | null;
  resultOfferCode?: string | null;
  resultOfferId?: string | null;
  resultProductCode?: string | null;
  resultProductId?: string | null;
  resultValue?: number | null;
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
