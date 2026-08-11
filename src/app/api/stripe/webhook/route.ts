import type Stripe from "stripe";

import { getDatabaseEnvSelection } from "@/db/env";
import { GoogleSheetsError, isGoogleSheetsConfigured } from "@/lib/google-sheets";
import { isPayloadTooLarge, jsonNoStore } from "@/lib/http-security";

import { getStripeServer } from "../payment-intent/lib";
import {
  syncStripeChargeSettlementToDatabase,
  syncStripeWebhookEventToDatabase,
} from "./_lib/database-sync";
import { persistVerifiedStripeWebhookEvent } from "./_lib/inbox-ingress";
import { runWebhookSideEffects } from "./_lib/side-effects";
import {
  isSupportedStripePaymentIntentEvent,
  syncStripePaymentEventToGoogleSheets,
} from "./_lib/sync";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const MAX_WEBHOOK_BODY_BYTES = 1_000_000;
const STRIPE_SIGNATURE_HEADER = "stripe-signature";
const UNKNOWN_DATABASE_SYNC_ERROR = "Unknown database sync error.";

export const runtime = "nodejs";

const STRIPE_CHARGE_SETTLEMENT_EVENT_TYPES = new Set<string>([
  "charge.succeeded",
  "charge.updated",
]);

type HandledStripePaymentEvent = Awaited<
  ReturnType<typeof syncStripePaymentEventToGoogleSheets>
>;

type DatabaseSyncResult =
  | {
      databaseEnv: ReturnType<typeof getDatabaseEnvSelection>;
      status: "synced";
    }
  | {
      databaseEnv: ReturnType<typeof getDatabaseEnvSelection>;
      error: unknown;
      errorMessage: string;
      status: "failed";
    };

type WebhookErrorCode =
  | "google_sheets_not_configured"
  | "invalid_webhook_signature"
  | "missing_secret_key"
  | "missing_webhook_secret"
  | "missing_webhook_signature"
  | "payload_too_large"
  | "stripe_webhook_failed"
  | "stripe_webhook_inbox_failed"
  | "stripe_webhook_sync_failed";

type VerifiedStripeEvent =
  | {
      event: Stripe.Event;
      response?: never;
    }
  | {
      event?: never;
      response: Response;
    };

const getSafeErrorName = (error: unknown): string =>
  error instanceof Error ? error.name : "UnknownError";

const trySyncStripeWebhookEventToDatabase = async ({
  event,
  handledEvent,
  stripe,
}: {
  event: Stripe.Event;
  handledEvent: HandledStripePaymentEvent;
  stripe: Stripe;
}): Promise<DatabaseSyncResult> => {
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
      error instanceof Error ? error.message : UNKNOWN_DATABASE_SYNC_ERROR;

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

const createWebhookErrorResponse = (
  errorCode: WebhookErrorCode,
  status: 400 | 413 | 500,
): Response =>
  jsonNoStore(
    {
      errorCode,
    },
    { status },
  );

const getWebhookVerificationConfigurationErrorResponse = (): Response | null => {
  if (!STRIPE_WEBHOOK_SECRET) {
    return createWebhookErrorResponse("missing_webhook_secret", 500);
  }

  return null;
};

const getLegacyProcessingConfigurationErrorResponse = (): Response | null =>
  isGoogleSheetsConfigured()
    ? null
    : createWebhookErrorResponse("google_sheets_not_configured", 500);

const verifyStripeWebhookEvent = ({
  payload,
  signature,
  stripe,
}: {
  payload: string;
  signature: string;
  stripe: Stripe;
}): VerifiedStripeEvent => {
  try {
    return {
      event: stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET),
    };
  } catch (error) {
    console.error("Failed to verify Stripe webhook signature", {
      errorName: getSafeErrorName(error),
    });

    return {
      response: createWebhookErrorResponse("invalid_webhook_signature", 400),
    };
  }
};

const persistVerifiedStripeEventBeforeProcessing = async (
  event: Stripe.Event,
): Promise<Response | null> => {
  const databaseEnv = getDatabaseEnvSelection("pooled");

  try {
    const receipt = await persistVerifiedStripeWebhookEvent({ event });

    console.warn("Verified Stripe event persisted to inbox", {
      databaseEnv,
      duplicate: receipt.duplicate,
      eventId: event.id,
      eventType: event.type,
      processingStatus: receipt.processingStatus,
    });

    return null;
  } catch (error) {
    console.error("Failed to persist verified Stripe event to inbox", {
      databaseEnv,
      errorName: getSafeErrorName(error),
      eventId: event.id,
      eventType: event.type,
    });

    return createWebhookErrorResponse("stripe_webhook_inbox_failed", 500);
  }
};

const handleChargeSettlementEvent = async ({
  event,
  stripe,
}: {
  event: Stripe.Event;
  stripe: Stripe;
}): Promise<Response> => {
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
};

const createIgnoredEventResponse = (event: Stripe.Event): Response =>
  jsonNoStore({
    eventId: event.id,
    ignored: true,
    received: true,
    type: event.type,
  });

const shouldIgnoreCheckoutSessionEvent = (event: Stripe.Event): boolean => {
  if (event.type !== "checkout.session.completed") {
    return false;
  }

  const checkoutSession = event.data.object as Stripe.Checkout.Session;

  return checkoutSession.mode !== "payment" || !checkoutSession.payment_intent;
};

const throwFailedDatabaseSyncInDevelopment = (databaseSync: DatabaseSyncResult): void => {
  if (databaseSync.status === "failed" && process.env.NODE_ENV !== "production") {
    throw databaseSync.error;
  }
};

const warnAboutIncompletePayment = (handledEvent: HandledStripePaymentEvent): void => {
  if (
    handledEvent.skipped ||
    (handledEvent.paymentRecord.outcome !== "failed" &&
      handledEvent.paymentRecord.outcome !== "canceled")
  ) {
    return;
  }

  console.warn("Stripe payment did not complete", {
    eventId: handledEvent.eventId,
    eventType: handledEvent.eventType,
    outcome: handledEvent.paymentRecord.outcome,
    paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    status: handledEvent.paymentRecord.status,
  });
};

const processStripePaymentEvent = async ({
  event,
  stripe,
}: {
  event: Stripe.Event;
  stripe: Stripe;
}): Promise<Response> => {
  const handledEvent = await syncStripePaymentEventToGoogleSheets(event);

  const initialDatabaseSync = await trySyncStripeWebhookEventToDatabase({
    event,
    handledEvent,
    stripe,
  });

  throwFailedDatabaseSyncInDevelopment(initialDatabaseSync);

  // The first sync persists the Sheets result before delivery side effects run.
  await runWebhookSideEffects({
    event,
    handledEvent,
    stripe,
  });

  // Re-sync intentionally reconciles delivery statuses produced by the side effects.
  const finalDatabaseSync = await trySyncStripeWebhookEventToDatabase({
    event,
    handledEvent,
    stripe,
  });

  throwFailedDatabaseSyncInDevelopment(finalDatabaseSync);
  warnAboutIncompletePayment(handledEvent);

  return jsonNoStore({
    ...handledEvent,
    databaseSync: {
      afterSheets: initialDatabaseSync,
      afterSideEffects: finalDatabaseSync,
    },
  });
};

const handleVerifiedStripeEvent = async ({
  event,
  stripe,
}: {
  event: Stripe.Event;
  stripe: Stripe;
}): Promise<Response> => {
  if (STRIPE_CHARGE_SETTLEMENT_EVENT_TYPES.has(event.type)) {
    return handleChargeSettlementEvent({ event, stripe });
  }

  if (!isSupportedStripePaymentIntentEvent(event.type)) {
    return createIgnoredEventResponse(event);
  }

  if (shouldIgnoreCheckoutSessionEvent(event)) {
    return createIgnoredEventResponse(event);
  }

  return processStripePaymentEvent({ event, stripe });
};

const createWebhookProcessingErrorResponse = (error: unknown): Response => {
  if (error instanceof GoogleSheetsError) {
    console.error("Failed to sync Stripe webhook to Google Sheets", {
      details: error.details,
      errorCode: error.code,
      status: error.status,
    });

    return createWebhookErrorResponse("stripe_webhook_sync_failed", 500);
  }

  console.error("Failed to process Stripe webhook", error);

  return createWebhookErrorResponse("stripe_webhook_failed", 500);
};

export async function POST(request: Request): Promise<Response> {
  if (isPayloadTooLarge(request, MAX_WEBHOOK_BODY_BYTES)) {
    return createWebhookErrorResponse("payload_too_large", 413);
  }

  const stripe = getStripeServer();

  if (!stripe) {
    return createWebhookErrorResponse("missing_secret_key", 500);
  }

  const configurationErrorResponse = getWebhookVerificationConfigurationErrorResponse();

  if (configurationErrorResponse) {
    return configurationErrorResponse;
  }

  const signature = request.headers.get(STRIPE_SIGNATURE_HEADER);

  if (!signature) {
    return createWebhookErrorResponse("missing_webhook_signature", 400);
  }

  try {
    const payload = await request.text();
    const verifiedEvent = verifyStripeWebhookEvent({
      payload,
      signature,
      stripe,
    });

    if (verifiedEvent.response) {
      return verifiedEvent.response;
    }

    const inboxPersistenceErrorResponse =
      await persistVerifiedStripeEventBeforeProcessing(verifiedEvent.event);

    if (inboxPersistenceErrorResponse) {
      return inboxPersistenceErrorResponse;
    }

    const legacyProcessingConfigurationErrorResponse =
      getLegacyProcessingConfigurationErrorResponse();

    if (legacyProcessingConfigurationErrorResponse) {
      return legacyProcessingConfigurationErrorResponse;
    }

    return await handleVerifiedStripeEvent({
      event: verifiedEvent.event,
      stripe,
    });
  } catch (error) {
    return createWebhookProcessingErrorResponse(error);
  }
}
