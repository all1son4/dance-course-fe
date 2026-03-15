import type { AnchorHTMLAttributes, HTMLAttributeAnchorTarget, ReactNode } from "react";

export type TInteractiveCard = {
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
