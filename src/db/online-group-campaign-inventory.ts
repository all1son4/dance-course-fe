import type { onlineGroupCampaigns } from "./schema";

export type OnlineGroupCampaignSnapshot = Readonly<
  Pick<
    typeof onlineGroupCampaigns.$inferSelect,
    | "id"
    | "title"
    | "regularChatId"
    | "libraryChatId"
    | "startsAt"
    | "status"
    | "createdAt"
  >
>;

export type OnlineGroupCampaignInventoryGroup = {
  mainChatId: string;
  campaigns: OnlineGroupCampaignSnapshot[];
  hubChatIds: string[];
};

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Groups legacy configuration versions for review, without inferring real
 * cohorts, selecting a canonical Hub or changing any recorded dates.
 */
export function groupOnlineGroupCampaigns(
  campaigns: readonly OnlineGroupCampaignSnapshot[],
): OnlineGroupCampaignInventoryGroup[] {
  const chatVersions = new Map<string, OnlineGroupCampaignSnapshot[]>();

  for (const campaign of campaigns) {
    const existingVersions = chatVersions.get(campaign.regularChatId);

    if (existingVersions) {
      existingVersions.push(campaign);
    } else {
      chatVersions.set(campaign.regularChatId, [campaign]);
    }
  }

  const groups: OnlineGroupCampaignInventoryGroup[] = [];

  for (const [mainChatId, versions] of chatVersions) {
    const sortedVersions = versions.sort((left, right) => {
      const createdAtDifference = left.createdAt.getTime() - right.createdAt.getTime();

      if (createdAtDifference !== 0) return createdAtDifference;
      return compareStrings(left.id, right.id);
    });

    const libraryChatIds = versions.map((campaign) => campaign.libraryChatId);
    const uniqueChatIds = new Set(libraryChatIds);

    const hubChatIds = [...uniqueChatIds].sort();

    groups.push({
      mainChatId,
      campaigns: sortedVersions,
      hubChatIds,
    });
  }

  return groups.sort((left, right) => compareStrings(left.mainChatId, right.mainChatId));
}
