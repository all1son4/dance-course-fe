import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";

import {
  isOnlineGroupLibraryOfferId,
  ONLINE_GROUP_NEW_OFFER_IDS,
} from "@/constants/sellable-products";

import { getDatabase } from "./client";
import {
  accessEntitlements,
  onlineGroupCampaigns,
  purchases,
  renewalCampaigns,
  telegramAccessTokens,
  telegramChats,
  telegramUserBindings,
} from "./schema";

const normalizeTitle = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim();

const parseStartDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw new Error("invalid_start_date");
  }

  return date;
};

export const saveOnlineGroupSettings = async ({
  inspirationChatId,
  mainChatId,
  startsAt,
  title,
}: {
  inspirationChatId: string;
  mainChatId: string;
  startsAt: string | Date;
  title?: string | null;
}) => {
  const db = getDatabase();
  const normalizedInspirationChatId = inspirationChatId.trim();
  const normalizedMainChatId = mainChatId.trim();
  const normalizedStartsAt = parseStartDate(startsAt);
  if (!normalizedMainChatId || !normalizedInspirationChatId) {
    throw new Error("missing_chat_selection");
  }

  if (normalizedMainChatId === normalizedInspirationChatId) {
    throw new Error("same_main_and_inspiration_chat");
  }

  const chats = await db
    .select()
    .from(telegramChats)
    .where(
      inArray(telegramChats.chatId, [normalizedMainChatId, normalizedInspirationChatId]),
    );
  const mainChat = chats.find((chat) => chat.chatId === normalizedMainChatId);
  const inspirationChat = chats.find(
    (chat) => chat.chatId === normalizedInspirationChatId,
  );

  if (!mainChat?.isActive || !inspirationChat?.isActive) {
    throw new Error("telegram_chat_not_registered");
  }

  const normalizedTitle =
    normalizeTitle(title) || `${mainChat.title} · ${normalizedStartsAt.toISOString()}`;
  const [existing] = await db
    .select()
    .from(onlineGroupCampaigns)
    .where(eq(onlineGroupCampaigns.status, "active"))
    .limit(1);

  if (existing && existing.libraryChatId !== normalizedInspirationChatId) {
    throw new Error("inspiration_chat_is_fixed");
  }

  if (
    existing &&
    existing.regularChatId === normalizedMainChatId &&
    existing.libraryChatId === normalizedInspirationChatId &&
    existing.title === normalizedTitle &&
    existing.startsAt.getTime() === normalizedStartsAt.getTime()
  ) {
    return {
      campaign: existing,
      inspirationChat,
      isReused: true,
      mainChat,
    };
  }

  const campaign = await db.transaction(async (tx) => {
    if (existing) {
      const isEditingActiveCampaign = existing.regularChatId === normalizedMainChatId;
      const purchaseDeadlineCondition = isEditingActiveCampaign
        ? eq(purchases.inspirationAccessExpiresAtSnapshot, existing.startsAt)
        : isNull(purchases.inspirationAccessExpiresAtSnapshot);
      const entitlementDeadlineCondition = isEditingActiveCampaign
        ? eq(accessEntitlements.expiresAt, existing.startsAt)
        : isNull(accessEntitlements.expiresAt);
      const tokenDeadlineCondition = isEditingActiveCampaign
        ? eq(telegramAccessTokens.accessExpiresAt, existing.startsAt)
        : isNull(telegramAccessTokens.accessExpiresAt);
      const bindingDeadlineCondition = isEditingActiveCampaign
        ? eq(telegramUserBindings.accessExpiresAt, existing.startsAt)
        : isNull(telegramUserBindings.accessExpiresAt);
      const deadlineUpdatedAt = new Date();

      await tx
        .update(purchases)
        .set({
          inspirationAccessExpiresAtSnapshot: normalizedStartsAt,
          updatedAt: deadlineUpdatedAt,
        })
        .where(
          and(
            eq(purchases.inspirationChatIdSnapshot, existing.libraryChatId),
            purchaseDeadlineCondition,
          ),
        );
      await tx
        .update(accessEntitlements)
        .set({
          expiresAt: normalizedStartsAt,
          updatedAt: deadlineUpdatedAt,
        })
        .where(
          and(
            eq(accessEntitlements.accessKey, "inspiration-hub"),
            eq(accessEntitlements.telegramChatId, existing.libraryChatId),
            entitlementDeadlineCondition,
          ),
        );
      await tx
        .update(telegramAccessTokens)
        .set({
          accessExpiresAt: normalizedStartsAt,
          updatedAt: deadlineUpdatedAt,
        })
        .where(
          and(
            eq(telegramAccessTokens.chatId, existing.libraryChatId),
            tokenDeadlineCondition,
          ),
        );
      await tx
        .update(telegramUserBindings)
        .set({
          accessExpiresAt: normalizedStartsAt,
          updatedAt: deadlineUpdatedAt,
        })
        .where(
          and(
            eq(telegramUserBindings.chatId, existing.libraryChatId),
            bindingDeadlineCondition,
          ),
        );
    }

    await tx
      .update(onlineGroupCampaigns)
      .set({
        status: "archived",
        updatedAt: new Date(),
      })
      .where(eq(onlineGroupCampaigns.status, "active"));

    await tx
      .update(renewalCampaigns)
      .set({
        status: "archived",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(renewalCampaigns.status, "active"),
          ne(renewalCampaigns.targetChatId, normalizedMainChatId),
        ),
      );

    const [created] = await tx
      .insert(onlineGroupCampaigns)
      .values({
        libraryChatId: normalizedInspirationChatId,
        regularChatId: normalizedMainChatId,
        startsAt: normalizedStartsAt,
        title: normalizedTitle,
      })
      .returning();

    return created;
  });

  if (!campaign) {
    throw new Error("online_group_settings_save_failed");
  }

  return {
    campaign,
    inspirationChat,
    isReused: false,
    mainChat,
  };
};

export const getActiveOnlineGroupCampaign = async () => {
  const [campaign] = await getDatabase()
    .select()
    .from(onlineGroupCampaigns)
    .where(eq(onlineGroupCampaigns.status, "active"))
    .limit(1);

  return campaign ?? null;
};

export const getActiveOnlineGroupTargetByOfferId = async (offerId: string) => {
  if (!(ONLINE_GROUP_NEW_OFFER_IDS as readonly string[]).includes(offerId)) {
    return null;
  }

  const campaign = await getActiveOnlineGroupCampaign();

  if (!campaign) {
    return null;
  }

  return {
    campaign,
    inspirationChatId: isOnlineGroupLibraryOfferId(offerId)
      ? campaign.libraryChatId
      : null,
    mainChatId: campaign.regularChatId,
  };
};

export const listRecentOnlineGroupCampaigns = async (limit = 12) =>
  getDatabase()
    .select()
    .from(onlineGroupCampaigns)
    .orderBy(desc(onlineGroupCampaigns.createdAt))
    .limit(limit);
