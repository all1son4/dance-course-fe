"use client";

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ElementType,
  MouseEvent as ReactMouseEvent,
  ReactNode,
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

type LinkClickHandler = NonNullable<AnchorHTMLAttributes<HTMLAnchorElement>["onClick"]>;

type CreateHashLinkClickHandlerOptions = {
  href: string;
  isDisabled: boolean | undefined;
  onLinkClick: AnchorHTMLAttributes<HTMLAnchorElement>["onClick"];
};

const NAVIGATION_SPINNER_DELAY_MS = 135;
const NAVIGATION_SPINNER_FAILSAFE_MS = 10_000;
const SELF_TARGET = "_self";
const BLANK_TARGET = "_blank";
const HASH_PREFIX = "#";
const DEFAULT_EXTERNAL_REL = "noopener noreferrer";
const DEFAULT_BUTTON_TYPE = "button";
const PAGE_HIDE_EVENT = "pagehide";

// Hash is intentionally omitted because in-document navigation does not wait
// for a route transition to settle.
const getRouteKey = (pathname: string, search: string): string => `${pathname}${search}`;

const isInternalNavigationHref = (value: string): boolean => {
  if (!value || value.startsWith(HASH_PREFIX) || value.startsWith("//")) {
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

const isModifiedClickEvent = (event: ReactMouseEvent<HTMLAnchorElement>): boolean =>
  event.defaultPrevented ||
  event.button !== 0 ||
  event.metaKey ||
  event.ctrlKey ||
  event.shiftKey ||
  event.altKey;

const getLinkRel = (
  target: string,
  relFromProps: string | undefined,
): string | undefined =>
  target === BLANK_TARGET ? (relFromProps ?? DEFAULT_EXTERNAL_REL) : relFromProps;

const shouldSkipRouteLoadingForHref = (href: string): boolean => {
  try {
    const targetUrl = new URL(href, window.location.href);
    const targetRouteKey = getRouteKey(targetUrl.pathname, targetUrl.search);
    const currentRouteKey = getRouteKey(window.location.pathname, window.location.search);

    return targetRouteKey === currentRouteKey;
  } catch {
    return true;
  }
};

const createHashLinkClickHandler = ({
  href,
  isDisabled,
  onLinkClick,
}: CreateHashLinkClickHandlerOptions): LinkClickHandler => {
  return (event) => {
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

    const nextHash = `${HASH_PREFIX}${hashTargetId}`;
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  };
};

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
  href = "",
  target = SELF_TARGET,
  isLoading = false,
  children,
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
  const linkRel = getLinkRel(target, relFromProps);
  const shouldDisableAutoScroll = href.includes(HASH_PREFIX) && target === SELF_TARGET;
  const shouldTrackRouteLoading = useMemo(
    () => target === SELF_TARGET && isInternalNavigationHref(href),
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
    window.removeEventListener(PAGE_HIDE_EVENT, onNavigationSettled);
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
    window.addEventListener(PAGE_HIDE_EVENT, onNavigationSettled, {
      once: true,
    });
  }, [clearRouteLoadingTimers, onNavigationSettled, stopRouteLoadingState]);

  useEffect(
    () => () => {
      stopRouteLoadingState();
    },
    [stopRouteLoadingState],
  );

  const buttonContent = renderButtonContent(children ?? buttonText, isButtonLoading);

  if (href && href.startsWith(HASH_PREFIX) && target === SELF_TARGET) {
    const onHashLinkClick = createHashLinkClickHandler({
      href,
      isDisabled,
      onLinkClick,
    });

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
    const onRouteLinkClick: LinkClickHandler = (event) => {
      if (isDisabled) {
        event.preventDefault();
        return;
      }

      onLinkClick?.(event);

      if (event.defaultPrevented) {
        return;
      }

      if (!shouldTrackRouteLoading || isModifiedClickEvent(event)) {
        return;
      }

      if (shouldSkipRouteLoadingForHref(href)) {
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
      type={buttonProps.type ?? DEFAULT_BUTTON_TYPE}
    >
      {buttonContent}
    </StyledButton>
  );
}
