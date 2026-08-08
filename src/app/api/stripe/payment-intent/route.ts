import type Stripe from "stripe";

import {
  DEFAULT_CHECKOUT_PRODUCT,
  getResolvedCheckoutCurrency,
  getSellableProductById,
  getSellableProductOfferById,
  isOnlineGroupLibraryOfferId,
  isOnlineGroupNewOfferId,
  type SellableProduct,
  type SellableProductOffer,
  type SupportedCheckoutCurrency,
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
  type PaymentIntentCustomerData,
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
const PAYMENT_INTENT_RATE_LIMIT = {
  keyPrefix: "stripe:create-payment-intent",
  limit: 60,
  windowMs: 60_000,
} as const;

type CheckoutSelection = {
  amountMinor: number;
  offer: SellableProductOffer;
  product: SellableProduct;
};

type RenewalVerification = Awaited<ReturnType<typeof findValidRenewalVerification>>;
type OnlineGroupTarget = Awaited<ReturnType<typeof getActiveOnlineGroupTargetByOfferId>>;
type OnlineGroupSettings = Awaited<
  ReturnType<typeof getActiveOnlineGroupCampaign>
> | null;

type PaymentIntentContext = CheckoutSelection & {
  checkoutLocale: ReturnType<typeof getResolvedCheckoutLocale>;
  checkoutSessionId: string;
  currency: SupportedCheckoutCurrency;
  customerData: PaymentIntentCustomerData;
  onlineGroupTarget: OnlineGroupTarget;
  renewalCampaignSlug: string;
  renewalOnlineGroupSettings: OnlineGroupSettings;
  renewalVerification: RenewalVerification;
};

type LocalizedCheckout = {
  offerLabel: string;
  productTitle: string;
};

class CatalogUnavailableError extends Error {
  constructor(readonly status: 409 | 503) {
    super("catalog_unavailable");
    this.name = "CatalogUnavailableError";
  }
}

const getCheckoutSelection = async ({
  currency,
  offerId,
  productId,
}: {
  currency: SupportedCheckoutCurrency;
  offerId?: string;
  productId?: string;
}): Promise<CheckoutSelection> => {
  const configuredProduct = getSellableProductById(productId) ?? DEFAULT_CHECKOUT_PRODUCT;
  const authoritativeOfferId = getSellableProductOfferById(
    configuredProduct,
    offerId,
  )?.id;

  try {
    const selection = await getCheckoutSelectionFromDatabase({
      currency,
      offerId: authoritativeOfferId,
      productId: configuredProduct.id,
    });

    if (!selection) {
      console.error("Requested checkout selection is not sellable", {
        currency,
        offerId,
        productId: configuredProduct.id,
      });
      throw new CatalogUnavailableError(409);
    }

    return selection;
  } catch (error) {
    if (error instanceof CatalogUnavailableError) {
      throw error;
    }

    console.error("Failed to authorize checkout selection from database", {
      error,
      productId: configuredProduct.id,
    });
    throw new CatalogUnavailableError(503);
  }
};

const resolvePaymentIntentContext = async (
  body: CreatePaymentIntentBody,
): Promise<PaymentIntentContext> => {
  const checkoutSessionId = normalizeCheckoutSessionId(body.checkoutSessionId);
  const checkoutLocale = getResolvedCheckoutLocale(body.checkoutLocale);
  const customerData = normalizePaymentIntentCustomerData(body.customerData ?? {});
  const currency = getResolvedCheckoutCurrency(body.currency);
  const selection = await getCheckoutSelection({
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
  const onlineGroupTarget = isOnlineGroupNewOfferId(selection.offer.id)
    ? await getActiveOnlineGroupTargetByOfferId(selection.offer.id)
    : null;
  const renewalOnlineGroupSettings = renewalVerification
    ? await getActiveOnlineGroupCampaign()
    : null;

  return {
    ...selection,
    checkoutLocale,
    checkoutSessionId,
    currency,
    customerData,
    onlineGroupTarget,
    renewalCampaignSlug,
    renewalOnlineGroupSettings,
    renewalVerification,
  };
};

const getRenewalContextErrorResponse = ({
  offer,
  product,
  renewalCampaignSlug,
  renewalOnlineGroupSettings,
  renewalVerification,
}: PaymentIntentContext): Response | null => {
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

  return null;
};

const getOnlineGroupContextErrorResponse = ({
  offer,
  onlineGroupTarget,
}: PaymentIntentContext): Response | null => {
  if (isOnlineGroupNewOfferId(offer.id) && !onlineGroupTarget) {
    return jsonErrorNoStore("online_group_campaign_not_configured", {
      status: 409,
    });
  }

  return null;
};

const getPaymentIntentContextErrorResponse = (
  context: PaymentIntentContext,
): Response | null =>
  getRenewalContextErrorResponse(context) ?? getOnlineGroupContextErrorResponse(context);

const getLocalizedCheckout = ({
  checkoutLocale,
  offer,
  product,
}: PaymentIntentContext): LocalizedCheckout => ({
  productTitle: getLocalizedSellableProductTitle(product, checkoutLocale),
  offerLabel: getLocalizedSellableProductOfferLabel(offer, checkoutLocale),
});

const getRenewalAccessMetadata = ({
  offer,
  renewalOnlineGroupSettings,
  renewalVerification,
}: Pick<PaymentIntentContext, "offer" | "renewalOnlineGroupSettings"> & {
  renewalVerification: NonNullable<RenewalVerification>;
}): Stripe.MetadataParam => ({
  access_workflow: "telegram-renewal",
  delivery_channel: "telegram",
  renewal_campaign_id: renewalVerification.campaign.id,
  renewal_campaign_slug: renewalVerification.campaign.slug,
  telegram_channel_chat_id: renewalVerification.campaign.targetChatId,
  ...(isOnlineGroupLibraryOfferId(offer.id) && renewalOnlineGroupSettings
    ? {
        telegram_inspiration_chat_id: renewalOnlineGroupSettings.libraryChatId,
      }
    : {}),
  telegram_user_id: renewalVerification.verification.telegramUserId,
  telegram_username: renewalVerification.verification.telegramUsername ?? "",
});

const getOnlineGroupAccessMetadata = (
  onlineGroupTarget: NonNullable<OnlineGroupTarget>,
): Stripe.MetadataParam => ({
  access_workflow: "telegram-online-group",
  delivery_channel: "telegram",
  online_group_campaign_id: onlineGroupTarget.campaign.id,
  telegram_channel_chat_id: onlineGroupTarget.mainChatId,
  ...(onlineGroupTarget.inspirationChatId
    ? {
        telegram_inspiration_chat_id: onlineGroupTarget.inspirationChatId,
      }
    : {}),
});

const getAccessMetadata = (context: PaymentIntentContext): Stripe.MetadataParam => {
  if (context.renewalVerification) {
    return getRenewalAccessMetadata({
      offer: context.offer,
      renewalOnlineGroupSettings: context.renewalOnlineGroupSettings,
      renewalVerification: context.renewalVerification,
    });
  }

  if (context.onlineGroupTarget) {
    return getOnlineGroupAccessMetadata(context.onlineGroupTarget);
  }

  return {};
};

const createPaymentIntentMetadata = (
  context: PaymentIntentContext,
  { offerLabel, productTitle }: LocalizedCheckout,
): Stripe.MetadataParam => ({
  checkout_currency: context.currency,
  checkout_locale: context.checkoutLocale,
  checkout_session_id: context.checkoutSessionId,
  ...getAccessMetadata(context),
  offer_id: context.offer.id,
  offer_label: offerLabel,
  customer_address: context.customerData.address,
  customer_city: context.customerData.city,
  customer_full_name: context.customerData.fullName,
  customer_nickname: context.customerData.nickname,
  customer_country: context.customerData.country,
  customer_postal_code: context.customerData.postalCode,
  lesson_language:
    context.product.type === "choreo" ? context.customerData.lessonLanguage : "",
  product_id: context.product.id,
  product_title: productTitle,
});

const createPaymentIntentParams = (
  context: PaymentIntentContext,
  localizedCheckout: LocalizedCheckout,
): Stripe.PaymentIntentCreateParams => ({
  amount: context.amountMinor,
  currency: context.currency,
  automatic_payment_methods: {
    enabled: true,
  },
  description: `${localizedCheckout.productTitle} - ${localizedCheckout.offerLabel}`,
  receipt_email: context.customerData.email || undefined,
  metadata: createPaymentIntentMetadata(context, localizedCheckout),
});

const getPaymentIntentContextKey = ({
  onlineGroupTarget,
  renewalVerification,
}: PaymentIntentContext): string => {
  if (renewalVerification) {
    return `renewal:${renewalVerification.campaign.slug}:${renewalVerification.verification.updatedAt.toISOString()}`;
  }

  if (onlineGroupTarget) {
    return `online-group:${onlineGroupTarget.campaign.id}`;
  }

  return "";
};

const createPaymentIntentRequestOptions = (
  context: PaymentIntentContext,
): Stripe.RequestOptions => ({
  idempotencyKey: createPaymentIntentIdempotencyKey({
    checkoutSessionId: context.checkoutSessionId,
    contextKey: getPaymentIntentContextKey(context),
    currency: context.currency,
    customerData: context.customerData,
    offerId: context.offer.id,
    productId: context.product.id,
  }),
});

export async function POST(request: Request): Promise<Response> {
  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_PAYMENT_INTENT_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: PAYMENT_INTENT_RATE_LIMIT.keyPrefix,
    limit: PAYMENT_INTENT_RATE_LIMIT.limit,
    request,
    windowMs: PAYMENT_INTENT_RATE_LIMIT.windowMs,
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

    const context = await resolvePaymentIntentContext(body);
    const contextErrorResponse = getPaymentIntentContextErrorResponse(context);

    if (contextErrorResponse) {
      return contextErrorResponse;
    }

    const localizedCheckout = getLocalizedCheckout(context);

    // Preserve the established error precedence after campaign validation.
    if (!context.checkoutSessionId) {
      return jsonErrorNoStore("missing_checkout_session_id", { status: 400 });
    }

    const paymentIntent = await stripe.paymentIntents.create(
      createPaymentIntentParams(context, localizedCheckout),
      createPaymentIntentRequestOptions(context),
    );

    if (!paymentIntent.client_secret) {
      return jsonErrorNoStore("missing_client_secret", { status: 500 });
    }

    return jsonNoStore({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    if (error instanceof CatalogUnavailableError) {
      return jsonErrorNoStore("catalog_unavailable", { status: error.status });
    }

    console.error("Failed to create Stripe PaymentIntent", error);

    return jsonErrorNoStore("payment_intent_failed", { status: 500 });
  }
}
