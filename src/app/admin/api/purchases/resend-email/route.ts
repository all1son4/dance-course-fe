import { getStripeServer } from "@/app/api/stripe/payment-intent/lib";
import { deliverPurchaseSuccessEmailFromOutbox } from "@/app/api/stripe/webhook/_lib/side-effects/purchase-email";
import { findVerifiedSucceededStripeEvent } from "@/db/admin-operations";
import { findPaymentRecordByIntentIdFromDatabase } from "@/db/payment-records";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  getBrowserJsonRequestErrorResponse,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4 * 1024;

type ResendEmailBody = {
  paymentIntentId?: unknown;
};

export async function POST(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore({ errorCode: "unauthorized" }, { status: 401 });
  }

  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:resend-purchase-email",
    limit: 10,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonNoStore(
      { errorCode: "rate_limited" },
      {
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        status: 429,
      },
    );
  }

  try {
    const body = await parseJsonBody<ResendEmailBody>(request);
    const paymentIntentId =
      typeof body?.paymentIntentId === "string" ? body.paymentIntentId.trim() : "";

    if (!paymentIntentId) {
      return jsonNoStore({ errorCode: "invalid_request_body" }, { status: 400 });
    }

    const stripe = getStripeServer();

    if (!stripe) {
      return jsonNoStore({ errorCode: "stripe_not_configured" }, { status: 503 });
    }

    const [paymentRecord, event] = await Promise.all([
      findPaymentRecordByIntentIdFromDatabase(paymentIntentId),
      findVerifiedSucceededStripeEvent(paymentIntentId),
    ]);

    if (!paymentRecord) {
      return jsonNoStore({ errorCode: "purchase_not_found" }, { status: 404 });
    }

    if (paymentRecord.outcome !== "succeeded") {
      return jsonNoStore({ errorCode: "purchase_not_succeeded" }, { status: 409 });
    }

    if (!event) {
      return jsonNoStore({ errorCode: "succeeded_event_missing" }, { status: 409 });
    }

    // A fresh idempotency key per click: the original send already used the
    // stable key, so reusing it would make Resend swallow the resend.
    const result = await deliverPurchaseSuccessEmailFromOutbox({
      event,
      idempotencyKey: `purchase-success-resend/${paymentIntentId}/${Date.now()}`,
      paymentRecord,
      stripe,
    });

    return jsonNoStore({ status: result.skipped ? "skipped" : "sent" });
  } catch (error) {
    console.error("Failed to resend purchase email from admin", error);
    return jsonNoStore({ errorCode: "resend_purchase_email_failed" }, { status: 500 });
  }
}
