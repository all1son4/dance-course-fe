import { NextResponse } from "next/server";

import {
  getManagedPaymentIntentSnapshot,
  getStripeServer,
  normalizePaymentIntentId,
} from "../lib";

export const runtime = "nodejs";

type CancelPaymentIntentBody = {
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
    const body = (await request.json()) as CancelPaymentIntentBody;
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
    const nonCancelableStatuses = new Set(["canceled", "succeeded"]);

    if (nonCancelableStatuses.has(paymentIntent.status)) {
      return NextResponse.json(getManagedPaymentIntentSnapshot(paymentIntent));
    }

    const canceledPaymentIntent = await stripe.paymentIntents.cancel(paymentIntent.id);

    return NextResponse.json(getManagedPaymentIntentSnapshot(canceledPaymentIntent));
  } catch (error) {
    console.error("Failed to cancel Stripe PaymentIntent", error);

    return NextResponse.json(
      {
        errorCode: "payment_intent_cancel_failed",
      },
      { status: 500 },
    );
  }
}
