import type Stripe from "stripe";

import { getDatabaseEnvSelection } from "@/db/env";
import { GoogleSheetsError, isGoogleSheetsConfigured } from "@/lib/google-sheets";
import { isPayloadTooLarge, jsonNoStore } from "@/lib/http-security";

import { getStripeServer } from "../payment-intent/lib";
import {
  syncStripeChargeSettlementToDatabase,
  syncStripeWebhookEventToDatabase,
} from "./_lib/database-sync";
import { runWebhookSideEffects } from "./_lib/side-effects";
import {
  isSupportedStripePaymentIntentEvent,
  syncStripePaymentEventToGoogleSheets,
} from "./_lib/sync";

const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const MAX_WEBHOOK_BODY_BYTES = 1_000_000;

export const runtime = "nodejs";

const STRIPE_CHARGE_SETTLEMENT_EVENT_TYPES = new Set([
  "charge.succeeded",
  "charge.updated",
]);

const trySyncStripeWebhookEventToDatabase = async ({
  event,
  handledEvent,
  stripe,
}: {
  event: Stripe.Event;
  handledEvent: Awaited<ReturnType<typeof syncStripePaymentEventToGoogleSheets>>;
  stripe: Stripe;
}) => {
  const databaseEnv = getDatabaseEnvSelection("pooled");

  try {
    await syncStripeWebhookEventToDatabase({
      event,
      handledEvent,
      stripe,
    });

    console.warn("Stripe webhook synced to database", {
      databaseEnv,
      eventId: handledEvent.eventId,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });

    return {
      databaseEnv,
      status: "synced" as const,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown database sync error.";

    console.error("Failed to sync Stripe webhook to database", {
      databaseEnv,
      error,
      eventId: handledEvent.eventId,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });

    return {
      databaseEnv,
      error,
      errorMessage,
      status: "failed" as const,
    };
  }
};

export async function POST(request: Request) {
  if (isPayloadTooLarge(request, MAX_WEBHOOK_BODY_BYTES)) {
    return jsonNoStore(
      {
        errorCode: "payload_too_large",
      },
      { status: 413 },
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

  if (!isGoogleSheetsConfigured()) {
    return jsonNoStore(
      {
        errorCode: "google_sheets_not_configured",
      },
      { status: 500 },
    );
  }

  if (!stripeWebhookSecret) {
    return jsonNoStore(
      {
        errorCode: "missing_webhook_secret",
      },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return jsonNoStore(
      {
        errorCode: "missing_webhook_signature",
      },
      { status: 400 },
    );
  }

  try {
    const payload = await request.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(payload, signature, stripeWebhookSecret);
    } catch (error) {
      console.error("Failed to verify Stripe webhook signature", error);

      return jsonNoStore(
        {
          errorCode: "invalid_webhook_signature",
        },
        { status: 400 },
      );
    }

    if (STRIPE_CHARGE_SETTLEMENT_EVENT_TYPES.has(event.type)) {
      try {
        const settlementSync = await syncStripeChargeSettlementToDatabase({
          event,
          stripe,
        });

        console.warn("Stripe charge settlement synced to database", {
          eventId: event.id,
          eventType: event.type,
          paymentIntentId: settlementSync.paymentIntentId,
          status: settlementSync.status,
          stripeBalanceTransactionId: settlementSync.stripeBalanceTransactionId,
        });

        return jsonNoStore({
          databaseSync: settlementSync,
          eventId: event.id,
          received: true,
          type: event.type,
        });
      } catch (error) {
        console.error("Failed to sync Stripe charge settlement to database", {
          error,
          eventId: event.id,
          eventType: event.type,
        });

        if (process.env.NODE_ENV !== "production") {
          throw error;
        }

        return jsonNoStore({
          databaseSync: {
            status: "failed",
          },
          eventId: event.id,
          received: true,
          type: event.type,
        });
      }
    }

    if (!isSupportedStripePaymentIntentEvent(event.type)) {
      return jsonNoStore({
        eventId: event.id,
        ignored: true,
        received: true,
        type: event.type,
      });
    }

    if (event.type === "checkout.session.completed") {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;

      if (checkoutSession.mode !== "payment" || !checkoutSession.payment_intent) {
        return jsonNoStore({
          eventId: event.id,
          ignored: true,
          received: true,
          type: event.type,
        });
      }
    }

    const handledEvent = await syncStripePaymentEventToGoogleSheets(event);

    const initialDatabaseSync = await trySyncStripeWebhookEventToDatabase({
      event,
      handledEvent,
      stripe,
    });

    if (
      initialDatabaseSync.status === "failed" &&
      process.env.NODE_ENV !== "production"
    ) {
      throw initialDatabaseSync.error;
    }

    await runWebhookSideEffects({
      event,
      handledEvent,
      stripe,
    });

    const finalDatabaseSync = await trySyncStripeWebhookEventToDatabase({
      event,
      handledEvent,
      stripe,
    });

    if (finalDatabaseSync.status === "failed" && process.env.NODE_ENV !== "production") {
      throw finalDatabaseSync.error;
    }

    if (
      !handledEvent.skipped &&
      (handledEvent.paymentRecord.outcome === "failed" ||
        handledEvent.paymentRecord.outcome === "canceled")
    ) {
      console.warn("Stripe payment did not complete", {
        eventId: handledEvent.eventId,
        eventType: handledEvent.eventType,
        outcome: handledEvent.paymentRecord.outcome,
        paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
        status: handledEvent.paymentRecord.status,
      });
    }

    return jsonNoStore({
      ...handledEvent,
      databaseSync: {
        afterSheets: initialDatabaseSync,
        afterSideEffects: finalDatabaseSync,
      },
    });
  } catch (error) {
    if (error instanceof GoogleSheetsError) {
      console.error("Failed to sync Stripe webhook to Google Sheets", {
        details: error.details,
        errorCode: error.code,
        status: error.status,
      });

      return jsonNoStore(
        {
          errorCode: "stripe_webhook_sync_failed",
        },
        { status: 500 },
      );
    }

    console.error("Failed to process Stripe webhook", error);

    return jsonNoStore(
      {
        errorCode: "stripe_webhook_failed",
      },
      { status: 500 },
    );
  }
}
