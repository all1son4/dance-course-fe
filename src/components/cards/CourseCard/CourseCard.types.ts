import { ReactNode } from "react";

export type TCourseCard = {
  icon?: ReactNode;
  title?: string;
  subtitle?: string;
  cardContent?: ReactNode | string;
  buttonText?: string;
  buttonHref?: string;
  iconSize?: {
    width: number;
    height: number;
  };
  bgColor?: string;
};
