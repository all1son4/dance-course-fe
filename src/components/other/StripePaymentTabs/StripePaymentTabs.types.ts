export type StripePaymentTabsProps = {
  allPaymentIntentIds?: string[] | null;
  billingCountry?: string | null;
  billingEmail?: string | null;
  billingName?: string | null;
  checkoutSessionId?: string | null;
  clientSecret?: string | null;
  errorMessage?: string | null;
  paymentIntentId?: string | null;
  resultCurrency?: string | null;
  resultOfferId?: string | null;
  resultProductId?: string | null;
  publishableKey?: string;
};
