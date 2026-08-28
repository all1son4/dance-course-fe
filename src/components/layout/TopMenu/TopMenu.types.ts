import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

export type TopMenuItem = {
  analyticsId: string;
  label: ReactNode;
  href: string;
  onClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
};
