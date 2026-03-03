import type { ChangeEvent, FocusEventHandler, HTMLInputTypeAttribute } from "react";

export type InputVariant = "primary" | "outlined" | "simple";

export type InputMaskPattern = string | Array<string | RegExp>;

export type TInput = {
  name: string;
  type?: HTMLInputTypeAttribute;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  value: string | number;
  placeholder?: string;
  label?: string;
  width?: string;
  variant?: InputVariant;
  disabled?: boolean;
  errorMessage?: string;
  inputMask?: InputMaskPattern | null;
  id?: string;
};
