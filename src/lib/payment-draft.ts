export const PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY = "payment-checkout-draft:v1";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/u, "");

export const isCheckoutPaymentPathname = (pathname: string) => {
  const normalizedPathname = trimTrailingSlash(pathname);

  return normalizedPathname.endsWith("/payment");
};
