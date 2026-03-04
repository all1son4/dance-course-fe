"use client";

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ElementType } from "react";

import { ButtonLinkWrapper, StyledButton } from "./Button.styles";
import type { ButtonProps } from "./Button.types";

export default function Button<T extends ElementType = "button">({
  variant = "primary",
  width = "100%",
  buttonText = "",
  size = "lg",
  href = "",
  target = "_self",
  ...rest
}: ButtonProps<T>) {
  const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  const linkProps = {
    ...(rest as AnchorHTMLAttributes<HTMLAnchorElement> & {
      disabled?: boolean;
      type?: string;
    }),
  };
  const linkRel =
    target === "_blank" ? (linkProps.rel ?? "noopener noreferrer") : linkProps.rel;

  delete linkProps.disabled;
  delete linkProps.rel;
  delete linkProps.type;

  if (href) {
    return (
      <ButtonLinkWrapper
        $size={size}
        $variant={variant}
        $width={width}
        href={href}
        rel={linkRel}
        target={target}
        {...linkProps}
      >
        {buttonText}
      </ButtonLinkWrapper>
    );
  }

  return (
    <StyledButton
      $variant={variant}
      $width={width}
      $size={size}
      {...buttonProps}
      type={buttonProps.type ?? "button"}
    >
      {buttonText}
    </StyledButton>
  );
}
