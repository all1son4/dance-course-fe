import { ChangeEvent, ReactNode } from "react";

export type TCheckbox = {
  name?: string;
  checked: boolean;
  disabled?: boolean;
  errorMessage?: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string | ReactNode;
};
