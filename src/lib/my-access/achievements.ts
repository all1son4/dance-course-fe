import { addWarsawCalendarMonths } from "@/lib/inspiration-hub/calendar";

/**
 * «Дебют»: the customer's first step is still recent - at most three months ago.
 * The stamp needs a paid purchase; free access does not count, neither on its own nor
 * before it. A cycle of the group counts whatever its sum: it is participation, and
 * the cycles paid to Anna directly are recorded at 0 (admin offer links, the 1.0
 * roster), so a member of an earlier cycle is no newcomer (prod, 2026-11-26).
 */
export const hasFreshmanAchievement = (
  purchases: readonly { amountMinor: number; boughtAt: Date; cohortId?: string | null }[],
  now: Date,
): boolean => {
  let firstStepAt = Infinity;
  let hasPaid = false;

  for (const { amountMinor, boughtAt, cohortId } of purchases) {
    if (amountMinor > 0) hasPaid = true;
    if (amountMinor > 0 || cohortId) {
      firstStepAt = Math.min(firstStepAt, boughtAt.getTime());
    }
  }

  return (
    hasPaid &&
    firstStepAt <= now.getTime() &&
    firstStepAt >= addWarsawCalendarMonths(now, -3).getTime()
  );
};
