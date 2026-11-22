import { createHash } from "node:crypto";

import { after } from "next/server";

import { getDatabase } from "@/db/client";
import { findMyAccessCustomerIdByEmail } from "@/db/my-access";
import { normalizeEmail } from "@/db/record-values";
import { buildMyAccessLinkEmail } from "@/lib/email/my-access";
import { isResendConfigured, sendResendEmail } from "@/lib/email/resend";
import { EMAIL_PATTERN } from "@/lib/email-suggestion";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  jsonRateLimited,
  parseJsonBody,
} from "@/lib/http-security";
import { buildMyAccessUrl, isMyAccessLinkConfigured } from "@/lib/my-access/link";
import { consumeRateLimit, consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";
import { HOUR_MS } from "@/lib/time";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2 * 1024;
const TEN_MINUTES_MS = 10 * 60 * 1000;

type RequestLinkBody = { email?: unknown; locale?: unknown };

/**
 * «Прислать ссылку» (HUB-D30): the answer is the same whether or not the address
 * has purchases, and the email itself is sent after the response, so neither the
 * body nor the timing tells. Limits per IP and per address; the address reaches
 * the limiter only as a hash.
 */
export async function POST(request: Request) {
  const requestError = getBrowserJsonRequestErrorResponse(request, MAX_BODY_BYTES);
  if (requestError) return requestError;

  const ipLimit = await consumeRequestRateLimit({
    keyPrefix: "my-access:link:ip",
    limit: 5,
    request,
    windowMs: TEN_MINUTES_MS,
  });
  if (ipLimit.limited) {
    return jsonRateLimited(ipLimit.retryAfterSeconds);
  }

  const { body, errorResponse } = await parseJsonBody<RequestLinkBody>(
    request,
    MAX_BODY_BYTES,
  );
  if (errorResponse) return errorResponse;

  const email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
  const locale = typeof body?.locale === "string" ? body.locale : null;

  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return jsonErrorNoStore("invalid_email", { status: 400 });
  }

  const emailLimit = await consumeRateLimit({
    key: `my-access:link:email:${createHash("sha256").update(email).digest("hex")}`,
    limit: 3,
    windowMs: HOUR_MS,
  });

  // Over the per-address limit the answer stays the same; only nothing is sent.
  if (!emailLimit.limited && isMyAccessLinkConfigured() && isResendConfigured()) {
    after(async () => {
      try {
        const customerId = await findMyAccessCustomerIdByEmail(getDatabase(), email);
        const url = buildMyAccessUrl(customerId, locale);
        if (!url) return;

        await sendResendEmail({
          ...buildMyAccessLinkEmail({ locale, url }),
          sender: "hello",
          to: email,
        });
      } catch (error) {
        logSafeError("Failed to send the My access link", error);
      }
    });
  }

  return jsonNoStore({ status: "accepted" });
}
