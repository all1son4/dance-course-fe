import type {
  StripeElementsOptions,
  StripePaymentElementOptions,
} from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js";

import { GOOGLE_FONTS_MANROPE_CSS_URL } from "@/constants/links";

const stripePromiseCache = new Map<string, ReturnType<typeof loadStripe>>();

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

export const getStripePromise = (
  publishableKey: string,
): ReturnType<typeof loadStripe> => {
  const cachedPromise = stripePromiseCache.get(publishableKey);

  if (cachedPromise) {
    return cachedPromise;
  }

  // Ad blockers and corporate proxies do block js.stripe.com. The rejection
  // is turned into `null` here: unhandled it surfaced nowhere, and the form
  // waited for an Elements instance that could never arrive.
  const stripePromise = loadStripe(publishableKey).catch(() => null);
  stripePromiseCache.set(publishableKey, stripePromise);

  return stripePromise;
};

const trimOptionalValue = (value?: string | null): string | undefined =>
  value?.trim() || undefined;

const normalizeOptionalCountry = (value?: string | null): string | undefined =>
  value?.trim().toUpperCase() || undefined;

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
