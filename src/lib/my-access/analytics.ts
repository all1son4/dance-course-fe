import type {
  AnalyticsEventProperties,
  ButtonAnalyticsMetadata,
} from "@/lib/mixpanel-analytics";

import type { MyAccessCard } from "./cards";

type AnalyticsCard = Pick<MyAccessCard, "kind" | "chip" | "action">;

/** Only bounded presentation states cross the analytics boundary. */
export const getMyAccessAnalyticsProperties = (
  status: AnalyticsEventProperties["my_access_viewed"]["status"],
  cards: readonly AnalyticsCard[] = [],
): AnalyticsEventProperties["my_access_viewed"] => {
  const hubCards = cards.filter((card) => card.kind === "hub");

  return {
    status,
    card_count: cards.length,
    hub_card_count: hubCards.length,
    hub_states: [...new Set(hubCards.map((card) => card.chip))].sort(),
    has_renewal_action: cards.some((card) => card.action?.key === "renewHub"),
  };
};

const ACTION_IDS = {
  renewHub: "my_access_renew_hub",
  buyHub: "my_access_buy_hub",
  support: "my_access_contact_support",
} as const;

export const getMyAccessActionAnalytics = (
  card: AnalyticsCard,
): ButtonAnalyticsMetadata | undefined =>
  card.action
    ? {
        id: ACTION_IDS[card.action.key],
        placement: "my_access",
        access_action: card.action.key,
        access_kind: card.kind,
        access_state: card.chip,
      }
    : undefined;
