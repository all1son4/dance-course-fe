import { addWarsawCalendarDays } from "./calendar";

export type StandaloneHubPeriodEndInput = {
  startsAt: Date | null;
};

const HUB_PERIOD_LENGTH_DAYS = 56;

/**
 * Calculates expiry of a 56-calendar-day standalone Hub period in Warsaw.
 * An unknown start keeps expiry unknown. Known dates are validated by the caller.
 */
export function getStandaloneHubPeriodEnd(input: { startsAt: Date }): Date;
export function getStandaloneHubPeriodEnd(input: { startsAt: null }): null;
export function getStandaloneHubPeriodEnd(
  input: StandaloneHubPeriodEndInput,
): Date | null;
export function getStandaloneHubPeriodEnd(
  input: StandaloneHubPeriodEndInput,
): Date | null {
  const { startsAt } = input;

  if (!startsAt) return null;

  return addWarsawCalendarDays(startsAt, HUB_PERIOD_LENGTH_DAYS);
}
