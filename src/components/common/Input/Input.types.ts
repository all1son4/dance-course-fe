import type { ChangeEvent, FocusEventHandler, HTMLInputTypeAttribute } from "react";

export type InputElement = HTMLInputElement | HTMLSelectElement;

export type InputOption = {
  label: string;
  value: string;
};

export type InputVariant = "primary" | "outlined" | "simple";

export type InputMaskPattern = string | Array<string | RegExp>;

export type TInput = {
  name: string;
  type?: HTMLInputTypeAttribute;
  onChange: (event: ChangeEvent<InputElement>) => void;
  onBlur?: FocusEventHandler<InputElement>;
  onFocus?: FocusEventHandler<InputElement>;
  value: string | number;
  placeholder?: string;
  label?: string;
  width?: string;
  variant?: InputVariant;
  disabled?: boolean;
  errorMessage?: string;
  inputMask?: InputMaskPattern | null;
  id?: string;
  selectOptions?: InputOption[];
  autoComplete?: string;
};
