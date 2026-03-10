"use client";

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ElementType } from "react";

import { getHashTargetFromHref, scrollToHashTarget } from "@/lib/scroll";

import { ButtonAnchorWrapper, ButtonLinkWrapper, StyledButton } from "./Button.styles";
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
  const {
    rel: relFromProps,
    onClick: onLinkClick,
    ...restLinkProps
  } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & {
    disabled?: boolean;
    type?: string;
  };
  const linkRel =
    target === "_blank" ? (relFromProps ?? "noopener noreferrer") : relFromProps;
  const shouldDisableAutoScroll = href.includes("#") && target === "_self";

  if (href && href.startsWith("#") && target === "_self") {
    const onHashLinkClick: AnchorHTMLAttributes<HTMLAnchorElement>["onClick"] = (
      event,
    ) => {
      onLinkClick?.(event);

      if (event.defaultPrevented) {
        return;
      }

      const hashTargetId = getHashTargetFromHref(href);

      if (!hashTargetId) {
        return;
      }

      if (!scrollToHashTarget(hashTargetId)) {
        return;
      }

      event.preventDefault();

      const nextHash = `#${hashTargetId}`;
      const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
      window.history.replaceState(window.history.state, "", nextUrl);
    };

    return (
      <ButtonAnchorWrapper
        $size={size}
        $variant={variant}
        $width={width}
        href={href}
        rel={linkRel}
        target={target}
        {...restLinkProps}
        onClick={onHashLinkClick}
      >
        {buttonText}
      </ButtonAnchorWrapper>
    );
  }

  if (href) {
    return (
      <ButtonLinkWrapper
        $size={size}
        $variant={variant}
        $width={width}
        href={href}
        scroll={shouldDisableAutoScroll ? false : undefined}
        rel={linkRel}
        target={target}
        {...restLinkProps}
        onClick={onLinkClick}
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
