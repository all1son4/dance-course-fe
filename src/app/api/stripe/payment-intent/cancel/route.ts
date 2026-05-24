import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";

import {
  getCheckoutOwnedPaymentIntent,
  getManagedPaymentIntentSnapshot,
  getStripeServer,
} from "../lib";

export const runtime = "nodejs";
const MAX_PAYMENT_CANCEL_BODY_BYTES = 8 * 1024;
const NON_CANCELABLE_PAYMENT_INTENT_STATUSES = new Set(["canceled", "succeeded"]);

type CancelPaymentIntentBody = {
  checkoutSessionId?: string;
  paymentIntentId?: string;
};

export async function POST(request: Request) {
  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_PAYMENT_CANCEL_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "stripe:cancel-payment-intent",
    limit: 90,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonErrorNoStore("rate_limited", {
      headers: {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
      status: 429,
    });
  }

  const stripe = getStripeServer();

  if (!stripe) {
    return jsonErrorNoStore("missing_secret_key", { status: 500 });
  }

  try {
    const body = await parseJsonBody<CancelPaymentIntentBody>(request);

    if (!body) {
      return jsonErrorNoStore("invalid_request_body", { status: 400 });
    }

    const paymentIntentResult = await getCheckoutOwnedPaymentIntent({
      checkoutSessionId: body.checkoutSessionId,
      paymentIntentId: body.paymentIntentId,
      stripe,
    });

    if (paymentIntentResult.errorCode) {
      return jsonErrorNoStore(paymentIntentResult.errorCode, {
        status: paymentIntentResult.status,
      });
    }

    const { paymentIntent } = paymentIntentResult;

    if (NON_CANCELABLE_PAYMENT_INTENT_STATUSES.has(paymentIntent.status)) {
      return jsonNoStore(getManagedPaymentIntentSnapshot(paymentIntent));
    }

    const canceledPaymentIntent = await stripe.paymentIntents.cancel(paymentIntent.id);

    return jsonNoStore(getManagedPaymentIntentSnapshot(canceledPaymentIntent));
  } catch (error) {
    console.error("Failed to cancel Stripe PaymentIntent", error);

    return jsonErrorNoStore("payment_intent_cancel_failed", { status: 500 });
  }
}
