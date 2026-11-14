import type Stripe from "stripe";

import { isInspirationHubOfferId } from "@/constants/sellable-products";
import { findPurchaseOutboxJobState } from "@/db/transactional-outbox";
import { logSafeError } from "@/lib/safe-error-log";
import { hasClosedSalesAtFulfilment } from "@/lib/sales-availability";
import { sendTelegramMessage } from "@/lib/telegram/bot-api";
import {
  getTelegramAlertsBotToken,
  getTelegramAlertsChatId,
  isTelegramAlertsConfigured,
} from "@/lib/telegram/config";
import { isOnlineGroupAccessOfferId } from "@/lib/telegram/offer-access";
import {
  listOnlineGroupAccessStatesForPayment,
  type OnlineGroupAccessState,
} from "@/lib/telegram/online-group-access";
import { toUtcIso } from "@/lib/time";

import {
  buildPurchaseAlertReplyMarkup,
  buildPurchaseAlertText,
  isEmailDeliveryInFlight,
} from "../purchase-alert";
import { shouldRunPurchaseSuccessSideEffects } from "./eligibility";
import { shouldSendPurchaseSideEffectForEnvironment } from "./runtime";
import type { StripeWebhookSyncResult } from "./types";

export class TelegramAlertDeliveryUncertainError extends Error {
  readonly retryable = false;

  constructor() {
    super("telegram_delivery_uncertain_manual_review_required");
    this.name = "TelegramAlertDeliveryUncertainError";
  }
}

const getOnlineGroupAccessStatesForAlert = async ({
  offerId,
  paymentIntentId,
}: {
  offerId: string;
  paymentIntentId: string;
}): Promise<OnlineGroupAccessState[] | null | undefined> => {
  if (!isOnlineGroupAccessOfferId(offerId) && !isInspirationHubOfferId(offerId)) {
    return undefined;
  }

  try {
    return await listOnlineGroupAccessStatesForPayment(paymentIntentId);
  } catch (error) {
    logSafeError("Failed to load Online Group access states for purchase alert", error);

    return null;
  }
};

/** The reason a rejected access job gave up; null when it did not. */
const getRejectedAccessReason = async (purchaseId: string | null) => {
  if (!purchaseId) return null;

  try {
    const job = await findPurchaseOutboxJobState(purchaseId, "telegram_access_delivery");
    return job?.status === "dead_letter"
      ? job.lastErrorMessage || "причина не записана"
      : null;
  } catch (error) {
    logSafeError("Failed to load the access job for purchase alert", error);
    return "статус не удалось проверить";
  }
};

const buildAlertTextForPayment = async ({
  event,
  handledEvent,
  paymentIntentId,
  paymentRecord,
  purchaseId,
}: {
  event: Stripe.Event;
  handledEvent: StripeWebhookSyncResult;
  paymentIntentId: string;
  paymentRecord: StripeWebhookSyncResult["paymentRecord"];
  purchaseId: string | null;
}) => {
  // Every read swallows its own failures, so none can reject the group.
  const [onlineGroupAccessStates, hasClosedSales, rejectedAccessReason] =
    await Promise.all([
      getOnlineGroupAccessStatesForAlert({
        offerId: paymentRecord.offer_id,
        paymentIntentId,
      }),
      hasClosedSalesAtFulfilment(paymentRecord.product_id, paymentRecord.offer_id),
      getRejectedAccessReason(purchaseId),
    ]);

  return buildPurchaseAlertText({
    rejectedAccessReason,
    eventCreatedAtIso: toUtcIso(event.created * 1000),
    eventId: handledEvent.eventId,
    eventType: handledEvent.eventType,
    hasClosedSales,
    onlineGroupAccessStates,
    paymentRecord,
    processedAtIso: toUtcIso(),
  });
};

export const deliverPurchaseAlertFromOutbox = async ({
  event,
  handledEvent,
  purchaseId = null,
}: {
  event: Stripe.Event;
  handledEvent: StripeWebhookSyncResult;
  purchaseId?: string | null;
}): Promise<{ externalMessageId?: string; skipped?: boolean }> => {
  if (
    !shouldRunPurchaseSuccessSideEffects(event) ||
    handledEvent.skipped ||
    handledEvent.paymentRecord.outcome !== "succeeded" ||
    !shouldSendPurchaseSideEffectForEnvironment(event)
  ) {
    return { skipped: true };
  }

  if (!isTelegramAlertsConfigured()) {
    throw new Error("telegram_alerts_not_configured");
  }

  const alertsChatId = getTelegramAlertsChatId();
  const alertsBotToken = getTelegramAlertsBotToken();

  if (!alertsChatId || !alertsBotToken) {
    throw new Error("telegram_alerts_not_configured");
  }

  const paymentIntentId = handledEvent.paymentRecord.payment_intent_id;

  // The alert is the operator's final report on the purchase: it must not
  // race the email/access job whose statuses it renders. While that job is
  // still running, back off so the outbox redelivers the alert once the
  // state is final.
  if (isEmailDeliveryInFlight(handledEvent.paymentRecord)) {
    throw new Error("purchase_alert_waiting_for_email_delivery");
  }

  const alertText = await buildAlertTextForPayment({
    event,
    handledEvent,
    paymentIntentId,
    paymentRecord: handledEvent.paymentRecord,
    purchaseId,
  });
  // Telegram Bot API has no idempotency key for sendMessage. The outbox owns the
  // durable deduplication and this adapter deliberately performs one provider attempt;
  // an uncertain response is dead-lettered for operator review instead of auto-sending
  // a possibly visible duplicate.
  let message: Awaited<ReturnType<typeof sendTelegramMessage>>;

  try {
    message = await sendTelegramMessage({
      botToken: alertsBotToken,
      chatId: alertsChatId,
      disableWebPagePreview: true,
      maxAttempts: 1,
      parseMode: "HTML",
      replyMarkup: buildPurchaseAlertReplyMarkup({
        isLiveMode: event.livemode,
        paymentIntentId,
      }),
      text: alertText,
    });
  } catch {
    throw new TelegramAlertDeliveryUncertainError();
  }

  return { externalMessageId: String(message.message_id) };
};
