"use client";

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ElementType,
  ReactNode,
} from "react";

import { useCookieConsent } from "@/components/common/CookieConsent";
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
  getSafeDestinationProperties,
  trackAnalyticsEvent,
} from "@/lib/mixpanel-analytics";

import {
  ButtonAnchorWrapper,
  ButtonContent,
  ButtonLabel,
  ButtonLinkWrapper,
  ButtonSpinner,
  StyledButton,
} from "./Button.styles";
import type { ButtonProps, ButtonSize } from "./Button.types";
import { useHashLinkClick } from "./useHashLinkClick";
import { useMeaningfulImpression } from "./useMeaningfulImpression";
import { useRouteLoadingState } from "./useRouteLoadingState";

type LinkClickHandler = NonNullable<AnchorHTMLAttributes<HTMLAnchorElement>["onClick"]>;

const DEFAULT_BUTTON_TYPE = "button";

const renderButtonContent = (
  content: ReactNode,
  isButtonLoading: boolean,
  size: ButtonSize,
) => (
  <ButtonContent>
    <ButtonLabel>{content}</ButtonLabel>
    <ButtonSpinner aria-hidden $isLoading={isButtonLoading} $size={size} />
  </ButtonContent>
);

export default function Button<T extends ElementType = "button">({
  variant = "primary",
  width = "100%",
  buttonText = "",
  size = "lg",
  frost = "static",
  href = "",
  prefetch,
  target = SELF_TARGET,
  isLoading = false,
  analytics,
  children,
  ...rest
}: ButtonProps<T>) {
  const { canUseAnalytics, isReady: isCookieConsentReady } = useCookieConsent();
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
  const getSemanticEventProperties = () => {
    if (!analytics) {
      return null;
    }

    const { id, placement, ...commerceProperties } = analytics;

    return {
      cta_id: id,
      ...(placement ? { placement } : {}),
      ...commerceProperties,
      ...getSafeDestinationProperties(href),
    };
  };
  const analyticsImpressionKey = analytics
    ? JSON.stringify([
        analytics.id,
        analytics.placement,
        analytics.currency,
        analytics.is_renewal,
        analytics.offer_code,
        analytics.offer_id,
        analytics.product_code,
        analytics.product_id,
        analytics.value,
        href,
      ])
    : "";
  const impressionTargetRef = useMeaningfulImpression({
    enabled:
      Boolean(analytics) &&
      isCookieConsentReady &&
      canUseAnalytics &&
      !isDisabled &&
      !isButtonLoading,
    impressionKey: analyticsImpressionKey,
    onImpression: () => {
      const properties = getSemanticEventProperties();

      if (properties) {
        void trackAnalyticsEvent("cta_impression", properties);
      }
    },
  });
  const trackSemanticClick = () => {
    const properties = getSemanticEventProperties();

    if (properties) {
      void trackAnalyticsEvent("cta_clicked", properties);
    }
  };
  const handleLinkClick: LinkClickHandler = (event) => {
    onLinkClick?.(event);

    if (!event.defaultPrevented) {
      trackSemanticClick();
    }
  };
  const onHashLinkClick = useHashLinkClick({
    href,
    isDisabled,
    onLinkClick: handleLinkClick,
  });

  const buttonContent = renderButtonContent(
    children ?? buttonText,
    isButtonLoading,
    size,
  );

  if (href && isInDocumentHashHref(href, target)) {
    return (
      <ButtonAnchorWrapper
        ref={impressionTargetRef}
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

      handleLinkClick(event);

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
        ref={impressionTargetRef}
        $frost={frost}
        $size={size}
        $variant={variant}
        $width={width}
        $isLoading={isButtonLoading}
        href={href}
        prefetch={prefetch}
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
      ref={impressionTargetRef}
      $frost={frost}
      $variant={variant}
      $width={width}
      $size={size}
      $isLoading={isButtonLoading}
      {...buttonProps}
      onClick={(event) => {
        buttonProps.onClick?.(event);

        if (!event.defaultPrevented) {
          trackSemanticClick();
        }
      }}
      disabled={buttonProps.disabled || isButtonLoading}
      aria-busy={isButtonLoading || undefined}
      type={buttonProps.type ?? DEFAULT_BUTTON_TYPE}
    >
      {buttonContent}
    </StyledButton>
  );
}
