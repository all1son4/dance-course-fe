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
  | "errors.paymentFormBlocked"
  | "placeholder.missingPublishableKey"
  | "status.preparing"
  | "status.preparingSlow";

export const getLoadingStatusTranslationKey = ({
  hasClientSecret,
  hasPublishableKey,
  hasStripeLoadFailure,
  isPreparingSlow,
}: {
  hasClientSecret: boolean;
  hasPublishableKey: boolean;
  hasStripeLoadFailure: boolean;
  isPreparingSlow: boolean;
}): LoadingStatusTranslationKey => {
  if (!hasPublishableKey) {
    return "placeholder.missingPublishableKey";
  }

  if (hasStripeLoadFailure) {
    return "errors.paymentFormBlocked";
  }

  // The client secret is minted a moment after the form becomes valid, so
  // this is the ordinary first second of every checkout: it says the payment
  // is being prepared, not that a clientSecret is awaited.
  if (!hasClientSecret) {
    return isPreparingSlow ? "status.preparingSlow" : "status.preparing";
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
