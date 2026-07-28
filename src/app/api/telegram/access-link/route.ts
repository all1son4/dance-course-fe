import {
  normalizeCheckoutSessionId,
  normalizePaymentIntentId,
} from "@/app/api/stripe/payment-intent/lib";
import {
  findLatestSucceededPaymentRecordByCheckoutSessionId,
  findPaymentRecordByIntentId,
  GoogleSheetsError,
  isGoogleSheetsRateLimitError,
} from "@/lib/google-sheets";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
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

type PaymentRecord = NonNullable<Awaited<ReturnType<typeof findPaymentRecordByIntentId>>>;
type AccessLinkResponse = ReturnType<typeof jsonNoStore>;

const findAccessPaymentRecord = async ({
  checkoutSessionId,
  paymentIntentId,
}: {
  checkoutSessionId: string;
  paymentIntentId: string;
}): Promise<PaymentRecord | null> => {
  const paymentIntentRecord = paymentIntentId
    ? await findPaymentRecordByIntentId(paymentIntentId)
    : null;

  return (
    paymentIntentRecord ??
    (await findLatestSucceededPaymentRecordByCheckoutSessionId(checkoutSessionId))
  );
};

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

  return null;
};

const resolveTelegramAccessResponse = async (
  paymentRecord: PaymentRecord,
): Promise<AccessLinkResponse> => {
  const onlineGroupAccess = await ensureOnlineGroupAccessForPayment(paymentRecord);

  if (onlineGroupAccess !== null) {
    if (onlineGroupAccess.length === 0) {
      return jsonNoStore({
        status: "pending",
      });
    }

    return jsonNoStore({
      accesses: onlineGroupAccess,
      status: onlineGroupAccess.some(
        (access) => access.status === "ready" || access.status === "active",
      )
        ? "ready"
        : "not_available",
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
};

const createAccessLinkErrorResponse = (error: unknown): AccessLinkResponse => {
  if (isGoogleSheetsRateLimitError(error)) {
    console.warn("Google Sheets rate limit reached while resolving Telegram access link");

    return jsonNoStore(
      {
        status: "pending",
      },
      {
        headers: {
          "Retry-After": "20",
        },
      },
    );
  }

  if (error instanceof GoogleSheetsError) {
    console.error("Failed to resolve Telegram access link in Google Sheets", {
      details: error.details,
      errorCode: error.code,
      status: error.status,
    });

    return jsonNoStore(
      {
        errorCode: "telegram_access_link_failed",
      },
      { status: 500 },
    );
  }

  console.error("Failed to resolve Telegram access link", error);

  return jsonNoStore(
    {
      errorCode: "telegram_access_link_failed",
    },
    { status: 500 },
  );
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
    const body = await parseJsonBody<TelegramAccessLinkBody>(request);

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

    const paymentRecord = await findAccessPaymentRecord({
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
