import { ReactNode } from "react";

export type TCourseCard = {
  icon?: ReactNode;
  title?: string;
  subtitle?: string;
  cardContent?: ReactNode | string;
  onClick?: () => void;
  iconSize?: {
    width: number;
    height: number;
  };
  bgColor?: string;
};
