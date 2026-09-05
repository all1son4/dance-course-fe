export const PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY = "payment-checkout-draft:v1";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/u, "");

/** The checkout form itself, in any locale: `/payment`, `/en/payment`, ... */
export const isCheckoutPaymentPathname = (pathname: string) => {
  const normalizedPathname = trimTrailingSlash(pathname);

  return normalizedPathname.endsWith("/payment");
};

/**
 * Routes that must keep the saved checkout draft alive. Besides the form these
 * are its two result pages: "back to payment" on the failed page resumes the
 * filled form, and a success page that is still verifying has not finished
 * the purchase yet - the success content clears the draft itself once the
 * payment is confirmed. Leaving for any other route discards the draft.
 */
export const isCheckoutDraftPathname = (pathname: string) => {
  const normalizedPathname = trimTrailingSlash(pathname);

  return (
    isCheckoutPaymentPathname(normalizedPathname) ||
    normalizedPathname.endsWith("/payment/failed") ||
    normalizedPathname.endsWith("/payment/success")
  );
};
