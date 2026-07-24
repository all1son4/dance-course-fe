import {
  DEFAULT_CHECKOUT_PRODUCT,
  getProductPrice,
  getResolvedCheckoutCurrency,
  getSellableProductById,
  getSellableProductOfferById,
  isOnlineGroupLibraryOfferId,
  isOnlineGroupNewOfferId,
} from "@/constants/sellable-products";
import {
  getActiveOnlineGroupCampaign,
  getActiveOnlineGroupTargetByOfferId,
} from "@/db/online-group-campaigns";
import { findValidRenewalVerification } from "@/db/renewal-campaigns";
import { getCheckoutSelectionFromDatabase } from "@/db/sellable-products";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
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
    address?: string;
    city?: string;
    country?: string;
    fullName?: string;
    lessonLanguage?: string;
    email?: string;
    nickname?: string;
    postalCode?: string;
  };
  currency?: string;
  offerId?: string;
  productId?: string;
  renewalCampaignSlug?: string;
};

export const runtime = "nodejs";

const MAX_PAYMENT_INTENT_BODY_BYTES = 16 * 1024;

const getFallbackCheckoutSelection = ({
  currency,
  offerId,
  productId,
}: {
  currency: ReturnType<typeof getResolvedCheckoutCurrency>;
  offerId?: string;
  productId?: string;
}) => {
  const product = getSellableProductById(productId) ?? DEFAULT_CHECKOUT_PRODUCT;
  const offer =
    getSellableProductOfferById(product, offerId) ??
    product.offers.find((item) => item.id === product.defaultOfferId) ??
    product.offers[0];

  return {
    amountMinor: getProductPrice(product, offer.id, currency) * 100,
    offer,
    product,
  };
};

const getCheckoutSelection = async ({
  currency,
  offerId,
  productId,
}: {
  currency: ReturnType<typeof getResolvedCheckoutCurrency>;
  offerId?: string;
  productId?: string;
}) => {
  const fallbackSelection = getFallbackCheckoutSelection({
    currency,
    offerId,
    productId,
  });

  try {
    return (
      (await getCheckoutSelectionFromDatabase({
        currency,
        offerId,
        productId: fallbackSelection.product.id,
      })) ?? fallbackSelection
    );
  } catch (error) {
    console.warn(
      "Failed to load checkout product selection from database, falling back to constants",
      { error, productId: fallbackSelection.product.id },
    );

    return fallbackSelection;
  }
};

export async function POST(request: Request) {
  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_PAYMENT_INTENT_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "stripe:create-payment-intent",
    limit: 60,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonErrorNoStore("rate_limited", {
      headers: {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
      status: 429,
    });
  }

  const stripe = getStripeServer();

  if (!stripe) {
    return jsonErrorNoStore("missing_secret_key", { status: 500 });
  }

  try {
    const body = await parseJsonBody<CreatePaymentIntentBody>(request);

    if (!body) {
      return jsonErrorNoStore("invalid_request_body", { status: 400 });
    }

    const checkoutSessionId = normalizeCheckoutSessionId(body.checkoutSessionId);
    const checkoutLocale = getResolvedCheckoutLocale(body.checkoutLocale);
    const customerData = normalizePaymentIntentCustomerData(body.customerData ?? {});
    const currency = getResolvedCheckoutCurrency(body.currency);
    const { amountMinor, offer, product } = await getCheckoutSelection({
      currency,
      offerId: body.offerId,
      productId: body.productId,
    });
    const renewalCampaignSlug = (body.renewalCampaignSlug ?? "").trim();
    const renewalVerification = renewalCampaignSlug
      ? await findValidRenewalVerification({
          checkoutSessionId,
          slug: renewalCampaignSlug,
        })
      : null;
    const onlineGroupTarget = isOnlineGroupNewOfferId(offer.id)
      ? await getActiveOnlineGroupTargetByOfferId(offer.id)
      : null;
    const renewalOnlineGroupSettings = renewalVerification
      ? await getActiveOnlineGroupCampaign()
      : null;

    if (
      (renewalCampaignSlug || offer.accessWorkflow === "telegram-renewal") &&
      !renewalVerification
    ) {
      return jsonErrorNoStore("telegram_renewal_verification_required", {
        status: 403,
      });
    }

    if (
      renewalVerification &&
      (renewalVerification.campaign.productExternalId !== product.id ||
        renewalVerification.campaign.offerExternalId !== offer.id)
    ) {
      return jsonErrorNoStore("renewal_payment_context_mismatch", {
        status: 403,
      });
    }

    if (
      renewalVerification &&
      (!renewalOnlineGroupSettings ||
        renewalOnlineGroupSettings.regularChatId !==
          renewalVerification.campaign.targetChatId)
    ) {
      return jsonErrorNoStore("renewal_campaign_inactive", {
        status: 409,
      });
    }

    if (isOnlineGroupNewOfferId(offer.id) && !onlineGroupTarget) {
      return jsonErrorNoStore("online_group_campaign_not_configured", {
        status: 409,
      });
    }

    const localizedProductTitle = getLocalizedSellableProductTitle(
      product,
      checkoutLocale,
    );
    const localizedOfferLabel = getLocalizedSellableProductOfferLabel(
      offer,
      checkoutLocale,
    );

    if (!checkoutSessionId) {
      return jsonErrorNoStore("missing_checkout_session_id", { status: 400 });
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountMinor,
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
          ...(renewalVerification
            ? {
                access_workflow: "telegram-renewal",
                delivery_channel: "telegram",
                renewal_campaign_id: renewalVerification.campaign.id,
                renewal_campaign_slug: renewalVerification.campaign.slug,
                telegram_channel_chat_id: renewalVerification.campaign.targetChatId,
                ...(isOnlineGroupLibraryOfferId(offer.id) && renewalOnlineGroupSettings
                  ? {
                      telegram_inspiration_access_expires_at:
                        renewalOnlineGroupSettings.endsAt.toISOString(),
                      telegram_inspiration_chat_id:
                        renewalOnlineGroupSettings.libraryChatId,
                    }
                  : {}),
                telegram_user_id: renewalVerification.verification.telegramUserId,
                telegram_username:
                  renewalVerification.verification.telegramUsername ?? "",
              }
            : onlineGroupTarget
              ? {
                  access_workflow: "telegram-online-group",
                  delivery_channel: "telegram",
                  online_group_campaign_id: onlineGroupTarget.campaign.id,
                  telegram_channel_chat_id: onlineGroupTarget.mainChatId,
                  ...(onlineGroupTarget.inspirationChatId &&
                  onlineGroupTarget.inspirationAccessExpiresAt
                    ? {
                        telegram_inspiration_access_expires_at:
                          onlineGroupTarget.inspirationAccessExpiresAt.toISOString(),
                        telegram_inspiration_chat_id: onlineGroupTarget.inspirationChatId,
                      }
                    : {}),
                }
              : {}),
          offer_id: offer.id,
          offer_label: localizedOfferLabel,
          customer_address: customerData.address,
          customer_city: customerData.city,
          customer_full_name: customerData.fullName,
          customer_nickname: customerData.nickname,
          customer_country: customerData.country,
          customer_postal_code: customerData.postalCode,
          lesson_language: product.type === "choreo" ? customerData.lessonLanguage : "",
          product_id: product.id,
          product_title: localizedProductTitle,
        },
      },
      {
        idempotencyKey: createPaymentIntentIdempotencyKey({
          checkoutSessionId,
          contextKey: renewalVerification
            ? `renewal:${renewalVerification.campaign.slug}:${renewalVerification.verification.updatedAt.toISOString()}`
            : onlineGroupTarget
              ? `online-group:${onlineGroupTarget.campaign.id}`
              : "",
          currency,
          customerData,
          offerId: offer.id,
          productId: product.id,
        }),
      },
    );

    if (!paymentIntent.client_secret) {
      return jsonErrorNoStore("missing_client_secret", { status: 500 });
    }

    return jsonNoStore({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Failed to create Stripe PaymentIntent", error);

    return jsonErrorNoStore("payment_intent_failed", { status: 500 });
  }
}
