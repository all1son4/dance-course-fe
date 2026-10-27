import type { AnchorHTMLAttributes, HTMLAttributeAnchorTarget, ReactNode } from "react";

/**
 * `live` turns on the real backdrop blur. Needed when the card is pinned over
 * scrolling content - on a flat background the blur is invisible and only costs
 * a backdrop root.
 */
export type InteractiveCardFrost = "static" | "live";

export type InteractiveCardOccasionTheme = "halloween";

export type InteractiveCardOccasion = {
  theme: InteractiveCardOccasionTheme;
  label: string;
};

export type InteractiveCardProps = {
  analyticsCollection?: "offline_courses" | "online_courses";
  analyticsId?: string;
  title: string;
  frost?: InteractiveCardFrost;
  /** Omit to restore the standard card, including its header and button. */
  occasion?: InteractiveCardOccasion;
  topRowContent?: ReactNode;
  bottomRowContent?: ReactNode;
  buttonText?: string;
  buttonHref?: string;
  buttonPrefetch?: boolean;
  buttonTarget?: HTMLAttributeAnchorTarget;
  buttonRel?: AnchorHTMLAttributes<HTMLAnchorElement>["rel"];
  isTopRowCollapsible?: boolean;
  defaultCollapseTopRow?: boolean;
};
