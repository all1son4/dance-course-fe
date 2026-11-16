export type StandaloneHubPeriodStartInput = {
  paidAt: Date;
  currentAccessEndsAt: Date | null;
};

/**
 * Chooses when a paid standalone Hub period starts: at payment, or when the access
 * it follows ends, whichever is later. The same rule serves new purchases, early
 * renewals and continuations after Standard/Plus. Dates are validated by the caller.
 */
export const getStandaloneHubPeriodStart = (
  input: StandaloneHubPeriodStartInput,
): Date => {
  if (
    input.currentAccessEndsAt &&
    input.currentAccessEndsAt.getTime() > input.paidAt.getTime()
  ) {
    return input.currentAccessEndsAt;
  }
  return input.paidAt;
};
