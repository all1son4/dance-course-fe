import { NextResponse } from "next/server";
import Stripe from "stripe";

import {
  DEFAULT_CHECKOUT_PRODUCT,
  getProductPrice,
  getResolvedCheckoutCurrency,
  getSellableProductById,
  getSellableProductOfferById,
} from "@/constants/sellable-products";

export const runtime = "nodejs";

type CreatePaymentIntentBody = {
  customerData?: {
    name?: string;
    lastName?: string;
    email?: string;
    nickname?: string;
  };
  currency?: string;
  offerId?: string;
  productId?: string;
};

const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";

const getStripeServer = () => {
  if (!stripeSecretKey) {
    return null;
  }

  return new Stripe(stripeSecretKey);
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
    const body = (await request.json()) as CreatePaymentIntentBody;
    const customerData = body.customerData ?? {};
    const product = getSellableProductById(body.productId) ?? DEFAULT_CHECKOUT_PRODUCT;
    const offer =
      getSellableProductOfferById(product, body.offerId) ??
      product.offers.find((item) => item.id === product.defaultOfferId) ??
      product.offers[0];
    const currency = getResolvedCheckoutCurrency(body.currency);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: getProductPrice(product, offer.id, currency) * 100,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      receipt_email: customerData.email?.trim() || undefined,
      metadata: {
        checkout_currency: currency,
        offer_id: offer.id,
        offer_label: offer.label,
        customer_name: customerData.name?.trim() || "",
        customer_last_name: customerData.lastName?.trim() || "",
        customer_nickname: customerData.nickname?.trim() || "",
        product_id: product.id,
        product_title: product.title,
      },
    });

    if (!paymentIntent.client_secret) {
      return NextResponse.json({ errorCode: "missing_client_secret" }, { status: 500 });
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
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
