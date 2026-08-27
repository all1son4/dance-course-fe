import type { ReactNode } from "react";

export type CourseCardProps = {
  icon?: ReactNode;
  title?: string;
  subtitle?: string;
  cardContent?: ReactNode | string;
  buttonText?: string;
  buttonHref?: string;
  buttonRel?: string;
  buttonTarget?: string;
  /** Marks the button as an anchor the page's sticky CTA mirrors. */
  buttonIsStickyAnchor?: boolean;
  bgColor?: string;
};
