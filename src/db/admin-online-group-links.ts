import { and, desc, eq, inArray } from "drizzle-orm";

import {
  isOnlineGroupLibraryOfferId,
  ONLINE_GROUP_NEW_OFFER_IDS,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";

import { getDatabase } from "./client";
import {
  accessEntitlements,
  purchases,
  telegramAccessTokens,
  telegramChats,
} from "./schema";

export type AdminOnlineGroupAccessState =
  | "expired"
  | "failed"
  | "issued"
  | "left"
  | "pending"
  | "revoked"
  | "used";

export type AdminOnlineGroupAccessGrant = {
  accessMode: "plus" | "standard";
  accesses: Array<{
    accessExpiresAt: Date | null;
    accessKey: "inspiration-hub" | "main-group";
    accessUrl: string;
    chatId: string;
    chatTitle: string;
    state: AdminOnlineGroupAccessState;
    tokenExpiresAt: Date | null;
  }>;
  adminLabel: string;
  createdAt: Date;
  offerLabel: string;
  paymentIntentId: string;
};

const ONLINE_GROUP_PRODUCT = SELLABLE_PRODUCTS["online-group-anna-strok"];

const resolveAccessState = ({
  entitlementStatus,
  tokenStatus,
}: {
  entitlementStatus: string;
  tokenStatus: string | null;
}): AdminOnlineGroupAccessState => {
  if (entitlementStatus === "left_channel") {
    return "left";
  }

  if (entitlementStatus === "link_failed") {
    return "failed";
  }

  if (entitlementStatus === "expired") {
    return "expired";
  }

  if (entitlementStatus === "revoked") {
    return "revoked";
  }

  if (tokenStatus === "issued") {
    return "issued";
  }

  if (tokenStatus === "used") {
    return "used";
  }

  if (tokenStatus === "expired") {
    return "expired";
  }

  if (tokenStatus === "revoked") {
    return "revoked";
  }

  if (entitlementStatus === "activated") {
    return "used";
  }

  return "pending";
};

export const listRecentAdminOnlineGroupAccessGrants = async (limit = 20) => {
  const db = getDatabase();
  const requestedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 20;
  const normalizedLimit = Math.max(1, Math.min(requestedLimit, 50));
  const purchaseRows = await db
    .select({
      adminLabel: purchases.customerTelegramUsernameSnapshot,
      createdAt: purchases.firstSeenAt,
      offerExternalId: purchases.offerExternalId,
      offerLabel: purchases.offerLabelSnapshot,
      paymentIntentId: purchases.paymentIntentId,
      purchaseId: purchases.id,
      purchaseItem: purchases.purchaseItemSnapshot,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.source, "admin_offer_link"),
        eq(purchases.productExternalId, ONLINE_GROUP_PRODUCT.id),
        inArray(purchases.offerExternalId, [...ONLINE_GROUP_NEW_OFFER_IDS]),
      ),
    )
    .orderBy(desc(purchases.firstSeenAt))
    .limit(normalizedLimit);

  if (purchaseRows.length === 0) {
    return [] as AdminOnlineGroupAccessGrant[];
  }

  const purchaseIds = purchaseRows.map((purchase) => purchase.purchaseId);
  const accessRows = await db
    .select({
      accessExpiresAt: accessEntitlements.expiresAt,
      accessKey: accessEntitlements.accessKey,
      chatId: accessEntitlements.telegramChatId,
      entitlementStatus: accessEntitlements.status,
      purchaseId: accessEntitlements.purchaseId,
      tokenExpiresAt: telegramAccessTokens.expiresAt,
      tokenStatus: telegramAccessTokens.status,
      tokenValue: telegramAccessTokens.tokenValue,
    })
    .from(accessEntitlements)
    .leftJoin(
      telegramAccessTokens,
      eq(accessEntitlements.currentTokenId, telegramAccessTokens.tokenId),
    )
    .where(
      and(
        inArray(accessEntitlements.purchaseId, purchaseIds),
        inArray(accessEntitlements.accessKey, ["primary", "inspiration-hub"]),
      ),
    );
  const chatIds = [
    ...new Set(accessRows.map((access) => access.chatId?.trim() ?? "").filter(Boolean)),
  ];
  const chatRows = chatIds.length
    ? await db
        .select({
          chatId: telegramChats.chatId,
          title: telegramChats.title,
        })
        .from(telegramChats)
        .where(inArray(telegramChats.chatId, chatIds))
    : [];
  const chatTitleById = new Map(chatRows.map((chat) => [chat.chatId, chat.title]));
  const accessesByPurchaseId = new Map<string, AdminOnlineGroupAccessGrant["accesses"]>();

  for (const access of accessRows) {
    const chatId = access.chatId?.trim() ?? "";
    const normalizedAccess = {
      accessExpiresAt: access.accessExpiresAt,
      accessKey:
        access.accessKey === "inspiration-hub"
          ? ("inspiration-hub" as const)
          : ("main-group" as const),
      accessUrl: access.tokenValue?.trim() ?? "",
      chatId,
      chatTitle: chatTitleById.get(chatId) ?? chatId,
      state: resolveAccessState({
        entitlementStatus: access.entitlementStatus,
        tokenStatus: access.tokenStatus,
      }),
      tokenExpiresAt: access.tokenExpiresAt,
    };
    const purchaseAccesses = accessesByPurchaseId.get(access.purchaseId) ?? [];

    purchaseAccesses.push(normalizedAccess);
    accessesByPurchaseId.set(access.purchaseId, purchaseAccesses);
  }

  return purchaseRows.map(
    (purchase) =>
      ({
        accessMode: isOnlineGroupLibraryOfferId(purchase.offerExternalId ?? "")
          ? ("plus" as const)
          : ("standard" as const),
        accesses: (accessesByPurchaseId.get(purchase.purchaseId) ?? []).sort(
          (left, right) =>
            Number(right.accessKey === "main-group") -
            Number(left.accessKey === "main-group"),
        ),
        adminLabel:
          purchase.adminLabel?.trim() ||
          purchase.purchaseItem?.trim() ||
          "Без идентификатора",
        createdAt: purchase.createdAt,
        offerLabel: purchase.offerLabel?.trim() ?? "",
        paymentIntentId: purchase.paymentIntentId,
      }) satisfies AdminOnlineGroupAccessGrant,
  );
};
