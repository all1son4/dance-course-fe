import type { AnchorHTMLAttributes, HTMLAttributeAnchorTarget, ReactNode } from "react";

export type InteractiveCardProps = {
  title: string;
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
