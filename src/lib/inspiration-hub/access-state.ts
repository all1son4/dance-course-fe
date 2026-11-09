import { getPaidHubPeriodState, type PaidHubPeriodStateInput } from "./period-state";

export type HubAccessRight = Pick<
  PaidHubPeriodStateInput,
  "periodStartMode" | "startsAt" | "expiresAt"
> & {
  sourceKind: "online_group" | "standalone_hub" | "hub_bridge";
};

/**
 * The one rule for whether a classified Hub right opens the shared Hub at checkedAt.
 * Payment, ownership, chat and revocation are checked by the caller.
 */
export function isHubAccessRightActive(right: HubAccessRight, checkedAt: Date): boolean {
  const checkedAtMs = checkedAt.getTime();
  const startsAtMs = right.startsAt?.getTime() ?? null;
  const expiresAtMs = right.expiresAt?.getTime() ?? null;

  switch (right.sourceKind) {
    case "standalone_hub":
      return (
        getPaidHubPeriodState({
          periodStartMode: right.periodStartMode,
          startsAt: right.startsAt,
          expiresAt: right.expiresAt,
          checkedAt,
        }) === "active"
      );
    case "hub_bridge":
      return (
        startsAtMs !== null &&
        expiresAtMs !== null &&
        startsAtMs <= checkedAtMs &&
        checkedAtMs < expiresAtMs
      );
    case "online_group":
      // The Hub included in Plus stays open until an end is recorded for it.
      return (
        (startsAtMs === null || startsAtMs <= checkedAtMs) &&
        (expiresAtMs === null || checkedAtMs < expiresAtMs)
      );
  }
}
