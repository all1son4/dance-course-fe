import type Stripe from "stripe";

import { isGoogleSheetsRateLimitError } from "@/lib/google-sheets";
import { sendTelegramMessage } from "@/lib/telegram/bot-api";
import {
  getTelegramAlertsBotToken,
  getTelegramAlertsChatId,
  isTelegramAlertsConfigured,
} from "@/lib/telegram/config";
import { toUtcIso } from "@/lib/time";

import { buildPurchaseAlertText } from "../purchase-alert";
import { shouldRunPurchaseSuccessSideEffects } from "./eligibility";
import {
  hasFreshFallbackAlertSend,
  markFallbackAlertSent,
  tryAcquirePaymentProcessingLease,
  tryUpdatePurchaseAlertStatus,
} from "./payment-status-lease";
import { shouldSendPurchaseSideEffectForEnvironment } from "./runtime";
import type { StripeWebhookSyncResult } from "./types";

const pendingPurchaseAlertSyncs = new Map<string, Promise<void>>();

export const sendPurchaseAlert = async ({
  event,
  handledEvent,
}: {
  event: Stripe.Event;
  handledEvent: StripeWebhookSyncResult;
}) => {
  if (
    !shouldRunPurchaseSuccessSideEffects(event) ||
    handledEvent.skipped ||
    handledEvent.paymentRecord.outcome !== "succeeded"
  ) {
    return;
  }

  if (!shouldSendPurchaseSideEffectForEnvironment(event)) {
    console.warn(
      "Skipping purchase Telegram alert for Stripe test-mode event in non-production",
      {
        eventId: handledEvent.eventId,
        paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
      },
    );
    return;
  }

  if (!isTelegramAlertsConfigured()) {
    console.warn("Telegram alerts are not configured for purchase alerts", {
      eventId: handledEvent.eventId,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });
    return;
  }

  const alertsChatId = getTelegramAlertsChatId();
  const alertsBotToken = getTelegramAlertsBotToken();

  if (!alertsChatId || !alertsBotToken) {
    return;
  }

  const paymentIntentId = handledEvent.paymentRecord.payment_intent_id;
  const pendingSync = pendingPurchaseAlertSyncs.get(paymentIntentId);

  if (pendingSync) {
    await pendingSync;
    return;
  }

  const alertSyncPromise = (async () => {
    let latestPaymentRecord = handledEvent.paymentRecord;
    let shouldPersistAlertStatus = true;

    try {
      const alertLease = await tryAcquirePaymentProcessingLease({
        completedStatuses: new Set(["sent"]),
        fallbackPaymentRecord: handledEvent.paymentRecord,
        paymentIntentId,
        statusField: "with_mentor_alert_status",
        updatedAtField: "with_mentor_alert_updated_at",
      });

      if (!alertLease.acquired) {
        return;
      }

      latestPaymentRecord = alertLease.paymentRecord;
    } catch (error) {
      if (!isGoogleSheetsRateLimitError(error)) {
        throw error;
      }

      if (hasFreshFallbackAlertSend(paymentIntentId)) {
        console.warn("Skipping fallback purchase alert duplicate during Sheets backoff", {
          eventId: handledEvent.eventId,
          paymentIntentId,
        });
        return;
      }

      shouldPersistAlertStatus = false;
      console.warn(
        "Google Sheets is rate limited, sending purchase alert without lease",
        {
          eventId: handledEvent.eventId,
          paymentIntentId,
        },
      );
    }

    const alertText = buildPurchaseAlertText({
      eventCreatedAtIso: toUtcIso(event.created * 1000),
      eventId: handledEvent.eventId,
      eventType: handledEvent.eventType,
      paymentRecord: latestPaymentRecord,
      processedAtIso: toUtcIso(),
    });

    try {
      await sendTelegramMessage({
        botToken: alertsBotToken,
        chatId: alertsChatId,
        disableWebPagePreview: true,
        parseMode: "HTML",
        text: alertText,
      });

      console.warn("Sent purchase alert to Telegram group", {
        eventId: handledEvent.eventId,
        paymentIntentId,
      });

      if (shouldPersistAlertStatus) {
        await tryUpdatePurchaseAlertStatus({
          paymentRecord: latestPaymentRecord,
          status: "sent",
        });
      } else {
        markFallbackAlertSent(paymentIntentId);
      }
    } catch (error) {
      console.error("Failed to send purchase alert", {
        error,
        eventId: handledEvent.eventId,
        paymentIntentId,
      });

      if (shouldPersistAlertStatus) {
        await tryUpdatePurchaseAlertStatus({
          paymentRecord: latestPaymentRecord,
          status: "failed",
        });
      }

      throw error;
    }
  })().finally(() => {
    pendingPurchaseAlertSyncs.delete(paymentIntentId);
  });

  pendingPurchaseAlertSyncs.set(paymentIntentId, alertSyncPromise);
  await alertSyncPromise;
};
