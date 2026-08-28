"use client";

import { useEffect, useState } from "react";

/**
 * Showing is debounced so a quick scroll past a CTA (or through the short
 * stretch between two of them) does not flash the bar; hiding is immediate.
 */
const SHOW_DELAY_MS = 240;

const useDelayedShow = (shouldShow: boolean): boolean => {
  const [isShown, setIsShown] = useState(false);

  useEffect(() => {
    if (!shouldShow) {
      setIsShown(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setIsShown(true), SHOW_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [shouldShow]);

  return isShown;
};
import { createPortal } from "react-dom";

import Button from "@/components/common/Button";
import { useCookieConsent } from "@/components/common/CookieConsent";
import { shouldShowStickyCta, STICKY_CTA_DOCK_ID } from "@/lib/sticky-cta";

import {
  StickyCtaButtonSlot,
  StickyCtaCard,
  type StickyCtaMotion,
  StickyCtaMotionLayer,
  StickyCtaNote,
  StickyCtaText,
  StickyCtaTitle,
  StickyCtaViewport,
} from "./StickyCta.styles";
import type { StickyCtaProps } from "./StickyCta.types";
import { useStickyCtaVisibilityState } from "./useStickyCtaVisibilityState";

/**
 * A floating duplicate of a primary CTA that already exists on the page. Mark
 * the on-page button(s) with `stickyCtaAnchorProps`; this bar appears once the
 * reader has scrolled past one of them and none is visible, docks above the
 * footer instead of covering it (CSS sticky inside <main>, see
 * STICKY_CTA_DOCK_ID), and steps aside for the cookie banner and dialogs. It
 * renders through a portal so no page-level transform or filter can interfere
 * with its positioning.
 */
export default function StickyCta({
  analytics,
  href,
  label,
  note,
  onClick,
  title,
}: StickyCtaProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [hasEverShown, setHasEverShown] = useState(false);
  const { isBannerVisible } = useCookieConsent();
  const visibilityState = useStickyCtaVisibilityState();

  const isVisible = useDelayedShow(
    shouldShowStickyCta({
      ...visibilityState,
      isCookieBannerVisible: isBannerVisible,
    }),
  );
  // The exit keyframes must not play on mount, so the card starts "idle" and
  // only alternates enter/exit after its first appearance.
  const motion: StickyCtaMotion = isVisible ? "enter" : hasEverShown ? "exit" : "idle";

  useEffect(() => {
    if (isVisible) {
      setHasEverShown(true);
    }
  }, [isVisible]);

  useEffect(() => {
    setPortalTarget(document.getElementById(STICKY_CTA_DOCK_ID) ?? document.body);
  }, []);

  if (!portalTarget) {
    return null;
  }

  const hasText = Boolean(title || note);

  return createPortal(
    <StickyCtaViewport $isVisible={isVisible} aria-hidden={!isVisible} inert={!isVisible}>
      <StickyCtaMotionLayer $isVisible={isVisible} $motion={motion}>
        <StickyCtaCard role="region" aria-label={title ?? label}>
          {hasText && (
            <StickyCtaText>
              {title && <StickyCtaTitle>{title}</StickyCtaTitle>}
              {note && <StickyCtaNote>{note}</StickyCtaNote>}
            </StickyCtaText>
          )}
          <StickyCtaButtonSlot>
            {href ? (
              <Button
                buttonText={label}
                size="sm"
                width="auto"
                href={href}
                analytics={analytics}
              />
            ) : (
              <Button
                buttonText={label}
                size="sm"
                width="auto"
                type="button"
                onClick={onClick}
                analytics={analytics}
              />
            )}
          </StickyCtaButtonSlot>
        </StickyCtaCard>
      </StickyCtaMotionLayer>
    </StickyCtaViewport>,
    portalTarget,
  );
}
