import { addWarsawCalendarMonths } from "@/lib/inspiration-hub/calendar";

/** The first successful paid purchase in the customer's history is still recent. */
export const hasFreshmanAchievement = (
  purchases: readonly { amountMinor: number; boughtAt: Date }[],
  now: Date,
): boolean => {
  let firstPaidAt = Infinity;

  for (const { amountMinor, boughtAt } of purchases) {
    if (amountMinor > 0) firstPaidAt = Math.min(firstPaidAt, boughtAt.getTime());
  }

  return (
    firstPaidAt <= now.getTime() &&
    firstPaidAt >= addWarsawCalendarMonths(now, -3).getTime()
  );
};
