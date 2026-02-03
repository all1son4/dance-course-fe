import { ReactNode } from "react";

export type TContact = {
  id: number;
  icon: ReactNode;
  title: string;
  text: string;
  link?: string;
};
