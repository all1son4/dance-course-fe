import type {
  ChangeEvent,
  FocusEventHandler,
  HTMLInputTypeAttribute,
  InputHTMLAttributes,
  ReactNode,
} from "react";

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
  /** Picks the phone keyboard (numeric for a postal code, email…). */
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  /** Labels the phone keyboard's return key ("next", "done"). */
  enterKeyHint?: InputHTMLAttributes<HTMLInputElement>["enterKeyHint"];
  /** Quiet line under the field (why it is asked); an error takes its place. */
  hint?: ReactNode;
  /** The value is valid: a small tick at the field's end and a calmer border. */
  isComplete?: boolean;
  /** Fixed text inside the field before the value ("@" for a handle). */
  prefix?: string;
};
