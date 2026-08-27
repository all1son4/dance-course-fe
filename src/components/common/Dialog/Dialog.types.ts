import type { ReactNode } from "react";

export type DialogSize = "md";

export type DialogProps = {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  /** Keep the title for assistive tech but take it off the screen. */
  isTitleVisuallyHidden?: boolean;
  description?: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  closeLabel?: string;
  className?: string;
};
