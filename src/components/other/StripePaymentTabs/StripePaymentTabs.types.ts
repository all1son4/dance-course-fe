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
  /** The intent for the selected currency could not be (re)minted. */
  hasIntentError?: boolean;
  /**
   * The form changed after this intent was minted and its replacement is on
   * the way: the mounted Elements stay, paying waits for the new secret.
   */
  isUpdating?: boolean;
  /** Fires when a confirmation starts and, if it ever unlocks, when it ends. */
  onSubmittingChange?: (isSubmitting: boolean) => void;
  paymentIntentId?: string | null;
  isRenewalCheckout?: boolean;
  resultCurrency?: string | null;
  resultOfferCode?: string | null;
  resultOfferId?: string | null;
  resultProductCode?: string | null;
  resultProductId?: string | null;
  resultValue?: number | null;
  publishableKey?: string;
};
