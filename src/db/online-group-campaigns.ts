import { and, desc, eq, inArray, ne } from "drizzle-orm";

import {
  isOnlineGroupLibraryOfferId,
  ONLINE_GROUP_NEW_OFFER_IDS,
} from "@/constants/sellable-products";

import { getDatabase } from "./client";
import { onlineGroupCampaigns, renewalCampaigns, telegramChats } from "./schema";

const ONLINE_GROUP_DURATION_MS = 6 * 7 * 24 * 60 * 60 * 1000;

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
  const endsAt = new Date(normalizedStartsAt.getTime() + ONLINE_GROUP_DURATION_MS);

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
        endsAt,
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
    inspirationAccessExpiresAt: isOnlineGroupLibraryOfferId(offerId)
      ? campaign.endsAt
      : null,
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
