import { ChangeEvent, ReactNode } from "react";

export type TCheckbox = {
  name?: string;
  checked: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string | ReactNode;
};
