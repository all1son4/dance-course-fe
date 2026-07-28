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

type DatabaseClient = ReturnType<typeof getDatabase>;
type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
type OnlineGroupCampaign = typeof onlineGroupCampaigns.$inferSelect;
type TelegramChat = typeof telegramChats.$inferSelect;

const normalizeOnlineGroupSettings = ({
  inspirationChatId,
  mainChatId,
  startsAt,
}: {
  inspirationChatId: string;
  mainChatId: string;
  startsAt: string | Date;
}) => {
  const normalizedInspirationChatId = inspirationChatId.trim();
  const normalizedMainChatId = mainChatId.trim();
  const normalizedStartsAt = parseStartDate(startsAt);

  if (!normalizedMainChatId || !normalizedInspirationChatId) {
    throw new Error("missing_chat_selection");
  }

  if (normalizedMainChatId === normalizedInspirationChatId) {
    throw new Error("same_main_and_inspiration_chat");
  }

  return {
    normalizedInspirationChatId,
    normalizedMainChatId,
    normalizedStartsAt,
  };
};

const resolveOnlineGroupChats = ({
  chats,
  inspirationChatId,
  mainChatId,
}: {
  chats: TelegramChat[];
  inspirationChatId: string;
  mainChatId: string;
}) => {
  const mainChat = chats.find((chat) => chat.chatId === mainChatId);
  const inspirationChat = chats.find((chat) => chat.chatId === inspirationChatId);

  if (!mainChat?.isActive || !inspirationChat?.isActive) {
    throw new Error("telegram_chat_not_registered");
  }

  return {
    inspirationChat,
    mainChat,
  };
};

const isOnlineGroupCampaignUnchanged = ({
  campaign,
  inspirationChatId,
  mainChatId,
  startsAt,
  title,
}: {
  campaign: OnlineGroupCampaign;
  inspirationChatId: string;
  mainChatId: string;
  startsAt: Date;
  title: string;
}) =>
  campaign.regularChatId === mainChatId &&
  campaign.libraryChatId === inspirationChatId &&
  campaign.title === title &&
  campaign.startsAt.getTime() === startsAt.getTime();

const getExistingCampaignDeadlineConditions = ({
  existingCampaign,
  mainChatId,
}: {
  existingCampaign: OnlineGroupCampaign;
  mainChatId: string;
}) => {
  const isEditingActiveCampaign = existingCampaign.regularChatId === mainChatId;

  // Editing the active group only moves rows tied to its previous deadline.
  // Switching the main group assigns the deadline solely to uninitialized rows.
  const purchaseDeadlineCondition = isEditingActiveCampaign
    ? eq(purchases.inspirationAccessExpiresAtSnapshot, existingCampaign.startsAt)
    : isNull(purchases.inspirationAccessExpiresAtSnapshot);
  const entitlementDeadlineCondition = isEditingActiveCampaign
    ? eq(accessEntitlements.expiresAt, existingCampaign.startsAt)
    : isNull(accessEntitlements.expiresAt);
  const tokenDeadlineCondition = isEditingActiveCampaign
    ? eq(telegramAccessTokens.accessExpiresAt, existingCampaign.startsAt)
    : isNull(telegramAccessTokens.accessExpiresAt);
  const bindingDeadlineCondition = isEditingActiveCampaign
    ? eq(telegramUserBindings.accessExpiresAt, existingCampaign.startsAt)
    : isNull(telegramUserBindings.accessExpiresAt);

  return {
    bindingDeadlineCondition,
    entitlementDeadlineCondition,
    purchaseDeadlineCondition,
    tokenDeadlineCondition,
  };
};

const saveOnlineGroupCampaignInTransaction = async ({
  existingCampaign,
  inspirationChatId,
  mainChatId,
  startsAt,
  title,
  tx,
}: {
  existingCampaign: OnlineGroupCampaign | undefined;
  inspirationChatId: string;
  mainChatId: string;
  startsAt: Date;
  title: string;
  tx: DatabaseTransaction;
}) => {
  if (existingCampaign) {
    const {
      bindingDeadlineCondition,
      entitlementDeadlineCondition,
      purchaseDeadlineCondition,
      tokenDeadlineCondition,
    } = getExistingCampaignDeadlineConditions({
      existingCampaign,
      mainChatId,
    });

    // One timestamp keeps all four access projections consistent within the
    // transaction even if the individual updates cross a clock boundary.
    const deadlineUpdatedAt = new Date();

    await tx
      .update(purchases)
      .set({
        inspirationAccessExpiresAtSnapshot: startsAt,
        updatedAt: deadlineUpdatedAt,
      })
      .where(
        and(
          eq(purchases.inspirationChatIdSnapshot, existingCampaign.libraryChatId),
          purchaseDeadlineCondition,
        ),
      );
    await tx
      .update(accessEntitlements)
      .set({
        expiresAt: startsAt,
        updatedAt: deadlineUpdatedAt,
      })
      .where(
        and(
          eq(accessEntitlements.accessKey, "inspiration-hub"),
          eq(accessEntitlements.telegramChatId, existingCampaign.libraryChatId),
          entitlementDeadlineCondition,
        ),
      );
    await tx
      .update(telegramAccessTokens)
      .set({
        accessExpiresAt: startsAt,
        updatedAt: deadlineUpdatedAt,
      })
      .where(
        and(
          eq(telegramAccessTokens.chatId, existingCampaign.libraryChatId),
          tokenDeadlineCondition,
        ),
      );
    await tx
      .update(telegramUserBindings)
      .set({
        accessExpiresAt: startsAt,
        updatedAt: deadlineUpdatedAt,
      })
      .where(
        and(
          eq(telegramUserBindings.chatId, existingCampaign.libraryChatId),
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
        ne(renewalCampaigns.targetChatId, mainChatId),
      ),
    );

  const [created] = await tx
    .insert(onlineGroupCampaigns)
    .values({
      libraryChatId: inspirationChatId,
      regularChatId: mainChatId,
      startsAt,
      title,
    })
    .returning();

  return created;
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
  const { normalizedInspirationChatId, normalizedMainChatId, normalizedStartsAt } =
    normalizeOnlineGroupSettings({
      inspirationChatId,
      mainChatId,
      startsAt,
    });

  const chats = await db
    .select()
    .from(telegramChats)
    .where(
      inArray(telegramChats.chatId, [normalizedMainChatId, normalizedInspirationChatId]),
    );
  const { inspirationChat, mainChat } = resolveOnlineGroupChats({
    chats,
    inspirationChatId: normalizedInspirationChatId,
    mainChatId: normalizedMainChatId,
  });

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
    isOnlineGroupCampaignUnchanged({
      campaign: existing,
      inspirationChatId: normalizedInspirationChatId,
      mainChatId: normalizedMainChatId,
      startsAt: normalizedStartsAt,
      title: normalizedTitle,
    })
  ) {
    return {
      campaign: existing,
      inspirationChat,
      isReused: true,
      mainChat,
    };
  }

  const campaign = await db.transaction((tx) =>
    saveOnlineGroupCampaignInTransaction({
      existingCampaign: existing,
      inspirationChatId: normalizedInspirationChatId,
      mainChatId: normalizedMainChatId,
      startsAt: normalizedStartsAt,
      title: normalizedTitle,
      tx,
    }),
  );

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
