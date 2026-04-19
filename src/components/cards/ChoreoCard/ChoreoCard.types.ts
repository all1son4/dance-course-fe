import type { ReactNode } from "react";

export type ChoreoCardButtonProps = {
  href?: string;
  text?: string;
};

export type ChoreoCardProps = {
  videoSrc?: string;
  posterSrc?: string;
  title?: string;
  subtitle?: string;
  firstButtonOptions?: ChoreoCardButtonProps;
  secondButtonOptions?: ChoreoCardButtonProps;
  specialOffer?: boolean;
  icon?: ReactNode;
};
