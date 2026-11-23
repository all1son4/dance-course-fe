const PAYMENT_API_ENDPOINTS = {
  cancelIntent: "/api/stripe/payment-intent/cancel",
} as const;

/** One cancel request per intent, fire-and-forget; `keepalive` lets it outlive the page. */
export const cancelPaymentIntents = (
  paymentIntentIds: string[],
  checkoutSessionId: string,
): void => {
  paymentIntentIds.forEach((paymentIntentId) => {
    void fetch(PAYMENT_API_ENDPOINTS.cancelIntent, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        checkoutSessionId,
        paymentIntentId,
      }),
      keepalive: true,
    }).catch(() => undefined);
  });
};
