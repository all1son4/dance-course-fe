import type Stripe from "stripe";

import { getDatabaseEnvSelection } from "@/db/env";
import { isPayloadTooLarge, jsonNoStore } from "@/lib/http-security";

import { getStripeServer } from "../payment-intent/lib";
import { scheduleStripeBackgroundJobs } from "./_lib/background-jobs";
import { persistVerifiedStripeWebhookEvent } from "./_lib/inbox-ingress";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const MAX_WEBHOOK_BODY_BYTES = 1_000_000;
const STRIPE_SIGNATURE_HEADER = "stripe-signature";

export const runtime = "nodejs";
export const maxDuration = 60;

type WebhookErrorCode =
  | "invalid_webhook_signature"
  | "missing_secret_key"
  | "missing_webhook_secret"
  | "missing_webhook_signature"
  | "payload_too_large"
  | "stripe_webhook_failed"
  | "stripe_webhook_inbox_failed";

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

export async function POST(request: Request): Promise<Response> {
  if (isPayloadTooLarge(request, MAX_WEBHOOK_BODY_BYTES)) {
    return createWebhookErrorResponse("payload_too_large", 413);
  }

  const stripe = getStripeServer();

  if (!stripe) {
    return createWebhookErrorResponse("missing_secret_key", 500);
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    return createWebhookErrorResponse("missing_webhook_secret", 500);
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

    scheduleStripeBackgroundJobs();

    return jsonNoStore({
      eventId: verifiedEvent.event.id,
      queued: true,
      received: true,
      type: verifiedEvent.event.type,
    });
  } catch (error) {
    console.error("Failed to process Stripe webhook", error);

    return createWebhookErrorResponse("stripe_webhook_failed", 500);
  }
}
