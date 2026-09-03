import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";

import { scheduleStripeBackgroundJobs } from "../../webhook/_lib/background-jobs";
import {
  getCheckoutOwnedPaymentIntent,
  getManagedPaymentIntentSnapshot,
  getStripeServer,
} from "../lib";

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
    const body = await parseJsonBody<PaymentIntentStatusBody>(request);

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
      try {
        scheduleStripeBackgroundJobs();
      } catch (error) {
        console.error("Failed to schedule payment background recovery", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }

    return jsonNoStore(snapshot);
  } catch (error) {
    console.error("Failed to retrieve Stripe PaymentIntent status", error);

    return jsonErrorNoStore("payment_intent_status_failed", { status: 500 });
  }
}
