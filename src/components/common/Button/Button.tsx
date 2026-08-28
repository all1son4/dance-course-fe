"use client";

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ElementType,
  ReactNode,
} from "react";

import {
  getLinkRel,
  HASH_PREFIX,
  isInDocumentHashHref,
  isModifiedClickEvent,
  isSameRoute,
  SELF_TARGET,
  shouldTrackRouteLoading,
} from "@/lib/button-navigation";

import {
  ButtonAnchorWrapper,
  ButtonContent,
  ButtonLabel,
  ButtonLinkWrapper,
  ButtonSpinner,
  ButtonSpinnerSlot,
  StyledButton,
} from "./Button.styles";
import type { ButtonProps } from "./Button.types";
import { useHashLinkClick } from "./useHashLinkClick";
import { useRouteLoadingState } from "./useRouteLoadingState";

type LinkClickHandler = NonNullable<AnchorHTMLAttributes<HTMLAnchorElement>["onClick"]>;

const DEFAULT_BUTTON_TYPE = "button";

const renderButtonContent = (content: ReactNode, isButtonLoading: boolean) => (
  <ButtonContent>
    <ButtonLabel>{content}</ButtonLabel>
    <ButtonSpinnerSlot $isLoading={isButtonLoading}>
      <ButtonSpinner aria-hidden $isLoading={isButtonLoading} />
    </ButtonSpinnerSlot>
  </ButtonContent>
);

export default function Button<T extends ElementType = "button">({
  variant = "primary",
  width = "100%",
  buttonText = "",
  size = "lg",
  frost = "static",
  href = "",
  target = SELF_TARGET,
  isLoading = false,
  children,
  ...rest
}: ButtonProps<T>) {
  const { isRouteLoading, startRouteLoadingState } = useRouteLoadingState();
  const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  const {
    disabled: isDisabled,
    rel: relFromProps,
    onClick: onLinkClick,
    ...restLinkProps
  } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & {
    disabled?: boolean;
    type?: string;
  };
  const linkRel = getLinkRel(target, relFromProps);
  const shouldDisableAutoScroll = href.includes(HASH_PREFIX) && target === SELF_TARGET;
  const isButtonLoading = isLoading || isRouteLoading;
  const onHashLinkClick = useHashLinkClick({ href, isDisabled, onLinkClick });

  const buttonContent = renderButtonContent(children ?? buttonText, isButtonLoading);

  if (href && isInDocumentHashHref(href, target)) {
    return (
      <ButtonAnchorWrapper
        $frost={frost}
        $size={size}
        $variant={variant}
        $width={width}
        href={href}
        rel={linkRel}
        target={target}
        {...restLinkProps}
        onClick={onHashLinkClick}
        aria-disabled={isDisabled || undefined}
      >
        {buttonContent}
      </ButtonAnchorWrapper>
    );
  }

  if (href) {
    const onRouteLinkClick: LinkClickHandler = (event) => {
      if (isDisabled) {
        event.preventDefault();
        return;
      }

      onLinkClick?.(event);

      if (event.defaultPrevented) {
        return;
      }

      if (!shouldTrackRouteLoading(href, target) || isModifiedClickEvent(event)) {
        return;
      }

      if (isSameRoute(href, window.location.href)) {
        return;
      }

      startRouteLoadingState();
    };

    return (
      <ButtonLinkWrapper
        $frost={frost}
        $size={size}
        $variant={variant}
        $width={width}
        $isLoading={isButtonLoading}
        href={href}
        scroll={shouldDisableAutoScroll ? false : undefined}
        rel={linkRel}
        target={target}
        {...restLinkProps}
        onClick={onRouteLinkClick}
        aria-busy={isButtonLoading || undefined}
        aria-disabled={isDisabled || isButtonLoading || undefined}
      >
        {buttonContent}
      </ButtonLinkWrapper>
    );
  }

  return (
    <StyledButton
      $frost={frost}
      $variant={variant}
      $width={width}
      $size={size}
      $isLoading={isButtonLoading}
      {...buttonProps}
      disabled={buttonProps.disabled || isButtonLoading}
      aria-busy={isButtonLoading || undefined}
      type={buttonProps.type ?? DEFAULT_BUTTON_TYPE}
    >
      {buttonContent}
    </StyledButton>
  );
}
