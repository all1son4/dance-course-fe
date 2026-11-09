export type PaidHubPeriodStateInput = {
  periodStartMode: "payment" | "after_entitlement" | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  checkedAt: Date;
};

export type PaidHubPeriodState =
  "legacy" | "awaiting_predecessor" | "invalid" | "scheduled" | "active" | "expired";

export function getPaidHubPeriodState(
  input: PaidHubPeriodStateInput,
): PaidHubPeriodState {
  if (input.periodStartMode === null) return "legacy";
  if (
    input.periodStartMode === "after_entitlement" &&
    input.startsAt === null &&
    input.expiresAt === null
  )
    return "awaiting_predecessor";
  if (!input.startsAt || !input.expiresAt || input.startsAt >= input.expiresAt)
    return "invalid";
  if (input.checkedAt < input.startsAt) return "scheduled";
  if (input.checkedAt >= input.expiresAt) return "expired";
  return "active";
}
