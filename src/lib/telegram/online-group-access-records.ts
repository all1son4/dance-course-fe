import { and, eq } from "drizzle-orm";

import {
  isInspirationHubOfferId,
  isOnlineGroupLibraryOfferId,
} from "@/constants/sellable-products";
import { keepClassifiedAccessPeriod } from "@/db/classified-access";
import { getDatabase } from "@/db/client";
import { accessEntitlements, purchases, telegramUserBindings } from "@/db/schema";
import type { DatabaseExecutor } from "@/db/transaction";
import type { PaymentRecordSnapshot } from "@/lib/payment-record";

import { getOfferMetadataById, isOnlineGroupAccessOfferId } from "./offer-access";

export type OnlineGroupAccessKey = "inspiration-hub" | "main-group";
export type OnlineGroupAccessState = {
  accessKey: OnlineGroupAccessKey;
  status: typeof accessEntitlements.$inferSelect.status;
};

/** Offers whose access goes through personal invites to a Telegram group: Online Group and the Hub. */
export const isGroupInviteOfferId = (offerId: string) =>
  isOnlineGroupAccessOfferId(offerId) || isInspirationHubOfferId(offerId);

const getAccessTargets = (
  paymentRecord: PaymentRecordSnapshot,
  purchaseSnapshot?: {
    inspirationAccessExpiresAt: Date | null;
    inspirationChatId: string | null;
  },
) => {
  const mainChatId = paymentRecord.telegram_channel_chat_id.trim();
  const inspirationChatId =
    purchaseSnapshot?.inspirationChatId?.trim() ||
    paymentRecord.telegram_inspiration_chat_id.trim();
  const inspirationAccessExpiresAt =
    purchaseSnapshot?.inspirationAccessExpiresAt?.toISOString() ?? "";
  const targets: Array<{
    accessExpiresAt: string;
    accessKey: OnlineGroupAccessKey;
    chatId: string;
  }> = mainChatId
    ? [
        {
          accessExpiresAt: "",
          accessKey: "main-group" as const,
          chatId: mainChatId,
        },
      ]
    : [];

  if (isOnlineGroupLibraryOfferId(paymentRecord.offer_id) && inspirationChatId) {
    targets.push({
      accessExpiresAt: inspirationAccessExpiresAt,
      accessKey: "inspiration-hub",
      chatId: inspirationChatId,
    });
  }

  return targets;
};

export const getPurchase = async (paymentIntentId: string) => {
  const [purchase] = await getDatabase()
    .select()
    .from(purchases)
    .where(eq(purchases.paymentIntentId, paymentIntentId.trim()))
    .limit(1);

  return purchase ?? null;
};

export const listOnlineGroupAccessStatesForPayment = async (
  paymentIntentId: string,
): Promise<OnlineGroupAccessState[]> => {
  const purchase = await getPurchase(paymentIntentId);

  if (!purchase) {
    return [];
  }

  const rows = await getDatabase()
    .select({
      accessKey: accessEntitlements.accessKey,
      status: accessEntitlements.status,
    })
    .from(accessEntitlements)
    .where(eq(accessEntitlements.purchaseId, purchase.id));

  return rows
    .flatMap((row): OnlineGroupAccessState[] => {
      if (row.accessKey === "inspiration-hub") {
        return [{ accessKey: "inspiration-hub", status: row.status }];
      }

      if (row.accessKey === "primary") {
        return [{ accessKey: "main-group", status: row.status }];
      }

      return [];
    })
    .sort(
      (left, right) =>
        Number(right.accessKey === "main-group") -
        Number(left.accessKey === "main-group"),
    );
};

export type OnlineGroupPurchase = NonNullable<Awaited<ReturnType<typeof getPurchase>>>;

export const toPersistedAccessKey = (accessKey: OnlineGroupAccessKey) =>
  accessKey === "main-group" ? "primary" : accessKey;

export const upsertEntitlement = async ({
  accessExpiresAt,
  accessKey,
  chatId,
  database = getDatabase(),
  purchase,
  status,
  telegramUserId,
  telegramUsername,
  tokenId,
}: {
  accessExpiresAt: string;
  accessKey: OnlineGroupAccessKey;
  chatId: string;
  database?: DatabaseExecutor;
  purchase: OnlineGroupPurchase;
  status: typeof accessEntitlements.$inferInsert.status;
  telegramUserId?: string | null;
  telegramUsername?: string | null;
  tokenId?: string | null;
}) => {
  const now = new Date();
  const expiresAt = accessExpiresAt ? new Date(accessExpiresAt) : null;
  const persistedAccessKey = toPersistedAccessKey(accessKey);
  const values = {
    accessWorkflow:
      getOfferMetadataById(purchase.offerExternalId ?? "")?.accessWorkflow ||
      "telegram-online-group",
    currentTokenId: tokenId?.trim() || null,
    customerId: purchase.customerId,
    deliveryChannel: "telegram",
    expiresAt,
    externalTargetType: "telegram_chat" as const,
    offerId: purchase.offerId,
    productId: purchase.productId,
    revokedAt: null,
    status,
    telegramChatId: chatId,
    telegramUserId: telegramUserId?.trim() || null,
    telegramUsername: telegramUsername?.trim() || null,
    updatedAt: now,
  };
  const [entitlement] = await database
    .insert(accessEntitlements)
    .values({
      ...values,
      accessKey: persistedAccessKey,
      purchaseId: purchase.id,
    })
    .onConflictDoUpdate({
      set: keepClassifiedAccessPeriod(values),
      target: [accessEntitlements.purchaseId, accessEntitlements.accessKey],
    })
    .returning();

  return entitlement;
};

export const upsertBinding = async ({
  accessExpiresAt,
  chatId,
  database = getDatabase(),
  inviteLink,
  purchase,
  telegramUserId,
  telegramUsername,
}: {
  accessExpiresAt: string;
  chatId: string;
  database?: DatabaseExecutor;
  inviteLink: string;
  purchase: OnlineGroupPurchase;
  telegramUserId: string;
  telegramUsername: string;
}) => {
  const now = new Date();
  const [entitlement] = await database
    .select()
    .from(accessEntitlements)
    .where(
      and(
        eq(accessEntitlements.purchaseId, purchase.id),
        eq(accessEntitlements.telegramChatId, chatId),
      ),
    )
    .limit(1);
  const values = {
    accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : null,
    chatId,
    customerEmailSnapshot: purchase.customerEmailSnapshot,
    entitlementId: entitlement?.id ?? null,
    inviteLink: inviteLink || null,
    lastSeenAt: now,
    offerId: purchase.offerId,
    productId: purchase.productId,
    revokedAt: null,
    revokedReason: null,
    status: "active" as const,
    telegramUserId,
    telegramUsername: telegramUsername || null,
    updatedAt: now,
  };
  const [binding] = await database
    .insert(telegramUserBindings)
    .values({
      ...values,
      boundAt: now,
      purchaseId: purchase.id,
    })
    .onConflictDoUpdate({
      set: values,
      target: [telegramUserBindings.purchaseId, telegramUserBindings.chatId],
    })
    .returning();

  return binding;
};

/** The paid period of a Hub purchase (А4), if the access job has written it. */
export const findStandaloneHubRight = async (purchaseId: string) => {
  const [right] = await getDatabase()
    .select({
      expiresAt: accessEntitlements.expiresAt,
      startsAt: accessEntitlements.startsAt,
    })
    .from(accessEntitlements)
    .where(
      and(
        eq(accessEntitlements.purchaseId, purchaseId),
        eq(accessEntitlements.accessKey, "inspiration-hub"),
        eq(accessEntitlements.sourceKind, "standalone_hub"),
      ),
    )
    .limit(1);

  return right;
};

/**
 * К10: the Hub of a Plus in the period model ends where its cohort closure recorded
 * the end on the right itself; the copy on the purchase is the old campaign deadline
 * and may still lie ahead, which would hand out an invite after the access ended.
 */
const findPlusHubEnd = async (purchase: OnlineGroupPurchase): Promise<Date | null> => {
  const [right] = await getDatabase()
    .select({
      expiresAt: accessEntitlements.expiresAt,
      sourceKind: accessEntitlements.sourceKind,
    })
    .from(accessEntitlements)
    .where(
      and(
        eq(accessEntitlements.purchaseId, purchase.id),
        eq(accessEntitlements.accessKey, "inspiration-hub"),
      ),
    )
    .limit(1);

  return right?.sourceKind === "online_group" && right.expiresAt
    ? right.expiresAt
    : purchase.inspirationAccessExpiresAtSnapshot;
};

/** The chats and access ends of a group purchase (and of its Plus Hub). */
export const getPlusAccessTargets = async (
  paymentRecord: PaymentRecordSnapshot,
  purchase: OnlineGroupPurchase,
) =>
  getAccessTargets(paymentRecord, {
    inspirationAccessExpiresAt: await findPlusHubEnd(purchase),
    inspirationChatId: purchase.inspirationChatIdSnapshot,
  });
