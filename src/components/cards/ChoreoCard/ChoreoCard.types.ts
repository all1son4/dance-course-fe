import type { ReactNode } from "react";

import type { ButtonAnalyticsMetadata } from "@/lib/mixpanel-analytics";

export type ChoreoCardButtonProps = {
  analytics?: ButtonAnalyticsMetadata;
  href?: string;
  text?: string;
};

/**
 * A struck-through "bought separately" price shown before the card's own
 * price. `current` is only needed when the card has no single `price`
 * (several tariffs), e.g. "from 85 PLN / 20 €".
 */
export type ChoreoCardPriceAnchor = {
  /** Screen-reader text that explains the struck-through amount. */
  label: string;
  compareAt: string;
  current?: string;
};

export type ChoreoCardProps = {
  analyticsId?: string;
  videoSrc?: string;
  posterSrc?: string;
  title?: string;
  price?: string;
  /** Caption above `price`, as on the tariff cards ("Price"). */
  priceLabel?: string;
  subtitle?: string;
  firstButtonOptions?: ChoreoCardButtonProps;
  secondButtonOptions?: ChoreoCardButtonProps;
  /** Two or three short facts shown as quiet chips under the title. */
  highlights?: readonly string[];
  priceAnchor?: ChoreoCardPriceAnchor;
  specialOffer?: boolean;
  icon?: ReactNode;
};
