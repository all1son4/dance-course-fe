"use client";

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ElementType,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ensureLocationChangeEvents, LOCATION_CHANGE_EVENT } from "@/lib/location-change";
import { NAVIGATION_PROGRESS_START_EVENT } from "@/lib/navigation-events";
import { getHashTargetFromHref, scrollToHashTarget } from "@/lib/scroll";

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

const NAVIGATION_SPINNER_DELAY_MS = 135;
const NAVIGATION_SPINNER_FAILSAFE_MS = 10_000;
const getRouteKey = (pathname: string, search: string) => `${pathname}${search}`;

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
  isLoading = false,
  ...rest
}: ButtonProps<T>) {
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
  const isButtonLoading = isLoading || isRouteLoading;

  const clearRouteLoadingTimers = useCallback(() => {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    if (failSafeTimerRef.current !== null) {
      window.clearTimeout(failSafeTimerRef.current);
      failSafeTimerRef.current = null;
    }
  }, []);

  const finishRouteLoadingState = useCallback(() => {
    clearRouteLoadingTimers();
    setIsRouteLoading(false);
  }, [clearRouteLoadingTimers]);

  const onNavigationSettled = useCallback(() => {
    finishRouteLoadingState();
  }, [finishRouteLoadingState]);

  const clearNavigationCompleteListeners = useCallback(() => {
    window.removeEventListener(LOCATION_CHANGE_EVENT, onNavigationSettled);
    window.removeEventListener("pagehide", onNavigationSettled);
  }, [onNavigationSettled]);

  const stopRouteLoadingState = useCallback(() => {
    clearNavigationCompleteListeners();
    finishRouteLoadingState();
  }, [clearNavigationCompleteListeners, finishRouteLoadingState]);

  const startRouteLoadingState = useCallback(() => {
    window.dispatchEvent(new Event(NAVIGATION_PROGRESS_START_EVENT));
    ensureLocationChangeEvents();

    clearRouteLoadingTimers();

    revealTimerRef.current = window.setTimeout(() => {
      setIsRouteLoading(true);
    }, NAVIGATION_SPINNER_DELAY_MS);

    failSafeTimerRef.current = window.setTimeout(() => {
      stopRouteLoadingState();
    }, NAVIGATION_SPINNER_FAILSAFE_MS);

    window.addEventListener(LOCATION_CHANGE_EVENT, onNavigationSettled, {
      once: true,
    });
    window.addEventListener("pagehide", onNavigationSettled, { once: true });
  }, [clearRouteLoadingTimers, onNavigationSettled, stopRouteLoadingState]);

  useEffect(
    () => () => {
      stopRouteLoadingState();
    },
    [stopRouteLoadingState],
  );

  const buttonContent = (
    <ButtonContent>
      <ButtonLabel>{buttonText}</ButtonLabel>
      <ButtonSpinnerSlot $isLoading={isButtonLoading}>
        <ButtonSpinner aria-hidden $isLoading={isButtonLoading} />
      </ButtonSpinnerSlot>
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

      if (event.defaultPrevented) {
        return;
      }

      if (
        !shouldTrackRouteLoading ||
        isModifiedClickEvent(event as ReactMouseEvent<HTMLAnchorElement>)
      ) {
        return;
      }

      try {
        const targetUrl = new URL(href, window.location.href);
        const targetRouteKey = getRouteKey(targetUrl.pathname, targetUrl.search);
        const currentRouteKey = getRouteKey(
          window.location.pathname,
          window.location.search,
        );

        if (targetRouteKey === currentRouteKey) {
          return;
        }
      } catch {
        return;
      }

      startRouteLoadingState();
    };

    return (
      <ButtonLinkWrapper
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
      $variant={variant}
      $width={width}
      $size={size}
      $isLoading={isButtonLoading}
      {...buttonProps}
      disabled={buttonProps.disabled || isButtonLoading}
      aria-busy={isButtonLoading || undefined}
      type={buttonProps.type ?? "button"}
    >
      {buttonContent}
    </StyledButton>
  );
}
