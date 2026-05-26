import type Stripe from "stripe";

import { shouldRunPurchaseSuccessSideEffects } from "./eligibility";
import { sendPurchaseSuccessEmail } from "./purchase-email";
import { sendPurchaseAlert } from "./purchase-telegram-alert";
import type { StripeWebhookSyncResult } from "./types";

export const runWebhookSideEffects = async ({
  event,
  handledEvent,
  stripe,
}: {
  event: Stripe.Event;
  handledEvent: StripeWebhookSyncResult;
  stripe: Stripe;
}) => {
  if (!shouldRunPurchaseSuccessSideEffects(event)) {
    return;
  }

  try {
    await sendPurchaseSuccessEmail({
      event,
      handledEvent,
      stripe,
    });
  } catch (error) {
    console.error("Purchase success email side effect failed", {
      error,
      eventId: handledEvent.eventId,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });
  }

  try {
    await sendPurchaseAlert({
      event,
      handledEvent,
    });
  } catch (error) {
    console.error("Purchase alert side effect failed", {
      error,
      eventId: handledEvent.eventId,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });
  }
};
