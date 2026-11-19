import { isOnlineGroupRenewalOfferId } from "@/constants/sellable-products";

/*
 * Which Online Group cycles a customer went through, from purchase data only
 * (owner, 2026-11-19: nothing entered by hand). Three facts count:
 *  - a cycle bought: by the customer, or under their Telegram account (an admin
 *    offer link carries nothing else);
 *  - a renewal into a cycle: it is sold only to members of the campaign's source
 *    chats, so it proves the cycle behind them — when they name one cycle;
 *  - membership of a cycle's chat, verified by the site at a renewal checkout.
 * A cycle is behind once it is closed. Pure: the reads live in `db/my-access`.
 */

export type CycleFacts = {
  /** Succeeded purchases with a cycle, of the customer or their Telegram account. */
  purchases: readonly { cohortId: string; offerExternalId: string | null }[];
  /** Renewal campaigns: into which chat, for which offer, from which chats. */
  renewalCampaigns: readonly {
    offerExternalId: string | null;
    sourceChatIds: readonly string[];
    targetChatId: string;
  }[];
  /** Chats the site verified the customer's Telegram account in. */
  verifiedChatIds: readonly string[];
  cohorts: readonly { closed: boolean; id: string; mainChatId: string }[];
};

/** Every cycle the facts place the customer in, running or closed. */
export const collectMemberCohortIds = ({
  cohorts,
  purchases,
  renewalCampaigns,
  verifiedChatIds,
}: CycleFacts): string[] => {
  const byId = new Map(cohorts.map((cohort) => [cohort.id, cohort]));
  const byChat = new Map(cohorts.map((cohort) => [cohort.mainChatId, cohort]));
  const cycles = new Set<string>();

  for (const purchase of purchases) {
    cycles.add(purchase.cohortId);

    const target = byId.get(purchase.cohortId);
    if (!target || !purchase.offerExternalId) continue;
    if (!isOnlineGroupRenewalOfferId(purchase.offerExternalId)) continue;

    const sources = new Set(
      renewalCampaigns
        .filter(
          (campaign) =>
            campaign.targetChatId === target.mainChatId &&
            campaign.offerExternalId === purchase.offerExternalId,
        )
        .flatMap((campaign) => campaign.sourceChatIds)
        .flatMap((chatId) => {
          const source = byChat.get(chatId);
          return source && source.id !== target.id ? [source.id] : [];
        }),
    );
    // Several source cycles: the renewal proves one of them, not which.
    if (sources.size === 1) cycles.add([...sources][0]!);
  }

  for (const chatId of verifiedChatIds) {
    const cohort = byChat.get(chatId);
    if (cohort) cycles.add(cohort.id);
  }

  return [...cycles].filter((id) => byId.has(id)).sort();
};

/** The cycles behind the customer: those of `collectMemberCohortIds` already closed. */
export const collectCompletedCohortIds = (facts: CycleFacts): string[] => {
  const closed = new Set(facts.cohorts.filter((c) => c.closed).map((c) => c.id));
  return collectMemberCohortIds(facts).filter((id) => closed.has(id));
};

/**
 * «Легенда группы» (owner, 2026-11-19): in every cycle there is, from the very
 * first to the newest — the newest one paid, whether it has started or not. The
 * medal shows how many; one cycle missed, or the newest not bought, and it is
 * gone. Null below two cycles: one is not a streak.
 */
export const countLegendCycles = (
  cohortIds: readonly string[],
  memberCohortIds: readonly string[],
): number | null => {
  const member = new Set(memberCohortIds);
  return cohortIds.length >= 2 && cohortIds.every((id) => member.has(id))
    ? cohortIds.length
    : null;
};
