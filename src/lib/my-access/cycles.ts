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

/** A cycle, listed in the order the cycles start; `started` once its start is behind. */
export type StampCohort = { id: string; started: boolean };

/**
 * The customer's unbroken run of cycles up to now, as positions in `cohorts`:
 * from the newest cycle bought back to the last one missed. A cycle that has not
 * started breaks nothing, and once bought it already counts (owner, 2026-11-22:
 * a stamp goes only when a new cycle starts without the customer). Null when the
 * newest started cycle went without them.
 */
const findCurrentRun = (
  cohorts: readonly StampCohort[],
  memberCohortIds: readonly string[],
): { first: number; last: number } | null => {
  const member = new Set(memberCohortIds);
  let last = cohorts.length - 1;
  while (last >= 0 && !cohorts[last]!.started && !member.has(cohorts[last]!.id)) last--;
  let first = last;
  while (first >= 0 && member.has(cohorts[first]!.id)) first--;
  return last > first ? { first: first + 1, last } : null;
};

/**
 * «Легенда группы» (owner, 2026-11-19): in every cycle from the very first one up
 * to now. The stamp shows how many; one cycle missed and it is gone. Null below
 * two cycles: one is not a streak.
 */
export const countLegendCycles = (
  cohorts: readonly StampCohort[],
  memberCohortIds: readonly string[],
): number | null => {
  const run = findCurrentRun(cohorts, memberCohortIds);
  return run && run.first === 0 && run.last >= 1 ? run.last + 1 : null;
};

/**
 * «Подряд» (owner, 2026-11-22): at least two cycles in a row up to now, for
 * those who joined after the first one — a run from the first is «Легенда группы».
 * It grows with every next cycle and starts over after a missed one. `first` and
 * `last` are the cycle numbers: the N-th cycle is N.0.
 */
export const findCycleStreak = (
  cohorts: readonly StampCohort[],
  memberCohortIds: readonly string[],
): { count: number; first: number; last: number } | null => {
  const run = findCurrentRun(cohorts, memberCohortIds);
  return run && run.first > 0 && run.last > run.first
    ? { count: run.last - run.first + 1, first: run.first + 1, last: run.last + 1 }
    : null;
};
