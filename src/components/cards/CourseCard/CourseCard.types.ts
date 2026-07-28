import type { ReactNode } from "react";

export type CourseCardProps = {
  icon?: ReactNode;
  title?: string;
  subtitle?: string;
  cardContent?: ReactNode | string;
  buttonText?: string;
  buttonHref?: string;
  buttonRel?: string;
  iconSize?: {
    width: number;
    height: number;
  };
  bgColor?: string;
};
