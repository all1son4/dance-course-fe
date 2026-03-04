import { NextResponse } from "next/server";

import {
  getManagedPaymentIntentSnapshot,
  getStripeServer,
  normalizePaymentIntentId,
} from "../lib";

export const runtime = "nodejs";

type PaymentIntentStatusBody = {
  paymentIntentId?: string;
};

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

  try {
    const body = (await request.json()) as PaymentIntentStatusBody;
    const paymentIntentId = normalizePaymentIntentId(body.paymentIntentId);

    if (!paymentIntentId) {
      return NextResponse.json(
        {
          errorCode: "missing_payment_intent_id",
        },
        { status: 400 },
      );
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    return NextResponse.json(getManagedPaymentIntentSnapshot(paymentIntent));
  } catch (error) {
    console.error("Failed to retrieve Stripe PaymentIntent status", error);

    return NextResponse.json(
      {
        errorCode: "payment_intent_status_failed",
      },
      { status: 500 },
    );
  }
}
