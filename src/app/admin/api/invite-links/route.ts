import { randomBytes } from "node:crypto";

import {
  getDefaultProductOffer,
  getSellableProductById,
  getSellableProductOfferById,
  SELLABLE_PRODUCTS,
  type SellableProduct,
  type SellableProductOffer,
} from "@/constants/sellable-products";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  appendSuccessfulCustomerRecord,
  GoogleSheetsError,
  isGoogleSheetsRateLimitError,
  type PaymentSheetRecord,
  upsertPaymentRecord,
} from "@/lib/google-sheets";
import {
  hasJsonContentType,
  isPayloadTooLarge,
  isTrustedBrowserOrigin,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";
import { ensureTelegramAccessLinkForPayment } from "@/lib/telegram/access";
import { ADMIN_TELEGRAM_OFFER_ACCESS_WORKFLOW } from "@/lib/telegram/admin-offer-access";
import { toUtcIso } from "@/lib/time";

export const runtime = "nodejs";

const MAX_ADMIN_INVITE_LINK_BODY_BYTES = 8 * 1024;
const ADMIN_FIRST_TOUCH_KIND = "first-touch";
const ADMIN_CHOREO_KIND = "choreo";
const SUPPORTED_LESSON_LANGUAGES = new Set(["ru", "en"]);

type AdminInviteLinkBody = {
  adminLabel?: string;
  kind?: string;
  lessonLanguage?: string;
  offerId?: string;
  productId?: string;
};

type ResolvedAdminSelection = {
  lessonLanguage: "en" | "ru";
  offer: SellableProductOffer;
  product: SellableProduct;
};

const createSyntheticId = (prefix: string) =>
  `${prefix}${randomBytes(12).toString("hex")}`;

const getNormalizedAdminKind = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

const getNormalizedLessonLanguage = (value: string | null | undefined) => {
  const normalizedValue = (value ?? "").trim().toLowerCase();

  return SUPPORTED_LESSON_LANGUAGES.has(normalizedValue)
    ? (normalizedValue as "en" | "ru")
    : "ru";
};

const getNormalizedAdminLabel = (value: string | null | undefined) =>
  (value ?? "").trim().slice(0, 120);

const resolveAdminInviteSelection = (
  body: AdminInviteLinkBody,
): ResolvedAdminSelection | null => {
  const kind = getNormalizedAdminKind(body.kind);

  if (kind === ADMIN_FIRST_TOUCH_KIND) {
    const firstTouchProduct = SELLABLE_PRODUCTS["first-touch"];
    const firstTouchOffer = getDefaultProductOffer(firstTouchProduct);

    if (!firstTouchOffer) {
      return null;
    }

    return {
      lessonLanguage: getNormalizedLessonLanguage(body.lessonLanguage),
      offer: firstTouchOffer,
      product: firstTouchProduct,
    };
  }

  if (kind !== ADMIN_CHOREO_KIND) {
    return null;
  }

  const product = getSellableProductById(body.productId ?? "");

  if (!product || product.type !== "choreo") {
    return null;
  }

  const offer = getSellableProductOfferById(product, body.offerId ?? "");

  if (!offer) {
    return null;
  }

  return {
    lessonLanguage: getNormalizedLessonLanguage(body.lessonLanguage),
    offer,
    product,
  };
};

const buildPurchaseItemLabel = ({
  adminLabel,
  offerLabel,
  productTitle,
}: {
  adminLabel: string;
  offerLabel: string;
  productTitle: string;
}) => {
  const normalizedProductTitle = productTitle.trim();
  const normalizedOfferLabel = offerLabel.trim();

  const baseLabel =
    normalizedProductTitle && normalizedOfferLabel
      ? `${normalizedProductTitle} — ${normalizedOfferLabel}`
      : normalizedProductTitle || normalizedOfferLabel;
  const normalizedAdminLabel = adminLabel.trim();

  if (baseLabel && normalizedAdminLabel) {
    return `${baseLabel} (${normalizedAdminLabel})`;
  }

  return baseLabel || normalizedAdminLabel;
};

const getCustomerFullAddress = (paymentRecord: PaymentSheetRecord) =>
  [
    paymentRecord.customer_address.trim(),
    paymentRecord.customer_city.trim(),
    paymentRecord.customer_postal_code.trim(),
  ]
    .filter(Boolean)
    .join(", ");

const createAdminOfferPaymentRecord = ({
  adminLabel,
  lessonLanguage,
  offer,
  product,
}: ResolvedAdminSelection & {
  adminLabel: string;
}): PaymentSheetRecord => {
  const now = toUtcIso();
  const paymentIntentId = createSyntheticId("adm_offer_pi_");
  const checkoutSessionId = createSyntheticId("adm_offer_cs_");
  const eventId = createSyntheticId("adm_offer_evt_");
  const purchaseItem = buildPurchaseItemLabel({
    adminLabel,
    offerLabel: offer.label,
    productTitle: product.title,
  });

  return {
    amount: "0",
    checkout_currency: "pln",
    checkout_locale: "ru",
    checkout_session_id: checkoutSessionId,
    currency: "pln",
    customer_address: "",
    customer_city: "",
    customer_country: "",
    customer_email: "",
    customer_full_name: "",
    customer_nickname: adminLabel,
    customer_postal_code: "",
    delivery_channel: "telegram",
    access_workflow: ADMIN_TELEGRAM_OFFER_ACCESS_WORKFLOW,
    email_delivery_status: "",
    email_delivery_updated_at: "",
    first_seen_at: now,
    invoice_issued_at: "",
    invoice_number: "",
    last_payment_error_code: "",
    last_payment_error_message: "",
    latest_event_id: eventId,
    latest_event_type: "admin.offer_link.generated",
    lesson_language: lessonLanguage,
    offer_id: offer.id,
    offer_label: offer.label,
    outcome: "succeeded",
    payment_intent_id: paymentIntentId,
    product_id: product.id,
    product_title: product.title,
    purchase_item: purchaseItem,
    status: "succeeded",
    successful_customer_logged_at: now,
    telegram_access_expires_at: "",
    telegram_access_revoked_at: "",
    telegram_access_status: "pending",
    telegram_channel_chat_id: "",
    telegram_token_expires_at: "",
    telegram_token_id: "",
    telegram_token_used_at: "",
    telegram_user_id: "",
    telegram_username: "",
    updated_at: now,
    with_mentor_alert_status: "",
    with_mentor_alert_updated_at: "",
  };
};

export async function POST(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore(
      {
        errorCode: "unauthorized",
      },
      { status: 401 },
    );
  }

  if (!isTrustedBrowserOrigin(request)) {
    return jsonNoStore(
      {
        errorCode: "invalid_origin",
      },
      { status: 403 },
    );
  }

  if (isPayloadTooLarge(request, MAX_ADMIN_INVITE_LINK_BODY_BYTES)) {
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
    key: `admin:invite-links:${requesterIp}`,
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

  try {
    const body = await parseJsonBody<AdminInviteLinkBody>(request);

    if (!body) {
      return jsonNoStore(
        {
          errorCode: "invalid_request_body",
        },
        { status: 400 },
      );
    }

    const resolvedSelection = resolveAdminInviteSelection(body);

    if (!resolvedSelection) {
      return jsonNoStore(
        {
          errorCode: "invalid_offer_selection",
        },
        { status: 400 },
      );
    }

    const initialPaymentRecord = createAdminOfferPaymentRecord({
      ...resolvedSelection,
      adminLabel: getNormalizedAdminLabel(body.adminLabel),
    });
    const paymentRecord = await upsertPaymentRecord(initialPaymentRecord);

    await appendSuccessfulCustomerRecord({
      payment_intent_id: paymentRecord.payment_intent_id,
      customer_country: paymentRecord.customer_country,
      customer_email: paymentRecord.customer_email,
      customer_full_address: getCustomerFullAddress(paymentRecord),
      customer_full_name: paymentRecord.customer_full_name,
      customer_nickname: paymentRecord.customer_nickname,
      purchase_item: paymentRecord.purchase_item,
      product_id: paymentRecord.product_id,
      product_title: paymentRecord.product_title,
      offer_id: paymentRecord.offer_id,
      offer_label: paymentRecord.offer_label,
    });
    const accessLink = await ensureTelegramAccessLinkForPayment(paymentRecord);

    if (accessLink.status !== "ready") {
      return jsonNoStore(
        {
          errorCode: "telegram_access_link_failed",
          reason: accessLink.reason,
        },
        { status: 409 },
      );
    }

    return jsonNoStore({
      accessUrl: accessLink.accessUrl,
      offerId: resolvedSelection.offer.id,
      paymentIntentId: paymentRecord.payment_intent_id,
      productId: resolvedSelection.product.id,
      status: "ready",
      tokenExpiresAt: accessLink.tokenExpiresAt,
    });
  } catch (error) {
    if (isGoogleSheetsRateLimitError(error)) {
      console.warn("Google Sheets rate limit reached while generating admin invite link");

      return jsonNoStore(
        {
          errorCode: "rate_limited",
        },
        {
          headers: {
            "Retry-After": "20",
          },
          status: 429,
        },
      );
    }

    if (error instanceof GoogleSheetsError) {
      console.error("Failed to generate admin invite link in Google Sheets", {
        details: error.details,
        errorCode: error.code,
        status: error.status,
      });

      return jsonNoStore(
        {
          errorCode: "admin_invite_link_failed",
        },
        { status: 500 },
      );
    }

    console.error("Failed to generate admin invite link", error);

    return jsonNoStore(
      {
        errorCode: "admin_invite_link_failed",
      },
      { status: 500 },
    );
  }
}
