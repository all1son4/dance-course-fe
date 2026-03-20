import {
  DEFAULT_CHECKOUT_PRODUCT,
  getProductPrice,
  getResolvedCheckoutCurrency,
  getSellableProductById,
  getSellableProductOfferById,
} from "@/constants/sellable-products";
import {
  hasJsonContentType,
  isPayloadTooLarge,
  isTrustedBrowserOrigin,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";
import {
  getLocalizedSellableProductOfferLabel,
  getLocalizedSellableProductTitle,
} from "@/lib/sellable-products-localization";

import {
  createPaymentIntentIdempotencyKey,
  getResolvedCheckoutLocale,
  getStripeServer,
  normalizeCheckoutSessionId,
  normalizePaymentIntentCustomerData,
} from "./lib";

type CreatePaymentIntentBody = {
  checkoutLocale?: string;
  checkoutSessionId?: string;
  customerData?: {
    country?: string;
    fullName?: string;
    lessonLanguage?: string;
    email?: string;
    nickname?: string;
  };
  currency?: string;
  offerId?: string;
  productId?: string;
};

export const runtime = "nodejs";

const MAX_PAYMENT_INTENT_BODY_BYTES = 16 * 1024;

export async function POST(request: Request) {
  if (!isTrustedBrowserOrigin(request)) {
    return jsonNoStore(
      {
        errorCode: "invalid_origin",
      },
      { status: 403 },
    );
  }

  if (isPayloadTooLarge(request, MAX_PAYMENT_INTENT_BODY_BYTES)) {
    return jsonNoStore(
      {
        errorCode: "payload_too_large",
      },
      { status: 413 },
    );
  }

  if (!hasJsonContentType(request)) {
    return jsonNoStore(
      {
        errorCode: "unsupported_media_type",
      },
      { status: 415 },
    );
  }

  const requesterIp = getRequestIp(request);
  const rateLimit = await consumeRateLimit({
    key: `stripe:create-payment-intent:${requesterIp}`,
    limit: 60,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonNoStore(
      {
        errorCode: "rate_limited",
      },
      {
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
        status: 429,
      },
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

  try {
    const body = await parseJsonBody<CreatePaymentIntentBody>(request);

    if (!body) {
      return jsonNoStore(
        {
          errorCode: "invalid_request_body",
        },
        { status: 400 },
      );
    }

    const checkoutSessionId = normalizeCheckoutSessionId(body.checkoutSessionId);
    const checkoutLocale = getResolvedCheckoutLocale(body.checkoutLocale);
    const customerData = normalizePaymentIntentCustomerData(body.customerData ?? {});
    const product = getSellableProductById(body.productId) ?? DEFAULT_CHECKOUT_PRODUCT;
    const offer =
      getSellableProductOfferById(product, body.offerId) ??
      product.offers.find((item) => item.id === product.defaultOfferId) ??
      product.offers[0];
    const currency = getResolvedCheckoutCurrency(body.currency);
    const localizedProductTitle = getLocalizedSellableProductTitle(
      product,
      checkoutLocale,
    );
    const localizedOfferLabel = getLocalizedSellableProductOfferLabel(
      offer,
      checkoutLocale,
    );

    if (!checkoutSessionId) {
      return jsonNoStore(
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
        description: `${localizedProductTitle} - ${localizedOfferLabel}`,
        receipt_email: customerData.email || undefined,
        metadata: {
          checkout_currency: currency,
          checkout_locale: checkoutLocale,
          checkout_session_id: checkoutSessionId,
          offer_id: offer.id,
          offer_label: localizedOfferLabel,
          customer_full_name: customerData.fullName,
          customer_nickname: customerData.nickname,
          customer_country: customerData.country,
          lesson_language: product.type === "choreo" ? customerData.lessonLanguage : "",
          product_id: product.id,
          product_title: localizedProductTitle,
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
      return jsonNoStore({ errorCode: "missing_client_secret" }, { status: 500 });
    }

    return jsonNoStore({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Failed to create Stripe PaymentIntent", error);

    return jsonNoStore(
      {
        errorCode: "payment_intent_failed",
      },
      { status: 500 },
    );
  }
}
