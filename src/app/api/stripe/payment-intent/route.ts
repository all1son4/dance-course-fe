import { NextResponse } from "next/server";

import {
  DEFAULT_CHECKOUT_PRODUCT,
  getProductPrice,
  getResolvedCheckoutCurrency,
  getSellableProductById,
  getSellableProductOfferById,
} from "@/constants/sellable-products";

import {
  createPaymentIntentIdempotencyKey,
  getStripeServer,
  normalizeCheckoutSessionId,
} from "./lib";

type CreatePaymentIntentBody = {
  checkoutSessionId?: string;
  customerData?: {
    country?: string;
    name?: string;
    lastName?: string;
    email?: string;
    nickname?: string;
  };
  currency?: string;
  offerId?: string;
  productId?: string;
};

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

  try {
    const body = (await request.json()) as CreatePaymentIntentBody;
    const checkoutSessionId = normalizeCheckoutSessionId(body.checkoutSessionId);
    const customerData = body.customerData ?? {};
    const product = getSellableProductById(body.productId) ?? DEFAULT_CHECKOUT_PRODUCT;
    const offer =
      getSellableProductOfferById(product, body.offerId) ??
      product.offers.find((item) => item.id === product.defaultOfferId) ??
      product.offers[0];
    const currency = getResolvedCheckoutCurrency(body.currency);

    if (!checkoutSessionId) {
      return NextResponse.json(
        {
          errorCode: "missing_checkout_session_id",
        },
        { status: 400 },
      );
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: getProductPrice(product, offer.id, currency) * 100,
        currency,
        automatic_payment_methods: {
          enabled: true,
        },
        description: `${product.title} - ${offer.label}`,
        receipt_email: customerData.email?.trim() || undefined,
        metadata: {
          checkout_currency: currency,
          checkout_session_id: checkoutSessionId,
          offer_id: offer.id,
          offer_label: offer.label,
          customer_name: customerData.name?.trim() || "",
          customer_last_name: customerData.lastName?.trim() || "",
          customer_nickname: customerData.nickname?.trim() || "",
          customer_country: customerData.country?.trim() || "",
          product_id: product.id,
          product_title: product.title,
        },
      },
      {
        idempotencyKey: createPaymentIntentIdempotencyKey({
          checkoutSessionId,
          currency,
          customerData,
          offerId: offer.id,
          productId: product.id,
        }),
      },
    );

    if (!paymentIntent.client_secret) {
      return NextResponse.json({ errorCode: "missing_client_secret" }, { status: 500 });
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Failed to create Stripe PaymentIntent", error);

    return NextResponse.json(
      {
        errorCode: "payment_intent_failed",
      },
      { status: 500 },
    );
  }
}
