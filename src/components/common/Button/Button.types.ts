import type { ComponentPropsWithoutRef, ElementType } from "react";

export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "lg" | "sm";

export type ButtonBaseProps = {
  variant?: ButtonVariant;
  width?: string;
  buttonText?: string;
  href?: string;
  target?: string;
  size?: "lg" | "sm";
  isLoading?: boolean;
};

// Polymorphic-ish typing (good enough for Next Link `as={Link}`)
export type ButtonProps<T extends ElementType = "button"> = ButtonBaseProps &
  Omit<ComponentPropsWithoutRef<T>, keyof ButtonBaseProps | "as" | "color"> & {
    as?: T;
  };
