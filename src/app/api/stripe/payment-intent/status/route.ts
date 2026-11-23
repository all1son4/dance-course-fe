import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  jsonRateLimited,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";
import {
  getCheckoutOwnedPaymentIntent,
  getManagedPaymentIntentSnapshot,
  getStripeServer,
} from "@/lib/stripe-checkout";

import { scheduleStripeBackgroundJobs } from "../../webhook/_lib/background-jobs";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_PAYMENT_STATUS_BODY_BYTES = 8 * 1024;

type PaymentIntentStatusBody = {
  checkoutSessionId?: string;
  paymentIntentId?: string;
};

export async function POST(request: Request) {
  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_PAYMENT_STATUS_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "stripe:payment-intent-status",
    limit: 180,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonRateLimited(rateLimit.retryAfterSeconds);
  }

  const stripe = getStripeServer();

  if (!stripe) {
    return jsonErrorNoStore("missing_secret_key", { status: 500 });
  }

  try {
    const { body, errorResponse: bodyErrorResponse } =
      await parseJsonBody<PaymentIntentStatusBody>(
        request,
        MAX_PAYMENT_STATUS_BODY_BYTES,
      );

    if (bodyErrorResponse) {
      return bodyErrorResponse;
    }

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

    const snapshot = getManagedPaymentIntentSnapshot(paymentIntentResult.paymentIntent);

    if (snapshot.outcome === "succeeded") {
      // Never throws: a scheduling failure is logged inside and the inbox row stays durable.
      scheduleStripeBackgroundJobs();
    }

    return jsonNoStore(snapshot);
  } catch (error) {
    logSafeError("Failed to retrieve Stripe PaymentIntent status", error);

    return jsonErrorNoStore("payment_intent_status_failed", { status: 500 });
  }
}
