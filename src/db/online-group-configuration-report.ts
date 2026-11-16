import {
  groupOnlineGroupCampaigns,
  type OnlineGroupCampaignInventoryGroup,
  type OnlineGroupCampaignSnapshot,
} from "./online-group-campaign-inventory";
import type {
  InspirationHubSettingsSnapshot,
  OnlineGroupChatSnapshot,
  OnlineGroupCohortSnapshot,
} from "./online-group-configuration-snapshot";

export type OnlineGroupConfigurationReportInput = {
  readonly campaigns: readonly OnlineGroupCampaignSnapshot[];
  readonly chats: readonly OnlineGroupChatSnapshot[];
  readonly cohorts: readonly OnlineGroupCohortSnapshot[];
  readonly hubSettings: InspirationHubSettingsSnapshot | null;
};

export type OnlineGroupConfigurationGroupIssue =
  "main_chat_missing" | "main_chat_inactive" | "cohort_missing" | "multiple_legacy_hubs";

export type OnlineGroupConfigurationHubIssue =
  | "hub_settings_missing"
  | "configured_hub_chat_missing"
  | "configured_hub_chat_inactive"
  | "configured_hub_differs_from_active_campaign";

export type OnlineGroupConfigurationReportGroup = OnlineGroupCampaignInventoryGroup & {
  mainChat: OnlineGroupChatSnapshot | null;
  cohort: OnlineGroupCohortSnapshot | null;
  issues: OnlineGroupConfigurationGroupIssue[];
};

export type OnlineGroupConfigurationReport = {
  groups: OnlineGroupConfigurationReportGroup[];
  chats: OnlineGroupChatSnapshot[];
  cohortsWithoutCampaigns: OnlineGroupCohortSnapshot[];
  hubSettings: InspirationHubSettingsSnapshot | null;
  hubChat: OnlineGroupChatSnapshot | null;
  hubIssues: OnlineGroupConfigurationHubIssue[];
};

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Describes recorded configuration and review notes without selecting canonical
 * dates, proving cohort history or authorizing a backfill or product release.
 */
export function buildOnlineGroupConfigurationReport(
  snapshot: OnlineGroupConfigurationReportInput,
): OnlineGroupConfigurationReport {
  const campaignGroups = groupOnlineGroupCampaigns(snapshot.campaigns);

  const chatsById = new Map<string, OnlineGroupChatSnapshot>();
  const cohortsByMainChatId = new Map<string, OnlineGroupCohortSnapshot>();

  for (const chat of snapshot.chats) {
    chatsById.set(chat.chatId, chat);
  }

  for (const cohort of snapshot.cohorts) {
    cohortsByMainChatId.set(cohort.mainChatId, cohort);
  }

  const groups: OnlineGroupConfigurationReportGroup[] = [];

  for (const campaignGroup of campaignGroups) {
    const chat = chatsById.get(campaignGroup.mainChatId);
    const cohort = cohortsByMainChatId.get(campaignGroup.mainChatId);

    const issues: OnlineGroupConfigurationGroupIssue[] = [];

    if (!chat) issues.push("main_chat_missing");
    else if (!chat.isActive) issues.push("main_chat_inactive");
    if (!cohort) issues.push("cohort_missing");
    if (campaignGroup.hubChatIds.length > 1) issues.push("multiple_legacy_hubs");

    groups.push({
      ...campaignGroup,
      mainChat: chat ?? null,
      cohort: cohort ?? null,
      issues,
    });
  }

  const mainChatIdsWithCampaigns = new Set(
    campaignGroups.map((campaignGroup) => campaignGroup.mainChatId),
  );
  const cohortsWithoutCampaigns = snapshot.cohorts
    .filter((cohort) => !mainChatIdsWithCampaigns.has(cohort.mainChatId))
    .sort((left, right) => compareStrings(left.id, right.id));

  const sortedChats = [...snapshot.chats].sort((left, right) =>
    compareStrings(left.chatId, right.chatId),
  );

  const hubSettings = snapshot.hubSettings;
  let hubChat: OnlineGroupChatSnapshot | null = null;
  const hubIssues: OnlineGroupConfigurationHubIssue[] = [];

  if (hubSettings === null) {
    hubIssues.push("hub_settings_missing");
  } else {
    hubChat = chatsById.get(hubSettings.telegramChatId) ?? null;

    if (!hubChat) hubIssues.push("configured_hub_chat_missing");
    else if (!hubChat.isActive) hubIssues.push("configured_hub_chat_inactive");

    const hasActiveCampaignHubMismatch = snapshot.campaigns.some(
      (campaign) =>
        campaign.status === "active" &&
        campaign.libraryChatId !== hubSettings.telegramChatId,
    );

    if (hasActiveCampaignHubMismatch) {
      hubIssues.push("configured_hub_differs_from_active_campaign");
    }
  }

  return {
    groups,
    chats: sortedChats,
    cohortsWithoutCampaigns,
    hubSettings,
    hubChat,
    hubIssues,
  };
}
