import { addWarsawCalendarDays } from "./calendar";

/**
 * The lengths a paid standalone Hub period may have: the regular 8 weeks, and the
 * 16 weeks of a full-price purchase during Black Friday 2026 (16 weeks for the price
 * of 8). The length is fixed on the right when it is written and never recomputed.
 */
export const HUB_PERIOD_DAYS = [56, 112] as const;
export type HubPeriodDays = (typeof HUB_PERIOD_DAYS)[number];
export const DEFAULT_HUB_PERIOD_DAYS: HubPeriodDays = 56;

export const isHubPeriodDays = (value: number | null): value is HubPeriodDays =>
  value !== null && (HUB_PERIOD_DAYS as readonly number[]).includes(value);

export type StandaloneHubPeriodEndInput = {
  startsAt: Date | null;
  days?: HubPeriodDays;
};

/**
 * Calculates expiry of a standalone Hub period of `days` calendar days in Warsaw
 * (56 unless given). An unknown start keeps expiry unknown. Known dates are
 * validated by the caller.
 */
export function getStandaloneHubPeriodEnd(input: {
  startsAt: Date;
  days?: HubPeriodDays;
}): Date;
export function getStandaloneHubPeriodEnd(input: {
  startsAt: null;
  days?: HubPeriodDays;
}): null;
export function getStandaloneHubPeriodEnd(
  input: StandaloneHubPeriodEndInput,
): Date | null;
export function getStandaloneHubPeriodEnd(
  input: StandaloneHubPeriodEndInput,
): Date | null {
  const { startsAt, days = DEFAULT_HUB_PERIOD_DAYS } = input;

  if (!startsAt) return null;

  return addWarsawCalendarDays(startsAt, days);
}
