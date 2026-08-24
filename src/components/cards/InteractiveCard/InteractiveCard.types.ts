import type { AnchorHTMLAttributes, HTMLAttributeAnchorTarget, ReactNode } from "react";

/**
 * `live` turns on the real backdrop blur. Needed when the card is pinned over
 * scrolling content - on a flat background the blur is invisible and only costs
 * a backdrop root.
 */
export type InteractiveCardFrost = "static" | "live";

export type InteractiveCardProps = {
  title: string;
  frost?: InteractiveCardFrost;
  topRowContent?: ReactNode;
  bottomRowContent?: ReactNode;
  buttonText?: string;
  buttonHref?: string;
  buttonTarget?: HTMLAttributeAnchorTarget;
  buttonRel?: AnchorHTMLAttributes<HTMLAnchorElement>["rel"];
  isTopRowCollapsible?: boolean;
  defaultCollapseTopRow?: boolean;
  collapseTopRow?: boolean;
  onCollapseTopRowChange?: (collapsed: boolean) => void;
};
