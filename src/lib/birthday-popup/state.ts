/**
 * The shape of what the campaign remembers about a visitor, plus the two pure
 * functions over it: whether the popup may appear, and what each signal changes.
 * No storage and no browser APIs live here.
 */

import { BIRTHDAY_POPUP_ENABLED, MAX_CAMPAIGN_DAYS, REACTED_COOLDOWN_MS } from "./config";

export type BirthdayPopupState = {
  version: 1;
  seenCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  dismissedAt: string | null;
  clickedAt: string | null;
  checkoutStartedAt: string | null;
  purchasedAt: string | null;
};

export const createInitialBirthdayPopupState = (): BirthdayPopupState => ({
  version: 1,
  seenCount: 0,
  firstSeenAt: null,
  lastSeenAt: null,
  dismissedAt: null,
  clickedAt: null,
  checkoutStartedAt: null,
  purchasedAt: null,
});

const isNullableIsoString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

export const isBirthdayPopupState = (value: unknown): value is BirthdayPopupState => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BirthdayPopupState>;

  return (
    candidate.version === 1 &&
    typeof candidate.seenCount === "number" &&
    isNullableIsoString(candidate.firstSeenAt) &&
    isNullableIsoString(candidate.lastSeenAt) &&
    isNullableIsoString(candidate.dismissedAt) &&
    isNullableIsoString(candidate.clickedAt) &&
    isNullableIsoString(candidate.checkoutStartedAt) &&
    isNullableIsoString(candidate.purchasedAt)
  );
};

const parseDate = (value: string | null): Date | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const daysBetween = (from: Date, to: Date) =>
  (to.getTime() - from.getTime()) / 86_400_000;

const getLastReactionAt = (state: BirthdayPopupState): Date | null => {
  const reactions = [state.dismissedAt, state.clickedAt, state.checkoutStartedAt]
    .map(parseDate)
    .filter((value): value is Date => value !== null);

  if (reactions.length === 0) {
    return null;
  }

  return reactions.reduce((latest, value) =>
    value.getTime() > latest.getTime() ? value : latest,
  );
};

/**
 * Pure decision rule.
 *
 * - bought it                                        -> never again
 * - dismissed, opened the offer, or started checkout -> quiet for 4 hours
 * - shown and left alone                             -> again on the next page load
 */
export const shouldShowBirthdayPopup = (
  state: BirthdayPopupState,
  now: Date,
): boolean => {
  if (!BIRTHDAY_POPUP_ENABLED || state.purchasedAt) {
    return false;
  }

  const firstSeenAt = parseDate(state.firstSeenAt);

  if (firstSeenAt && daysBetween(firstSeenAt, now) > MAX_CAMPAIGN_DAYS) {
    return false;
  }

  const lastReactionAt = getLastReactionAt(state);

  if (!lastReactionAt) {
    return true;
  }

  return now.getTime() - lastReactionAt.getTime() >= REACTED_COOLDOWN_MS;
};

type BirthdayPopupSignal =
  "seen" | "dismissed" | "clicked" | "checkout_started" | "purchased";

export const applyBirthdayPopupSignal = (
  state: BirthdayPopupState,
  signal: BirthdayPopupSignal,
  now: Date,
): BirthdayPopupState => {
  const timestamp = now.toISOString();

  switch (signal) {
    case "seen": {
      const lastSeenAt = parseDate(state.lastSeenAt);
      const lastReactionAt = getLastReactionAt(state);
      // Kept as campaign history and for compatibility with the version 1
      // storage shape. This counter no longer limits whether the popup appears.
      const startsNewRound =
        lastSeenAt === null ||
        (lastReactionAt !== null && lastReactionAt.getTime() > lastSeenAt.getTime());

      return {
        ...state,
        seenCount: startsNewRound ? state.seenCount + 1 : state.seenCount,
        firstSeenAt: state.firstSeenAt ?? timestamp,
        lastSeenAt: timestamp,
      };
    }
    case "dismissed":
      return { ...state, dismissedAt: timestamp };
    case "clicked":
      return { ...state, clickedAt: timestamp };
    case "checkout_started":
      return { ...state, checkoutStartedAt: timestamp };
    case "purchased":
      return { ...state, purchasedAt: timestamp };
  }
};
