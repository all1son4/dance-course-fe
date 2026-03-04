import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { GoogleSheetsError, isGoogleSheetsConfigured } from "@/lib/google-sheets";

import { getStripeServer } from "../payment-intent/lib";
import {
  isSupportedStripePaymentIntentEvent,
  syncStripePaymentEventToGoogleSheets,
} from "./lib";

const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripeServer();

  if (!stripe) {
    return NextResponse.json(
      {
        errorCode: "missing_secret_key",
      },
      { status: 500 },
    );
  }

  if (!isGoogleSheetsConfigured()) {
    return NextResponse.json(
      {
        errorCode: "google_sheets_not_configured",
      },
      { status: 500 },
    );
  }

  if (!stripeWebhookSecret) {
    return NextResponse.json(
      {
        errorCode: "missing_webhook_secret",
      },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
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

      return NextResponse.json(
        {
          errorCode: "invalid_webhook_signature",
        },
        { status: 400 },
      );
    }

    if (!isSupportedStripePaymentIntentEvent(event.type)) {
      return NextResponse.json({
        eventId: event.id,
        ignored: true,
        received: true,
        type: event.type,
      });
    }

    const handledEvent = await syncStripePaymentEventToGoogleSheets(event);

    if (
      handledEvent.paymentRecord.outcome === "failed" ||
      handledEvent.paymentRecord.outcome === "canceled"
    ) {
      console.warn("Stripe payment did not complete", {
        eventId: handledEvent.eventId,
        eventType: handledEvent.eventType,
        outcome: handledEvent.paymentRecord.outcome,
        paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
        status: handledEvent.paymentRecord.status,
      });
    }

    return NextResponse.json(handledEvent);
  } catch (error) {
    if (error instanceof GoogleSheetsError) {
      console.error("Failed to sync Stripe webhook to Google Sheets", {
        details: error.details,
        errorCode: error.code,
        status: error.status,
      });

      return NextResponse.json(
        {
          details: error.details,
          errorCode: error.code,
        },
        { status: 500 },
      );
    }

    console.error("Failed to process Stripe webhook", error);

    return NextResponse.json(
      {
        errorCode: "stripe_webhook_failed",
      },
      { status: 500 },
    );
  }
}
