import {
  normalizeCheckoutSessionId,
  normalizePaymentIntentId,
} from "@/app/api/stripe/payment-intent/lib";
import { getDatabase } from "@/db/client";
import { findMyAccessCustomerIdForPaymentIntent } from "@/db/my-access";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { buildMyAccessPath } from "@/lib/my-access/link";
import { findPaymentAccessRecord } from "@/lib/payment-read-runtime";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";
import { ensureTelegramAccessLinkForPayment } from "@/lib/telegram/access";
import { ensureOnlineGroupAccessForPayment } from "@/lib/telegram/online-group-access";

export const runtime = "nodejs";

const MAX_ACCESS_LINK_BODY_BYTES = 8 * 1024;

type TelegramAccessLinkBody = {
  checkoutSessionId?: string;
  offerId?: string;
  paymentIntentId?: string;
  productId?: string;
};

type PaymentRecord = NonNullable<Awaited<ReturnType<typeof findPaymentAccessRecord>>>;
type AccessLinkResponse = ReturnType<typeof jsonNoStore>;

const getPaymentContextErrorResponse = ({
  checkoutSessionId,
  expectedOfferId,
  expectedProductId,
  paymentRecord,
}: {
  checkoutSessionId: string;
  expectedOfferId: string;
  expectedProductId: string;
  paymentRecord: PaymentRecord;
}): AccessLinkResponse | null => {
  if (paymentRecord.checkout_session_id !== checkoutSessionId) {
    return jsonErrorNoStore("payment_access_denied", { status: 403 });
  }

  if (
    (expectedProductId && expectedProductId !== paymentRecord.product_id) ||
    (expectedOfferId && expectedOfferId !== paymentRecord.offer_id)
  ) {
    return jsonErrorNoStore("payment_context_mismatch", { status: 403 });
  }

  if (paymentRecord.outcome !== "succeeded") {
    return jsonNoStore({
      status:
        paymentRecord.outcome === "failed" || paymentRecord.outcome === "canceled"
          ? "not_available"
          : "pending",
    });
  }

  return null;
};

/** «Мой доступ» of the buyer (HUB-D31); a lookup failure only hides the button. */
const resolveMyAccessPath = async (paymentRecord: PaymentRecord) => {
  try {
    const customerId = await findMyAccessCustomerIdForPaymentIntent(
      getDatabase(),
      paymentRecord.payment_intent_id,
    );

    return buildMyAccessPath(customerId) ?? undefined;
  } catch (error) {
    logSafeError("Failed to resolve the My access link", error);
    return undefined;
  }
};

const resolveTelegramAccessResponse = async (
  paymentRecord: PaymentRecord,
): Promise<AccessLinkResponse> => {
  const [onlineGroupAccess, myAccessUrl] = await Promise.all([
    ensureOnlineGroupAccessForPayment(paymentRecord),
    resolveMyAccessPath(paymentRecord),
  ]);

  if (onlineGroupAccess !== null) {
    if (onlineGroupAccess.length === 0) {
      return jsonNoStore({
        status: "pending",
      });
    }

    return jsonNoStore({
      accesses: onlineGroupAccess,
      myAccessUrl,
      // A scheduled Hub period (HUB-D37) is a settled answer, not a failure.
      status: onlineGroupAccess.some(
        (access) =>
          access.status === "ready" ||
          access.status === "active" ||
          access.status === "scheduled",
      )
        ? "ready"
        : "not_available",
    });
  }

  const accessLink = await ensureTelegramAccessLinkForPayment(paymentRecord);

  if (accessLink.status !== "ready") {
    return jsonNoStore({
      myAccessUrl,
      reason: accessLink.reason,
      status: "not_available",
    });
  }

  return jsonNoStore({
    accessUrl: accessLink.accessUrl,
    myAccessUrl,
    status: "ready",
    tokenExpiresAt: accessLink.tokenExpiresAt,
  });
};

const createAccessLinkErrorResponse = (error: unknown): AccessLinkResponse => {
  logSafeError("Failed to resolve Telegram access link", error);

  return jsonErrorNoStore("telegram_access_link_failed", { status: 500 });
};

export async function POST(request: Request) {
  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_ACCESS_LINK_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "telegram:access-link",
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

  try {
    const { body, errorResponse: bodyErrorResponse } =
      await parseJsonBody<TelegramAccessLinkBody>(request, MAX_ACCESS_LINK_BODY_BYTES);

    if (bodyErrorResponse) {
      return bodyErrorResponse;
    }

    if (!body) {
      return jsonErrorNoStore("invalid_request_body", { status: 400 });
    }

    const checkoutSessionId = normalizeCheckoutSessionId(body.checkoutSessionId);
    const paymentIntentId = normalizePaymentIntentId(body.paymentIntentId);
    const expectedProductId = (body.productId ?? "").trim();
    const expectedOfferId = (body.offerId ?? "").trim();

    if (!checkoutSessionId) {
      return jsonErrorNoStore("missing_checkout_session_id", { status: 400 });
    }

    const paymentRecord = await findPaymentAccessRecord({
      checkoutSessionId,
      paymentIntentId,
    });

    if (!paymentRecord) {
      return jsonNoStore({
        status: "pending",
      });
    }

    const contextErrorResponse = getPaymentContextErrorResponse({
      checkoutSessionId,
      expectedOfferId,
      expectedProductId,
      paymentRecord,
    });

    if (contextErrorResponse) {
      return contextErrorResponse;
    }

    return await resolveTelegramAccessResponse(paymentRecord);
  } catch (error) {
    return createAccessLinkErrorResponse(error);
  }
}
