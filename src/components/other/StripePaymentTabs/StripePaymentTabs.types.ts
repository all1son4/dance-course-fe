export type StripePaymentTabsProps = {
  allPaymentIntentIds?: string[] | null;
  billingAddressLine1?: string | null;
  billingCity?: string | null;
  billingCountry?: string | null;
  billingEmail?: string | null;
  billingName?: string | null;
  billingPostalCode?: string | null;
  checkoutSessionId?: string | null;
  clientSecret?: string | null;
  paymentIntentId?: string | null;
  resultCurrency?: string | null;
  resultOfferId?: string | null;
  resultProductId?: string | null;
  publishableKey?: string;
};
