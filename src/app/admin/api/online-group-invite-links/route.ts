import { randomBytes } from "node:crypto";

import {
  isOnlineGroupNewOfferId,
  SELLABLE_PRODUCTS,
  type SellableProductOffer,
} from "@/constants/sellable-products";
import { listRecentAdminOnlineGroupAccessGrants } from "@/db/admin-online-group-links";
import { getActiveOnlineGroupTargetByOfferId } from "@/db/online-group-campaigns";
import { listActiveTelegramChats } from "@/db/renewal-campaigns";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import { createAdminOfferGrant } from "@/lib/admin-offer-grants";
import {
  getBrowserJsonRequestErrorResponse,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { ensureOnlineGroupAccessForPayment } from "@/lib/telegram/online-group-access";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;
const ONLINE_GROUP_PRODUCT = SELLABLE_PRODUCTS["online-group-anna-strok"];

type AccessMode = "plus" | "standard";
type GenerateOnlineGroupLinksBody = {
  accessMode?: string;
  adminLabel?: string;
};

const createSyntheticId = (prefix: string) =>
  `${prefix}${randomBytes(12).toString("hex")}`;

const normalizeAdminLabel = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);

const resolveAccessMode = (value: string | null | undefined): AccessMode | null => {
  const normalizedValue = (value ?? "").trim().toLowerCase();

  return normalizedValue === "standard" || normalizedValue === "plus"
    ? normalizedValue
    : null;
};

const resolveOffer = (accessMode: AccessMode): SellableProductOffer | null => {
  const offerCode = accessMode === "plus" ? "library-access" : "standard";

  return (
    ONLINE_GROUP_PRODUCT.offers.find(
      (offer) => offer.code === offerCode && isOnlineGroupNewOfferId(offer.id),
    ) ?? null
  );
};

const buildPurchaseItemLabel = ({
  adminLabel,
  offer,
}: {
  adminLabel: string;
  offer: SellableProductOffer;
}) => `${ONLINE_GROUP_PRODUCT.title} — ${offer.label} (${adminLabel})`;

const createAdminOnlineGroupGrantCommand = ({
  adminLabel,
  inspirationChatId,
  mainChatId,
  offer,
}: {
  adminLabel: string;
  inspirationChatId: string;
  mainChatId: string;
  offer: SellableProductOffer;
}) =>
  ({
    accessWorkflow: "telegram-online-group",
    adminLabel,
    checkoutSessionId: createSyntheticId("adm_offer_cs_"),
    createdAt: new Date(),
    eventId: createSyntheticId("adm_offer_evt_"),
    inspirationChatId,
    lessonLanguage: "ru",
    mainChatId,
    offerExternalId: offer.id,
    offerLabel: offer.label,
    // This prefix marks the technical grant as admin-only and keeps it out of sales.
    paymentIntentId: createSyntheticId("adm_offer_pi_"),
    productExternalId: ONLINE_GROUP_PRODUCT.id,
    productTitle: ONLINE_GROUP_PRODUCT.title,
    purchaseItem: buildPurchaseItemLabel({ adminLabel, offer }),
  }) as const;

const serializeGrant = (
  grant: Awaited<ReturnType<typeof listRecentAdminOnlineGroupAccessGrants>>[number],
) => ({
  accessMode: grant.accessMode,
  accesses: grant.accesses.map((access) => ({
    accessExpiresAt: access.accessExpiresAt?.toISOString() ?? "",
    accessKey: access.accessKey,
    accessUrl: access.accessUrl,
    chatId: access.chatId,
    chatTitle: access.chatTitle,
    state: access.state,
    tokenExpiresAt: access.tokenExpiresAt?.toISOString() ?? "",
  })),
  adminLabel: grant.adminLabel,
  createdAtIso: grant.createdAt.toISOString(),
  offerLabel: grant.offerLabel,
  paymentIntentId: grant.paymentIntentId,
});

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore({ errorCode: "unauthorized" }, { status: 401 });
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:online-group-invite-links:history",
    limit: 30,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonNoStore(
      { errorCode: "rate_limited" },
      {
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        status: 429,
      },
    );
  }

  try {
    const grants = await listRecentAdminOnlineGroupAccessGrants();

    return jsonNoStore({ grants: grants.map(serializeGrant) });
  } catch (error) {
    console.error("Failed to load admin Online Group invite links", error);
    return jsonNoStore(
      { errorCode: "online_group_invite_links_unavailable" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore({ errorCode: "unauthorized" }, { status: 401 });
  }

  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:online-group-invite-links",
    limit: 30,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonNoStore(
      { errorCode: "rate_limited" },
      {
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        status: 429,
      },
    );
  }

  try {
    const body = await parseJsonBody<GenerateOnlineGroupLinksBody>(request);

    if (!body) {
      return jsonNoStore({ errorCode: "invalid_request_body" }, { status: 400 });
    }

    const accessMode = resolveAccessMode(body.accessMode);
    const adminLabel = normalizeAdminLabel(body.adminLabel);
    const offer = accessMode ? resolveOffer(accessMode) : null;

    if (!accessMode || !offer) {
      return jsonNoStore({ errorCode: "invalid_access_mode" }, { status: 400 });
    }

    if (!adminLabel) {
      return jsonNoStore({ errorCode: "missing_admin_label" }, { status: 400 });
    }

    const target = await getActiveOnlineGroupTargetByOfferId(offer.id);
    const activeChats = target ? await listActiveTelegramChats() : [];
    const activeChatIds = new Set(activeChats.map((chat) => chat.chatId));

    if (
      !target?.mainChatId ||
      !target.campaign.libraryChatId ||
      !activeChatIds.has(target.mainChatId) ||
      !activeChatIds.has(target.campaign.libraryChatId) ||
      (accessMode === "plus" && !target.inspirationChatId)
    ) {
      return jsonNoStore(
        { errorCode: "online_group_settings_not_configured" },
        { status: 409 },
      );
    }

    const grantCommand = createAdminOnlineGroupGrantCommand({
      adminLabel,
      inspirationChatId: target.inspirationChatId ?? "",
      mainChatId: target.mainChatId,
      offer,
    });
    const paymentRecord = await createAdminOfferGrant(grantCommand);
    const accesses = await ensureOnlineGroupAccessForPayment(paymentRecord);

    if (!accesses?.length) {
      return jsonNoStore(
        { errorCode: "online_group_invite_links_failed" },
        { status: 409 },
      );
    }

    const expectedAccessKeys =
      accessMode === "plus"
        ? (["main-group", "inspiration-hub"] as const)
        : (["main-group"] as const);
    const serializedAccesses = expectedAccessKeys.map((accessKey) => {
      const access = accesses.find((item) => item.accessKey === accessKey);

      return {
        accessExpiresAt: access?.accessExpiresAt ?? "",
        accessKey,
        accessUrl: access?.accessUrl ?? "",
        chatId:
          accessKey === "inspiration-hub"
            ? (target.inspirationChatId ?? "")
            : target.mainChatId,
        chatTitle: "",
        state:
          access?.status === "ready"
            ? ("issued" as const)
            : access?.status === "active"
              ? ("used" as const)
              : access?.status === "expired"
                ? ("expired" as const)
                : ("failed" as const),
        tokenExpiresAt: access?.tokenExpiresAt ?? "",
      };
    });
    const readyAccessCount = serializedAccesses.filter(
      (access) => access.state === "issued" || access.state === "used",
    ).length;
    const status =
      readyAccessCount === serializedAccesses.length
        ? "ready"
        : readyAccessCount > 0
          ? "partial"
          : "not_available";

    return jsonNoStore({
      grant: {
        accessMode,
        accesses: serializedAccesses,
        adminLabel,
        createdAtIso: paymentRecord.first_seen_at,
        offerLabel: offer.label,
        paymentIntentId: paymentRecord.payment_intent_id,
      },
      status,
    });
  } catch (error) {
    console.error("Failed to generate admin Online Group invite links", error);

    return jsonNoStore(
      { errorCode: "online_group_invite_links_failed" },
      { status: 500 },
    );
  }
}
