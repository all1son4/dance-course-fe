import type { ComponentPropsWithoutRef, ElementType } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "white";
/**
 * `live` turns on the real backdrop blur. Reserve it for buttons that sit on a
 * photo or video - on the flat page background the blur is invisible and only
 * costs a backdrop root per button.
 */
export type ButtonFrost = "static" | "live";
export type ButtonSize = "lg" | "sm";

export type ButtonBaseProps = {
  variant?: ButtonVariant;
  width?: string;
  buttonText?: string;
  href?: string;
  target?: string;
  size?: "lg" | "sm";
  frost?: ButtonFrost;
  isLoading?: boolean;
};

// Polymorphic-ish typing (good enough for Next Link `as={Link}`)
export type ButtonProps<T extends ElementType = "button"> = ButtonBaseProps &
  Omit<ComponentPropsWithoutRef<T>, keyof ButtonBaseProps | "as" | "color"> & {
    as?: T;
  };
