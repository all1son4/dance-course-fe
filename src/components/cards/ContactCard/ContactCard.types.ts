import { ReactNode } from "react";

export type TContactCard = {
  icon: ReactNode;
  title: string;
  text: string;
  onClick?: () => void;
  link?: string;
};
