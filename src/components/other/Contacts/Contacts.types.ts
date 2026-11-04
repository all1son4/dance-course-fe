import { ReactNode } from "react";

export type TContact = {
  id: number;
  /** Stable `cta_id` for click analytics; never the label or the link. */
  analyticsId: string;
  icon: ReactNode;
  title: string;
  text: string;
  link?: string;
};
