import { ReactNode } from "react";

export type TInteractiveCard = {
  title: string;
  topRowContent?: ReactNode;
  bottomRowContent?: ReactNode;
  buttonText?: string;
  buttonOnClick?: () => void;
};
