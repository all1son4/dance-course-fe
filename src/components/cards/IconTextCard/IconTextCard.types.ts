import type { ReactNode } from "react";

type IconTextCardBaseProps = {
  icon?: ReactNode;
  title?: ReactNode;
  text?: ReactNode;
};

/** Glass panel with a heading and rich text (course/choreo suggestions). */
export type IconTextPanelProps = IconTextCardBaseProps & {
  variant?: "panel";
  link?: never;
};

/** Compact icon + label + value row; becomes a link when `link` is given. */
export type IconTextContactProps = IconTextCardBaseProps & {
  variant: "contact";
  title: string;
  text: string;
  link?: string;
};

export type IconTextCardProps = IconTextPanelProps | IconTextContactProps;
