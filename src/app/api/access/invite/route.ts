import { deliverPurchaseSuccessEmailFromOutbox } from "@/app/api/stripe/webhook/_lib/side-effects/purchase-email";
import { findVerifiedSucceededStripeEvent } from "@/db/admin-operations";
import { getDatabase } from "@/db/client";
import { findMyAccessPurchase, readMyAccessSnapshot } from "@/db/my-access";
import { findPaymentRecordByIntentIdFromDatabase } from "@/db/payment-records";
import { sendInvitationLinks } from "@/lib/access-invitations/service";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  jsonRateLimited,
  parseJsonBody,
} from "@/lib/http-security";
import { buildMyAccessCards } from "@/lib/my-access/cards";
import { isMyAccessLinkConfigured, verifyMyAccessToken } from "@/lib/my-access/link";
import { consumeRateLimit, consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";
import { getStripeServer } from "@/lib/stripe-checkout";
import {
  ensureTelegramAccessLinkForPayment,
  isStandardTelegramLinkPayment,
} from "@/lib/telegram/access";
import { ensureOnlineGroupAccessForPayment } from "@/lib/telegram/online-group-access";
import { DAY_MS } from "@/lib/time";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2 * 1024;
const MAX_CARD_ID_LENGTH = 128;
const TEN_MINUTES_MS = 10 * 60 * 1000;

type InviteBody = { card?: unknown; k?: unknown };

/**
 * «Прислать новую ссылку» on «Мой доступ»: the buyer's own version of the admin
 * repair (HUB-D38) — a fresh invite of an access never joined whose emailed link
 * has expired, delivered by resending the payment email to the purchase's address
 * (an admin invitation: its links email, see `sendInvitationLinks`).
 * The link never reaches the page. Only for a card that offers it right now, and
 * limited per address, per customer and per card.
 */
export async function POST(request: Request) {
  if (!isMyAccessLinkConfigured()) return jsonErrorNoStore("not_found", { status: 404 });

  const requestError = getBrowserJsonRequestErrorResponse(request, MAX_BODY_BYTES);
  if (requestError) return requestError;

  const ipLimit = await consumeRequestRateLimit({
    keyPrefix: "my-access:invite:ip",
    limit: 6,
    request,
    windowMs: TEN_MINUTES_MS,
  });
  if (ipLimit.limited) {
    return jsonRateLimited(ipLimit.retryAfterSeconds);
  }

  const { body, errorResponse } = await parseJsonBody<InviteBody>(
    request,
    MAX_BODY_BYTES,
  );
  if (errorResponse) return errorResponse;

  const customerId = verifyMyAccessToken(typeof body?.k === "string" ? body.k : null);
  const cardId = typeof body?.card === "string" ? body.card.trim() : "";
  if (!customerId || !cardId || cardId.length > MAX_CARD_ID_LENGTH) {
    return jsonErrorNoStore("not_found", { status: 404 });
  }

  try {
    const database = getDatabase();
    const snapshot = await readMyAccessSnapshot(database, customerId);
    const card = snapshot
      ? buildMyAccessCards(snapshot, new Date()).find(
          (candidate) => candidate.id === cardId,
        )
      : undefined;
    const purchaseId =
      card?.action?.key === "reissue" ? card.action.purchaseId : undefined;
    if (!purchaseId) return jsonErrorNoStore("not_needed", { status: 409 });

    const owned = await findMyAccessPurchase(database, purchaseId);

    // An invitation has no payment email: its own links email, limited by the emails
    // it actually sent, so a failed attempt never uses up the person's tries.
    if (owned?.invitationKind) {
      const result = await sendInvitationLinks(purchaseId);
      if (result.status === "sent" || result.status === "queued") {
        return jsonNoStore({ status: "sent" });
      }
      if (result.status === "limited") {
        return jsonRateLimited(result.retryAfterSeconds);
      }
      return result.status === "no_links"
        ? jsonErrorNoStore("no_link", { status: 409 })
        : jsonErrorNoStore("not_needed", { status: 409 });
    }

    // One new letter per card in ten minutes, three a day per customer.
    const [cardLimit, customerLimit] = await Promise.all([
      consumeRateLimit({
        key: `my-access:invite:card:${customerId}:${cardId}`,
        limit: 1,
        windowMs: TEN_MINUTES_MS,
      }),
      consumeRateLimit({
        key: `my-access:invite:customer:${customerId}`,
        limit: 3,
        windowMs: DAY_MS,
      }),
    ]);
    const limited = cardLimit.limited
      ? cardLimit
      : customerLimit.limited
        ? customerLimit
        : null;
    if (limited) {
      return jsonRateLimited(limited.retryAfterSeconds);
    }

    const paymentRecord = owned
      ? await findPaymentRecordByIntentIdFromDatabase(owned.paymentIntentId)
      : null;
    if (!paymentRecord || paymentRecord.outcome !== "succeeded") {
      return jsonErrorNoStore("not_needed", { status: 409 });
    }

    const onlineGroupAccess = await ensureOnlineGroupAccessForPayment(paymentRecord, {
      reissue: true,
    });
    const hasLink = onlineGroupAccess
      ? onlineGroupAccess.some((access) => access.accessUrl)
      : isStandardTelegramLinkPayment(paymentRecord) &&
        (await ensureTelegramAccessLinkForPayment(paymentRecord)).status === "ready";
    if (!hasLink) return jsonErrorNoStore("no_link", { status: 409 });

    const stripe = getStripeServer();
    const event = await findVerifiedSucceededStripeEvent(paymentRecord.payment_intent_id);
    if (!stripe || !event) return jsonErrorNoStore("send_failed", { status: 503 });

    // A fresh idempotency key: the original letter already used the stable one.
    const result = await deliverPurchaseSuccessEmailFromOutbox({
      event,
      idempotencyKey: `my-access-invite/${paymentRecord.payment_intent_id}/${Date.now()}`,
      paymentRecord,
      stripe,
    });

    return result.skipped
      ? jsonErrorNoStore("send_failed", { status: 503 })
      : jsonNoStore({ status: "sent" });
  } catch (error) {
    logSafeError("Failed to send a new access link from «Мой доступ»", error);
    return jsonErrorNoStore("send_failed", { status: 500 });
  }
}
