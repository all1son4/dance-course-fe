import {
  hasJsonContentType,
  isPayloadTooLarge,
  isTrustedBrowserOrigin,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";

import {
  getManagedPaymentIntentSnapshot,
  getStripeServer,
  normalizeCheckoutSessionId,
  normalizePaymentIntentId,
} from "../lib";

export const runtime = "nodejs";
const MAX_PAYMENT_STATUS_BODY_BYTES = 8 * 1024;

type PaymentIntentStatusBody = {
  checkoutSessionId?: string;
  paymentIntentId?: string;
};

export async function POST(request: Request) {
  if (!isTrustedBrowserOrigin(request)) {
    return jsonNoStore(
      {
        errorCode: "invalid_origin",
      },
      { status: 403 },
    );
  }

  if (isPayloadTooLarge(request, MAX_PAYMENT_STATUS_BODY_BYTES)) {
    return jsonNoStore(
      {
        errorCode: "payload_too_large",
      },
      { status: 413 },
    );
  }

  if (!hasJsonContentType(request)) {
    return jsonNoStore(
      {
        errorCode: "unsupported_media_type",
      },
      { status: 415 },
    );
  }

  const requesterIp = getRequestIp(request);
  const rateLimit = await consumeRateLimit({
    key: `stripe:payment-intent-status:${requesterIp}`,
    limit: 180,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonNoStore(
      {
        errorCode: "rate_limited",
      },
      {
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
        status: 429,
      },
    );
  }

  const stripe = getStripeServer();

  if (!stripe) {
    return jsonNoStore(
      {
        errorCode: "missing_secret_key",
      },
      { status: 500 },
    );
  }

  try {
    const body = await parseJsonBody<PaymentIntentStatusBody>(request);

    if (!body) {
      return jsonNoStore(
        {
          errorCode: "invalid_request_body",
        },
        { status: 400 },
      );
    }

    const checkoutSessionId = normalizeCheckoutSessionId(body.checkoutSessionId);
    const paymentIntentId = normalizePaymentIntentId(body.paymentIntentId);

    if (!paymentIntentId) {
      return jsonNoStore(
        {
          errorCode: "missing_payment_intent_id",
        },
        { status: 400 },
      );
    }

    if (!checkoutSessionId) {
      return jsonNoStore(
        {
          errorCode: "missing_checkout_session_id",
        },
        { status: 400 },
      );
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const paymentIntentCheckoutSessionId = normalizeCheckoutSessionId(
      paymentIntent.metadata.checkout_session_id,
    );

    if (
      !paymentIntentCheckoutSessionId ||
      paymentIntentCheckoutSessionId !== checkoutSessionId
    ) {
      return jsonNoStore(
        {
          errorCode: "payment_intent_access_denied",
        },
        { status: 403 },
      );
    }

    return jsonNoStore(getManagedPaymentIntentSnapshot(paymentIntent));
  } catch (error) {
    console.error("Failed to retrieve Stripe PaymentIntent status", error);

    return jsonNoStore(
      {
        errorCode: "payment_intent_status_failed",
      },
      { status: 500 },
    );
  }
}
