import { createHash } from "node:crypto";

import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";
let stripeServer: Stripe | null = null;

export type ManagedPaymentIntentOutcome =
  | "succeeded"
  | "processing"
  | "requires_action"
  | "failed"
  | "canceled";
export type CheckoutLocale = "ru" | "en" | "pl";
export type CheckoutLessonLanguage = "ru" | "en";

export type ManagedPaymentIntentSnapshot = {
  amount: number;
  currency: string;
  lastPaymentErrorCode: string | null;
  lastPaymentErrorMessage: string | null;
  outcome: ManagedPaymentIntentOutcome;
  paymentIntentId: string;
  status: Stripe.PaymentIntent.Status;
};

export const normalizePaymentIntentId = (value: string | null | undefined) => {
  const normalizedValue = value?.trim() ?? "";

  if (normalizedValue.length > 128) {
    return "";
  }

  return /^pi_[A-Za-z0-9]+$/u.test(normalizedValue) ? normalizedValue : "";
};

export const normalizeCheckoutSessionId = (value: string | null | undefined) =>
  (value?.trim() ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 96);

export const getResolvedCheckoutLocale = (
  locale: string | null | undefined,
): CheckoutLocale => {
  const normalizedLocale = (locale ?? "").trim().toLowerCase();

  if (normalizedLocale.startsWith("en")) {
    return "en";
  }

  if (normalizedLocale.startsWith("pl")) {
    return "pl";
  }

  return "ru";
};

export const getResolvedCheckoutLessonLanguage = (
  lessonLanguage: string | null | undefined,
): CheckoutLessonLanguage => {
  const normalizedValue = (lessonLanguage ?? "").trim().toLowerCase();

  if (normalizedValue.startsWith("en")) {
    return "en";
  }

  return "ru";
};

const trimAndCollapseSpaces = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim();

export type PaymentIntentCustomerData = {
  country: string;
  email: string;
  fullName: string;
  lessonLanguage: CheckoutLessonLanguage;
  nickname: string;
};

export const normalizePaymentIntentCustomerData = (customerData: {
  country?: string;
  email?: string;
  fullName?: string;
  lessonLanguage?: string;
  nickname?: string;
}): PaymentIntentCustomerData => {
  const normalizedCountry = trimAndCollapseSpaces(customerData.country)
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
  const normalizedEmail = trimAndCollapseSpaces(customerData.email)
    .toLowerCase()
    .slice(0, 254);
  const normalizedFullName = trimAndCollapseSpaces(customerData.fullName).slice(0, 100);
  const normalizedNickname = trimAndCollapseSpaces(customerData.nickname)
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_@]/g, "")
    .slice(0, 33);
  const normalizedLessonLanguage = getResolvedCheckoutLessonLanguage(
    customerData.lessonLanguage,
  );

  return {
    country: normalizedCountry,
    email: normalizedEmail,
    fullName: normalizedFullName,
    lessonLanguage: normalizedLessonLanguage,
    nickname: normalizedNickname,
  };
};

export const createPaymentIntentIdempotencyKey = ({
  checkoutSessionId,
  currency,
  customerData,
  offerId,
  productId,
}: {
  checkoutSessionId: string;
  currency: string;
  customerData: {
    country?: string;
    email?: string;
    fullName?: string;
    lessonLanguage?: string;
    nickname?: string;
  };
  offerId: string;
  productId: string;
}) => {
  const customerFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        country: customerData.country?.trim().toUpperCase() ?? "",
        email: customerData.email?.trim().toLowerCase() ?? "",
        fullName: customerData.fullName?.trim() ?? "",
        lessonLanguage: getResolvedCheckoutLessonLanguage(customerData.lessonLanguage),
        nickname: customerData.nickname?.trim() ?? "",
      }),
    )
    .digest("hex")
    .slice(0, 24);

  return [
    "payment-intent",
    checkoutSessionId,
    currency,
    productId,
    offerId,
    customerFingerprint,
  ].join(":");
};

export const getManagedPaymentIntentOutcome = (
  status: Stripe.PaymentIntent.Status,
): ManagedPaymentIntentOutcome => {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "canceled":
      return "canceled";
    case "requires_payment_method":
      return "failed";
    case "processing":
    case "requires_capture":
      return "processing";
    case "requires_action":
    case "requires_confirmation":
    default:
      return "requires_action";
  }
};

export const getManagedPaymentIntentSnapshot = (
  paymentIntent: Stripe.PaymentIntent,
): ManagedPaymentIntentSnapshot => ({
  amount: paymentIntent.amount,
  currency: paymentIntent.currency,
  lastPaymentErrorCode: paymentIntent.last_payment_error?.code ?? null,
  lastPaymentErrorMessage: paymentIntent.last_payment_error?.message ?? null,
  outcome: getManagedPaymentIntentOutcome(paymentIntent.status),
  paymentIntentId: paymentIntent.id,
  status: paymentIntent.status,
});

export const getStripeServer = () => {
  if (!stripeSecretKey) {
    return null;
  }

  if (!stripeServer) {
    stripeServer = new Stripe(stripeSecretKey);
  }

  return stripeServer;
};
