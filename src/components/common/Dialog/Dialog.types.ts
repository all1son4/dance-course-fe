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
  /**
   * Identifies what the dialog currently shows (e.g. "form" | "success").
   * When it changes, the new content fades in while the dialog's height
   * glides from the old content's height to the new one instead of jumping.
   */
  contentKey?: string;
  /** Set for a moment before `contentKey` changes: the current content fades out first. */
  isContentLeaving?: boolean;
};
