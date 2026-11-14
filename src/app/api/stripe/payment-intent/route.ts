import type Stripe from "stripe";

import {
  DEFAULT_CHECKOUT_PRODUCT,
  getResolvedCheckoutCurrency,
  getSellableProductById,
  getSellableProductOfferById,
  INSPIRATION_HUB_DISCOUNT_SLUG,
  isOfferSaleOpen,
  isOnlineGroupLibraryOfferId,
  isOnlineGroupNewOfferId,
  LOVE_ME_IN_THE_MORNING_PRODUCT_ID,
  type SellableProduct,
  type SellableProductOffer,
  type SupportedCheckoutCurrency,
} from "@/constants/sellable-products";
import { recordCheckoutConsentEvidence } from "@/db/checkout-consent-evidence";
import { getDatabase } from "@/db/client";
import {
  findValidHubDiscountVerification,
  isHubDiscountBasisStillValid,
} from "@/db/hub-discount";
import {
  getActiveOnlineGroupCampaign,
  getActiveOnlineGroupTargetByOfferId,
} from "@/db/online-group-campaigns";
import {
  getOnlineGroupCohortSale,
  type OnlineGroupCohortSale,
} from "@/db/online-group-cohort-sale";
import { findValidRenewalVerification } from "@/db/renewal-campaigns";
import { getCheckoutSelectionFromDatabase } from "@/db/sellable-products";
import {
  CHECKOUT_CONSENT_VERSION_KEY,
  type CheckoutConsentEvidence,
  createCheckoutConsentMetadata,
  parseCheckoutConsentEvidence,
  validateCheckoutCustomerAndConsent,
} from "@/lib/checkout-consent";
import { shouldShowOfferLabel } from "@/lib/choreo-offer-presentation";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";
import {
  formatPurchaseLine,
  getLocalizedSellableProductOfferLabel,
  getLocalizedSellableProductShortTitle,
  getLocalizedSellableProductTitle,
} from "@/lib/sellable-products-localization";
import { getTelegramChannelTargetByOfferId } from "@/lib/telegram/config";

import {
  createPaymentIntentIdempotencyKey,
  getResolvedCheckoutLocale,
  getStripeServer,
  normalizeCheckoutSessionId,
  normalizePaymentIntentCustomerData,
  type PaymentIntentCustomerData,
} from "./lib";

type CreatePaymentIntentBody = {
  agreements?: unknown;
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
type HubDiscountVerification = Awaited<
  ReturnType<typeof findValidHubDiscountVerification>
>;
type OnlineGroupTarget = Awaited<ReturnType<typeof getActiveOnlineGroupTargetByOfferId>>;
type OnlineGroupSettings = Awaited<
  ReturnType<typeof getActiveOnlineGroupCampaign>
> | null;

type PaymentIntentContext = CheckoutSelection & {
  checkoutLocale: ReturnType<typeof getResolvedCheckoutLocale>;
  checkoutSessionId: string;
  consentAcceptance: Pick<CheckoutConsentEvidence, "agreements">;
  currency: SupportedCheckoutCurrency;
  customerData: PaymentIntentCustomerData;
  /** The passed Hub discount check of this checkout session (offer `hub-renewal`). */
  hubDiscountVerification: HubDiscountVerification;
  /** The recorded basis still holds now, re-checked from the database alone. */
  isHubDiscountStillValid: boolean;
  /** Set for every Online Group payment, new or renewal; null for other products. */
  onlineGroupCohortSale: OnlineGroupCohortSale | null;
  onlineGroupTarget: OnlineGroupTarget;
  renewalCampaignSlug: string;
  renewalOnlineGroupSettings: OnlineGroupSettings;
  renewalVerification: RenewalVerification;
};

type LocalizedCheckout = {
  offerLabel: string;
  productShortTitle: string;
  productTitle: string;
};

class CatalogUnavailableError extends Error {
  constructor(readonly status: 409 | 503) {
    super("catalog_unavailable");
    this.name = "CatalogUnavailableError";
  }
}

class ConsentEvidenceUnavailableError extends Error {
  constructor() {
    super("consent_evidence_failed");
    this.name = "ConsentEvidenceUnavailableError";
  }
}

type ValidatedCheckoutInput = {
  agreements: CheckoutConsentEvidence["agreements"];
  checkoutLocale: ReturnType<typeof getResolvedCheckoutLocale>;
  customerData: Parameters<typeof normalizePaymentIntentCustomerData>[0];
};

const getCheckoutSelection = async ({
  currency,
  offerId,
  productId,
}: {
  currency: SupportedCheckoutCurrency;
  offerId?: string;
  productId?: string;
}): Promise<CheckoutSelection> => {
  const configuredProduct = productId?.trim()
    ? getSellableProductById(productId)
    : DEFAULT_CHECKOUT_PRODUCT;
  if (!configuredProduct) throw new CatalogUnavailableError(409);

  const authoritativeOfferId = getSellableProductOfferById(
    configuredProduct,
    offerId,
  )?.id;
  if (offerId?.trim() && !authoritativeOfferId) throw new CatalogUnavailableError(409);

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

    logSafeError("Failed to authorize checkout selection from database", error);
    throw new CatalogUnavailableError(503);
  }
};

const resolvePaymentIntentContext = async (
  body: CreatePaymentIntentBody,
  validatedCheckout: ValidatedCheckoutInput,
): Promise<PaymentIntentContext> => {
  const checkoutSessionId = normalizeCheckoutSessionId(body.checkoutSessionId);
  const customerData = normalizePaymentIntentCustomerData(validatedCheckout.customerData);
  const currency = getResolvedCheckoutCurrency(body.currency);
  const selection = await getCheckoutSelection({
    currency,
    offerId: body.offerId,
    productId: body.productId,
  });
  const renewalCampaignSlug = (body.renewalCampaignSlug ?? "").trim();
  const renewalVerification =
    renewalCampaignSlug && renewalCampaignSlug !== INSPIRATION_HUB_DISCOUNT_SLUG
      ? await findValidRenewalVerification({
          checkoutSessionId,
          slug: renewalCampaignSlug,
        })
      : null;
  const hubDiscountVerification = requiresHubDiscount(selection.offer)
    ? await findValidHubDiscountVerification(checkoutSessionId)
    : null;
  const isHubDiscountStillValid = hubDiscountVerification
    ? await isHubDiscountBasisStillValid(getDatabase(), {
        basis: hubDiscountVerification.discount,
        checkedAt: new Date(),
        telegramUserId: hubDiscountVerification.telegramUserId,
      })
    : false;
  const onlineGroupTarget = isOnlineGroupNewOfferId(selection.offer.id)
    ? await getActiveOnlineGroupTargetByOfferId(selection.offer.id)
    : null;
  const renewalOnlineGroupSettings = renewalVerification
    ? await getActiveOnlineGroupCampaign()
    : null;
  const onlineGroupMainChatId =
    onlineGroupTarget?.mainChatId ?? renewalOnlineGroupSettings?.regularChatId;
  const onlineGroupCohortSale = onlineGroupMainChatId
    ? await getOnlineGroupCohortSale(getDatabase(), onlineGroupMainChatId)
    : null;

  return {
    ...selection,
    checkoutLocale: validatedCheckout.checkoutLocale,
    checkoutSessionId,
    consentAcceptance: {
      agreements: validatedCheckout.agreements,
    },
    currency,
    customerData,
    hubDiscountVerification,
    isHubDiscountStillValid,
    onlineGroupCohortSale,
    onlineGroupTarget,
    renewalCampaignSlug,
    renewalOnlineGroupSettings,
    renewalVerification,
  };
};

const requiresHubDiscount = (offer: SellableProductOffer) =>
  offer.accessWorkflow === "telegram-hub-renewal";

/** П7: the discounted Hub is paid only after this session passed the Hub check. */
const getHubDiscountErrorResponse = ({
  hubDiscountVerification,
  isHubDiscountStillValid,
  offer,
  renewalCampaignSlug,
}: PaymentIntentContext): Response | null => {
  if (
    renewalCampaignSlug === INSPIRATION_HUB_DISCOUNT_SLUG &&
    !requiresHubDiscount(offer)
  ) {
    return jsonErrorNoStore("renewal_payment_context_mismatch", { status: 403 });
  }

  if (
    requiresHubDiscount(offer) &&
    (!hubDiscountVerification || !isHubDiscountStillValid)
  ) {
    return jsonErrorNoStore("hub_discount_verification_required", { status: 403 });
  }

  return null;
};

const getRenewalContextErrorResponse = ({
  offer,
  product,
  renewalCampaignSlug,
  renewalOnlineGroupSettings,
  renewalVerification,
}: PaymentIntentContext): Response | null => {
  const isOnlineRenewalLink =
    Boolean(renewalCampaignSlug) && renewalCampaignSlug !== INSPIRATION_HUB_DISCOUNT_SLUG;

  if (
    (isOnlineRenewalLink || offer.accessWorkflow === "telegram-renewal") &&
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

const getSalesAvailabilityErrorResponse = ({
  product,
  offer,
  customerData,
}: PaymentIntentContext): Response | null => {
  if (!isOfferSaleOpen(product, offer)) {
    return jsonErrorNoStore("sales_closed", { status: 409 });
  }

  if (
    product.id === LOVE_ME_IN_THE_MORNING_PRODUCT_ID &&
    !getTelegramChannelTargetByOfferId({
      offerId: offer.id,
      lessonLanguage: customerData.lessonLanguage,
    })
  ) {
    return jsonErrorNoStore("catalog_unavailable", { status: 409 });
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

const getOnlineGroupCohortErrorResponse = ({
  onlineGroupCohortSale,
}: PaymentIntentContext): Response | null => {
  if (!onlineGroupCohortSale || onlineGroupCohortSale.open) return null;

  console.error("Online Group cohort is not open for sale", {
    reason: onlineGroupCohortSale.reason,
  });
  return jsonErrorNoStore("online_group_cohort_unavailable", { status: 409 });
};

const getPaymentIntentContextErrorResponse = (
  context: PaymentIntentContext,
): Response | null =>
  // Sales availability is checked first so a closed product reports "closed"
  // instead of a campaign-shaped error that reads like a misconfiguration.
  getSalesAvailabilityErrorResponse(context) ??
  getHubDiscountErrorResponse(context) ??
  getRenewalContextErrorResponse(context) ??
  getOnlineGroupContextErrorResponse(context) ??
  getOnlineGroupCohortErrorResponse(context);

const getLocalizedCheckout = ({
  checkoutLocale,
  offer,
  product,
}: PaymentIntentContext): LocalizedCheckout => ({
  productTitle: getLocalizedSellableProductTitle(product, checkoutLocale),
  productShortTitle: getLocalizedSellableProductShortTitle(product, checkoutLocale),
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

// The access job (А4) reads these keys to place the period and name its owner.
const getHubDiscountAccessMetadata = (
  verification: NonNullable<HubDiscountVerification>,
): Stripe.MetadataParam => ({
  access_workflow: "telegram-hub-renewal",
  delivery_channel: "telegram",
  hub_discount_basis: verification.discount.basis,
  ...(verification.discount.cohortId
    ? { hub_discount_cohort_id: verification.discount.cohortId }
    : {}),
  telegram_user_id: verification.telegramUserId,
  telegram_username: verification.telegramUsername ?? "",
});

const getChannelAccessMetadata = (
  context: PaymentIntentContext,
): Stripe.MetadataParam => {
  if (context.hubDiscountVerification) {
    return getHubDiscountAccessMetadata(context.hubDiscountVerification);
  }

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

const getAccessMetadata = (context: PaymentIntentContext): Stripe.MetadataParam => ({
  ...getChannelAccessMetadata(context),
  ...(context.onlineGroupCohortSale?.open
    ? { online_group_cohort_id: context.onlineGroupCohortSale.cohortId }
    : {}),
});

const createPaymentIntentMetadata = (
  context: PaymentIntentContext,
  { offerLabel, productTitle }: LocalizedCheckout,
): Stripe.MetadataParam => ({
  checkout_currency: context.currency,
  checkout_locale: context.checkoutLocale,
  checkout_session_id: context.checkoutSessionId,
  ...createCheckoutConsentMetadata(context.consentAcceptance),
  ...getAccessMetadata(context),
  offer_code: context.offer.code,
  offer_id: context.offer.id,
  offer_label: offerLabel,
  show_offer_label: String(shouldShowOfferLabel(context.product, context.offer.id)),
  customer_address: context.customerData.address,
  customer_city: context.customerData.city,
  customer_full_name: context.customerData.fullName,
  customer_nickname: context.customerData.nickname,
  customer_country: context.customerData.country,
  customer_postal_code: context.customerData.postalCode,
  lesson_language:
    context.product.type === "choreo" ? context.customerData.lessonLanguage : "",
  product_code: context.product.code,
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
  // Shown in the Stripe receipt and dashboard: one line in the buyer's language.
  description: formatPurchaseLine(
    localizedCheckout.productShortTitle,
    shouldShowOfferLabel(context.product, context.offer.id)
      ? localizedCheckout.offerLabel
      : null,
  ),
  receipt_email: context.customerData.email || undefined,
  metadata: createPaymentIntentMetadata(context, localizedCheckout),
});

const getPaymentIntentContextKey = ({
  hubDiscountVerification,
  onlineGroupCohortSale,
  onlineGroupTarget,
  renewalVerification,
}: PaymentIntentContext): string => {
  let accessContextKey = "";

  if (hubDiscountVerification) {
    accessContextKey = `hub-discount:${hubDiscountVerification.updatedAt.toISOString()}`;
  } else if (renewalVerification) {
    accessContextKey = `renewal:${renewalVerification.campaign.slug}:${renewalVerification.verification.updatedAt.toISOString()}`;
  } else if (onlineGroupTarget) {
    accessContextKey = `online-group:${onlineGroupTarget.campaign.id}`;
  }

  // The cohort is part of the metadata, so a new cohort needs a new Stripe key.
  const cohortContextKey = onlineGroupCohortSale?.open
    ? `cohort:${onlineGroupCohortSale.cohortId}`
    : "";

  return [accessContextKey, cohortContextKey, `consent:${CHECKOUT_CONSENT_VERSION_KEY}`]
    .filter(Boolean)
    .join(":");
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
    const { body, errorResponse: bodyErrorResponse } =
      await parseJsonBody<CreatePaymentIntentBody>(
        request,
        MAX_PAYMENT_INTENT_BODY_BYTES,
      );

    if (bodyErrorResponse) {
      return bodyErrorResponse;
    }

    if (!body) {
      return jsonErrorNoStore("invalid_request_body", { status: 400 });
    }

    const checkoutLocale = getResolvedCheckoutLocale(body.checkoutLocale);
    const validatedCheckout = validateCheckoutCustomerAndConsent({
      agreements: body.agreements,
      checkoutLocale,
      customerData: body.customerData,
    });

    if (!validatedCheckout.valid) {
      return jsonErrorNoStore(validatedCheckout.errorCode, { status: 400 });
    }

    const context = await resolvePaymentIntentContext(body, {
      agreements: validatedCheckout.agreements,
      checkoutLocale,
      customerData: validatedCheckout.customerData,
    });
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

    const consentEvidence = parseCheckoutConsentEvidence({
      acceptedAt: new Date(paymentIntent.created * 1_000),
      metadata: paymentIntent.metadata,
      paymentIntentId: paymentIntent.id,
    });

    if (!consentEvidence) {
      console.error("Stripe PaymentIntent is missing valid consent evidence metadata", {
        paymentIntentId: paymentIntent.id,
      });
      throw new ConsentEvidenceUnavailableError();
    }

    try {
      await recordCheckoutConsentEvidence(consentEvidence);
    } catch (error) {
      logSafeError("Failed to persist immutable checkout consent evidence", error);
      throw new ConsentEvidenceUnavailableError();
    }

    return jsonNoStore({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    if (error instanceof CatalogUnavailableError) {
      return jsonErrorNoStore("catalog_unavailable", { status: error.status });
    }

    if (error instanceof ConsentEvidenceUnavailableError) {
      return jsonErrorNoStore("consent_evidence_failed", { status: 503 });
    }

    logSafeError("Failed to create Stripe PaymentIntent", error);

    return jsonErrorNoStore("payment_intent_failed", { status: 500 });
  }
}
