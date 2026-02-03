"use client";

import type { ButtonHTMLAttributes, ElementType } from "react";

import { StyledButton } from "./Button.styles";
import { ButtonProps } from "./Button.types";

export default function Button<T extends ElementType = "button">({
  variant = "primary",
  width = "100%",
  buttonText = "",
  size = "lg",
  ...rest
}: ButtonProps<T>) {
  return (
    <StyledButton
      $variant={variant}
      $width={width}
      $size={size}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {buttonText}
    </StyledButton>
  );
}
