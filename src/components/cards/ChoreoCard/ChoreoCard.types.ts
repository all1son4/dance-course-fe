import type { ReactNode } from "react";

import type { ButtonAnalyticsMetadata } from "@/lib/mixpanel-analytics";

export type ChoreoCardButtonProps = {
  analytics?: ButtonAnalyticsMetadata;
  href?: string;
  text?: string;
};

export type ChoreoCardProps = {
  analyticsId?: string;
  videoSrc?: string;
  posterSrc?: string;
  title?: string;
  subtitle?: string;
  firstButtonOptions?: ChoreoCardButtonProps;
  secondButtonOptions?: ChoreoCardButtonProps;
  specialOffer?: boolean;
  icon?: ReactNode;
};
