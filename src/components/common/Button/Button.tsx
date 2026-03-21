"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ElementType,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { getHashTargetFromHref, scrollToHashTarget } from "@/lib/scroll";

import {
  ButtonAnchorWrapper,
  ButtonContent,
  ButtonLabel,
  ButtonLinkWrapper,
  ButtonSpinner,
  StyledButton,
} from "./Button.styles";
import type { ButtonProps } from "./Button.types";

const NAVIGATION_SPINNER_DELAY_MS = 140;
const NAVIGATION_SPINNER_FAILSAFE_MS = 10_000;

const isInternalNavigationHref = (value: string) => {
  if (!value || value.startsWith("#") || value.startsWith("//")) {
    return false;
  }

  if (/^(mailto|tel|sms|javascript):/i.test(value)) {
    return false;
  }

  return (
    value.startsWith("/") ||
    value.startsWith("?") ||
    value.startsWith("./") ||
    value.startsWith("../")
  );
};

const isModifiedClickEvent = (event: ReactMouseEvent<HTMLAnchorElement>) =>
  event.defaultPrevented ||
  event.button !== 0 ||
  event.metaKey ||
  event.ctrlKey ||
  event.shiftKey ||
  event.altKey;

export default function Button<T extends ElementType = "button">({
  variant = "primary",
  width = "100%",
  buttonText = "",
  size = "lg",
  href = "",
  target = "_self",
  ...rest
}: ButtonProps<T>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const revealTimerRef = useRef<number | null>(null);
  const failSafeTimerRef = useRef<number | null>(null);
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
  const linkRel =
    target === "_blank" ? (relFromProps ?? "noopener noreferrer") : relFromProps;
  const shouldDisableAutoScroll = href.includes("#") && target === "_self";
  const shouldTrackRouteLoading = useMemo(
    () => target === "_self" && isInternalNavigationHref(href),
    [href, target],
  );

  const clearRouteLoadingTimers = () => {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    if (failSafeTimerRef.current !== null) {
      window.clearTimeout(failSafeTimerRef.current);
      failSafeTimerRef.current = null;
    }
  };

  const startRouteLoadingState = () => {
    clearRouteLoadingTimers();

    revealTimerRef.current = window.setTimeout(() => {
      setIsRouteLoading(true);
    }, NAVIGATION_SPINNER_DELAY_MS);

    failSafeTimerRef.current = window.setTimeout(() => {
      setIsRouteLoading(false);
      clearRouteLoadingTimers();
    }, NAVIGATION_SPINNER_FAILSAFE_MS);
  };

  useEffect(() => {
    clearRouteLoadingTimers();
    const resetId = window.setTimeout(() => {
      setIsRouteLoading(false);
    }, 0);

    return () => {
      window.clearTimeout(resetId);
    };
  }, [pathname, searchParamsKey]);

  useEffect(
    () => () => {
      clearRouteLoadingTimers();
    },
    [],
  );

  const buttonContent = (
    <ButtonContent>
      <ButtonLabel>{buttonText}</ButtonLabel>
      <ButtonSpinner aria-hidden $isLoading={isRouteLoading} />
    </ButtonContent>
  );

  if (href && href.startsWith("#") && target === "_self") {
    const onHashLinkClick: AnchorHTMLAttributes<HTMLAnchorElement>["onClick"] = (
      event,
    ) => {
      if (isDisabled) {
        event.preventDefault();
        return;
      }

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
        aria-disabled={isDisabled || undefined}
      >
        {buttonContent}
      </ButtonAnchorWrapper>
    );
  }

  if (href) {
    const onRouteLinkClick: AnchorHTMLAttributes<HTMLAnchorElement>["onClick"] = (
      event,
    ) => {
      if (isDisabled) {
        event.preventDefault();
        return;
      }

      onLinkClick?.(event);

      if (
        !shouldTrackRouteLoading ||
        isModifiedClickEvent(event as ReactMouseEvent<HTMLAnchorElement>)
      ) {
        return;
      }

      startRouteLoadingState();
    };

    return (
      <ButtonLinkWrapper
        $size={size}
        $variant={variant}
        $width={width}
        $isLoading={isRouteLoading}
        href={href}
        scroll={shouldDisableAutoScroll ? false : undefined}
        rel={linkRel}
        target={target}
        {...restLinkProps}
        onClick={onRouteLinkClick}
        aria-busy={isRouteLoading || undefined}
        aria-disabled={isDisabled || undefined}
      >
        {buttonContent}
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
