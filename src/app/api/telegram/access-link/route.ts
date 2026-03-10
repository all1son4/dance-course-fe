import {
  normalizeCheckoutSessionId,
  normalizePaymentIntentId,
} from "@/app/api/stripe/payment-intent/lib";
import {
  findLatestSucceededPaymentRecordByCheckoutSessionId,
  findPaymentRecordByIntentId,
} from "@/lib/google-sheets";
import {
  hasJsonContentType,
  isPayloadTooLarge,
  isTrustedBrowserOrigin,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";
import { ensureTelegramAccessLinkForPayment } from "@/lib/telegram/access";

export const runtime = "nodejs";

const MAX_ACCESS_LINK_BODY_BYTES = 8 * 1024;

type TelegramAccessLinkBody = {
  checkoutSessionId?: string;
  offerId?: string;
  paymentIntentId?: string;
  productId?: string;
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

  if (isPayloadTooLarge(request, MAX_ACCESS_LINK_BODY_BYTES)) {
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
  const rateLimit = consumeRateLimit({
    key: `telegram:access-link:${requesterIp}`,
    limit: 90,
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

  try {
    const body = await parseJsonBody<TelegramAccessLinkBody>(request);

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
    const expectedProductId = (body.productId ?? "").trim();
    const expectedOfferId = (body.offerId ?? "").trim();

    if (!checkoutSessionId) {
      return jsonNoStore(
        {
          errorCode: "missing_checkout_session_id",
        },
        { status: 400 },
      );
    }

    let paymentRecord = paymentIntentId
      ? await findPaymentRecordByIntentId(paymentIntentId)
      : null;

    if (!paymentRecord) {
      paymentRecord =
        await findLatestSucceededPaymentRecordByCheckoutSessionId(checkoutSessionId);
    }

    if (!paymentRecord) {
      return jsonNoStore({
        status: "pending",
      });
    }

    if (paymentRecord.checkout_session_id !== checkoutSessionId) {
      return jsonNoStore(
        {
          errorCode: "payment_access_denied",
        },
        { status: 403 },
      );
    }

    if (
      (expectedProductId && expectedProductId !== paymentRecord.product_id) ||
      (expectedOfferId && expectedOfferId !== paymentRecord.offer_id)
    ) {
      return jsonNoStore(
        {
          errorCode: "payment_context_mismatch",
        },
        { status: 403 },
      );
    }

    if (paymentRecord.outcome !== "succeeded") {
      return jsonNoStore({
        status:
          paymentRecord.outcome === "failed" || paymentRecord.outcome === "canceled"
            ? "not_available"
            : "pending",
      });
    }

    const accessLink = await ensureTelegramAccessLinkForPayment(paymentRecord);

    if (accessLink.status !== "ready") {
      return jsonNoStore({
        reason: accessLink.reason,
        status: "not_available",
      });
    }

    return jsonNoStore({
      accessUrl: accessLink.accessUrl,
      status: "ready",
      tokenExpiresAt: accessLink.tokenExpiresAt,
    });
  } catch (error) {
    console.error("Failed to resolve Telegram access link", error);

    return jsonNoStore(
      {
        errorCode: "telegram_access_link_failed",
      },
      { status: 500 },
    );
  }
}
