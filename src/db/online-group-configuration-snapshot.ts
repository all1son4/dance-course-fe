import { asc, sql } from "drizzle-orm";

import type { getDatabase } from "./client";
import type { OnlineGroupCampaignSnapshot } from "./online-group-campaign-inventory";
import {
  inspirationHubSettings,
  onlineGroupCampaigns,
  onlineGroupCohorts,
  telegramChats,
} from "./schema";
import type { DatabaseTransaction } from "./transaction";

export type OnlineGroupChatSnapshot = Readonly<
  Pick<typeof telegramChats.$inferSelect, "chatId" | "title" | "type" | "isActive">
>;

export type OnlineGroupCohortSnapshot = Readonly<
  Pick<
    typeof onlineGroupCohorts.$inferSelect,
    | "id"
    | "title"
    | "mainChatId"
    | "startsAt"
    | "previousCohortId"
    | "closedAt"
    | "accessEndsAt"
    | "lessonsClearedAt"
    | "salesEnabled"
  >
>;

export type InspirationHubSettingsSnapshot = Readonly<
  Pick<typeof inspirationHubSettings.$inferSelect, "telegramChatId">
>;

export type OnlineGroupConfigurationSnapshot = {
  campaigns: OnlineGroupCampaignSnapshot[];
  chats: OnlineGroupChatSnapshot[];
  cohorts: OnlineGroupCohortSnapshot[];
  hubSettings: InspirationHubSettingsSnapshot | null;
};

/** Reads report inputs as recorded, without inferring settings or dropping history. */
export async function readOnlineGroupConfigurationSnapshotInTransaction(
  tx: Pick<DatabaseTransaction, "select">,
): Promise<OnlineGroupConfigurationSnapshot> {
  const campaigns = await tx
    .select({
      id: onlineGroupCampaigns.id,
      title: onlineGroupCampaigns.title,
      regularChatId: onlineGroupCampaigns.regularChatId,
      libraryChatId: onlineGroupCampaigns.libraryChatId,
      startsAt: onlineGroupCampaigns.startsAt,
      status: onlineGroupCampaigns.status,
      createdAt: onlineGroupCampaigns.createdAt,
    })
    .from(onlineGroupCampaigns)
    .orderBy(asc(onlineGroupCampaigns.createdAt), asc(onlineGroupCampaigns.id));

  const chats = await tx
    .select({
      chatId: telegramChats.chatId,
      title: telegramChats.title,
      type: telegramChats.type,
      isActive: telegramChats.isActive,
    })
    .from(telegramChats)
    .orderBy(asc(telegramChats.chatId));

  const cohorts = await tx
    .select({
      id: onlineGroupCohorts.id,
      title: onlineGroupCohorts.title,
      mainChatId: onlineGroupCohorts.mainChatId,
      startsAt: onlineGroupCohorts.startsAt,
      previousCohortId: onlineGroupCohorts.previousCohortId,
      closedAt: onlineGroupCohorts.closedAt,
      accessEndsAt: onlineGroupCohorts.accessEndsAt,
      lessonsClearedAt: onlineGroupCohorts.lessonsClearedAt,
      salesEnabled: onlineGroupCohorts.salesEnabled,
    })
    .from(onlineGroupCohorts)
    .orderBy(asc(onlineGroupCohorts.id));

  const [hubSettings] = await tx
    .select({ telegramChatId: inspirationHubSettings.telegramChatId })
    .from(inspirationHubSettings)
    .limit(1);

  return {
    campaigns,
    chats,
    cohorts,
    hubSettings: hubSettings ?? null,
  };
}

/** A consistent snapshot even when settings change between individual SELECTs. */
export function readOnlineGroupConfigurationSnapshot(
  db: Pick<ReturnType<typeof getDatabase>, "transaction">,
): Promise<OnlineGroupConfigurationSnapshot> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '15s'`);
      await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
      return readOnlineGroupConfigurationSnapshotInTransaction(tx);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
