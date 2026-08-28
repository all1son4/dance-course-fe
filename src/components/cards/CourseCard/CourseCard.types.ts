import type { ReactNode } from "react";

import type { ButtonAnalyticsMetadata } from "@/lib/mixpanel-analytics";

export type CourseCardProps = {
  analyticsId?: string;
  icon?: ReactNode;
  title?: string;
  subtitle?: string;
  cardContent?: ReactNode | string;
  buttonText?: string;
  buttonHref?: string;
  buttonAnalytics?: ButtonAnalyticsMetadata;
  buttonRel?: string;
  buttonTarget?: string;
  /** Marks the button as an anchor the page's sticky CTA mirrors. */
  buttonIsStickyAnchor?: boolean;
  bgColor?: string;
};
