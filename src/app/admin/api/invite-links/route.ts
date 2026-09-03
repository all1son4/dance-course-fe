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
import { createAdminOfferGrant } from "@/lib/admin-offer-grants";
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

const createAdminOfferGrantCommand = ({
  adminLabel,
  lessonLanguage,
  offer,
  product,
}: ResolvedAdminSelection & {
  adminLabel: string;
}) =>
  ({
    accessWorkflow: ADMIN_TELEGRAM_OFFER_ACCESS_WORKFLOW,
    adminLabel,
    checkoutSessionId: createSyntheticId("adm_offer_cs_"),
    createdAt: new Date(),
    eventId: createSyntheticId("adm_offer_evt_"),
    lessonLanguage,
    offerExternalId: offer.id,
    offerLabel: offer.label,
    paymentIntentId: createSyntheticId("adm_offer_pi_"),
    productExternalId: product.id,
    productTitle: product.title,
    purchaseItem: buildPurchaseItemLabel({
      adminLabel,
      offerLabel: offer.label,
      productTitle: product.title,
    }),
  }) as const;

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

    const grantCommand = createAdminOfferGrantCommand({
      ...resolvedSelection,
      adminLabel: getNormalizedAdminLabel(body.adminLabel),
    });
    const paymentRecord = await createAdminOfferGrant(grantCommand);
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
    console.error("Failed to generate admin invite link", error);

    return jsonNoStore(
      {
        errorCode: "admin_invite_link_failed",
      },
      { status: 500 },
    );
  }
}
