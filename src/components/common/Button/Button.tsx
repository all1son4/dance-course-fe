"use client";

import type { ButtonHTMLAttributes, ElementType } from "react";

import { ButtonLinkWrapper, StyledButton } from "./Button.styles";
import { ButtonProps } from "./Button.types";

export default function Button<T extends ElementType = "button">({
  variant = "primary",
  width = "100%",
  buttonText = "",
  size = "lg",
  href = "",
  target = "_self",
  ...rest
}: ButtonProps<T>) {
  const buttonReturnContent = (
    <StyledButton
      $variant={variant}
      $width={width}
      $size={size}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {buttonText}
    </StyledButton>
  );

  return !!href ? (
    <ButtonLinkWrapper href={href} target={target} $width={width}>
      {buttonReturnContent}
    </ButtonLinkWrapper>
  ) : (
    buttonReturnContent
  );
}
