"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useCookieConsent } from "@/components/common/CookieConsent";
import { usePathname } from "@/i18n/navigation";
import {
  applyBirthdayPopupSignal,
  BIRTHDAY_POPUP_CONSENT_SETTLE_MS,
  BIRTHDAY_POPUP_DWELL_MS,
  BIRTHDAY_POPUP_ENABLED,
  BIRTHDAY_POPUP_SAME_VIEW_GAP_MS,
  BIRTHDAY_POPUP_STORAGE_KEY,
  getBirthdayPopupState,
  saveBirthdayPopupState,
  shouldShowBirthdayPopup,
  syncBirthdayPopupStorage,
} from "@/lib/birthday-popup";

import { EXCLUDED_PATH_PREFIXES } from "./BirthdayPopup.constants";

/**
 * Time spent on the site rather than on the page: the module is evaluated once
 * per page load and survives client-side navigation, so a visitor who moves
 * between sections quickly still reaches the dwell threshold.
 */
const siteEntryAt = Date.now();

// Loaded on first use only. A static `import { track }` here would put the
// whole @vercel/analytics module into the shared chunk of every page, which
// defeats the deferred, consent-gated <Analytics /> mount elsewhere.
const trackBirthdayEvent = (event: string) => {
  void import("@vercel/analytics")
    .then(({ track }) => track(event))
    .catch(() => {
      // Analytics is best-effort; never let it surface to the user.
    });
};

/**
 * Scoped to one page view: it stops the card from reappearing as the visitor
 * moves between routes. A reload resets the module, which is exactly what lets
 * an untouched popup come back.
 */
let lastShownAt: number | null = null;

const wasShownInThisPageView = () =>
  lastShownAt !== null && Date.now() - lastShownAt < BIRTHDAY_POPUP_SAME_VIEW_GAP_MS;

const isExcludedPath = (pathname: string) =>
  EXCLUDED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

/** Radix marks open dialog content with data-state, plain panels never do. */
const isDialogOpen = () =>
  document.querySelector('[role="dialog"][data-state="open"]') !== null;

type BirthdayPopupSignal = "dismissed" | "clicked";

/**
 * Everything the birthday card knows about itself: when it may appear, what
 * each reaction records, and when it leaves the screen. The component that uses
 * it only renders.
 */
export const useBirthdayPopup = () => {
  const pathname = usePathname();
  const {
    canUseAnalytics,
    canUseFunctionalStorage,
    consent,
    isBannerVisible,
    isReady,
    isSettingsOpen,
  } = useCookieConsent();
  const [isVisible, setIsVisible] = useState(false);
  const hasRecordedAppearanceRef = useRef(false);
  const hasWaitedForConsentRef = useRef(false);
  const navigatedFromRef = useRef<string | null>(null);

  const isConsentAnswered =
    isReady && consent !== null && !isBannerVisible && !isSettingsOpen;

  // Remembered so the settle delay applies only when the consent banner really
  // occupied the corner during this visit.
  useEffect(() => {
    if (isBannerVisible || isSettingsOpen) {
      hasWaitedForConsentRef.current = true;
    }
  }, [isBannerVisible, isSettingsOpen]);

  useEffect(() => {
    if (!isReady || consent === null) {
      return;
    }

    syncBirthdayPopupStorage(canUseFunctionalStorage);
  }, [canUseFunctionalStorage, consent, isReady]);

  useEffect(() => {
    if (!BIRTHDAY_POPUP_ENABLED || isVisible) {
      return;
    }

    if (!isConsentAnswered || isExcludedPath(pathname) || wasShownInThisPageView()) {
      return;
    }

    if (!shouldShowBirthdayPopup(getBirthdayPopupState(), new Date())) {
      return;
    }

    const dwellRemainingMs = Math.max(
      0,
      BIRTHDAY_POPUP_DWELL_MS - (Date.now() - siteEntryAt),
    );
    // The consent banner has just left the bottom corner; sliding into the freed
    // space in the same instant reads as a jump cut.
    const settleMs = hasWaitedForConsentRef.current
      ? BIRTHDAY_POPUP_CONSENT_SETTLE_MS
      : 0;
    const timer = window.setTimeout(
      () => {
        if (isDialogOpen()) {
          return;
        }

        setIsVisible(true);
      },
      Math.max(dwellRemainingMs, settleMs),
    );

    return () => window.clearTimeout(timer);
  }, [isConsentAnswered, isVisible, pathname]);

  useEffect(() => {
    if (!isVisible || hasRecordedAppearanceRef.current) {
      return;
    }

    hasRecordedAppearanceRef.current = true;
    lastShownAt = Date.now();
    saveBirthdayPopupState(
      applyBirthdayPopupSignal(getBirthdayPopupState(), "seen", new Date()),
      canUseFunctionalStorage,
    );

    if (canUseAnalytics) {
      trackBirthdayEvent("birthday_popup_shown");
    }
  }, [canUseAnalytics, canUseFunctionalStorage, isVisible]);

  const recordSignal = useCallback(
    (signal: BirthdayPopupSignal) => {
      saveBirthdayPopupState(
        applyBirthdayPopupSignal(getBirthdayPopupState(), signal, new Date()),
        canUseFunctionalStorage,
      );

      if (canUseAnalytics) {
        trackBirthdayEvent(
          signal === "clicked" ? "birthday_popup_clicked" : "birthday_popup_dismissed",
        );
      }
    },
    [canUseAnalytics, canUseFunctionalStorage],
  );

  const dismiss = useCallback(() => {
    setIsVisible(false);
    recordSignal("dismissed");
  }, [recordSignal]);

  // The call to action keeps the popup on screen so the button can run its own
  // navigation spinner; the card leaves only once the route has actually changed.
  const onCallToActionClick = useCallback(() => {
    navigatedFromRef.current = pathname;
    recordSignal("clicked");
  }, [pathname, recordSignal]);

  // Shared layouts survive client navigation. Close an already-visible card
  // when the visitor reaches a route where the popup itself is not allowed.
  useEffect(() => {
    const hasCompletedCallToActionNavigation =
      navigatedFromRef.current !== null && navigatedFromRef.current !== pathname;

    if (!hasCompletedCallToActionNavigation && !isExcludedPath(pathname)) {
      return;
    }

    navigatedFromRef.current = null;
    setIsVisible(false);
  }, [pathname]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismiss, isVisible]);

  /**
   * Dismissing in one tab should close the popup in the others too. Only the
   * storage event is used: it fires in other tabs but never in the one that
   * wrote the value, so this tab keeps control of its own card - the call to
   * action, for instance, records the click long before the popup goes away.
   */
  useEffect(() => {
    const syncWithStoredState = (event: StorageEvent) => {
      if (event.key !== BIRTHDAY_POPUP_STORAGE_KEY) {
        return;
      }

      if (!shouldShowBirthdayPopup(getBirthdayPopupState(), new Date())) {
        setIsVisible(false);
      }
    };

    window.addEventListener("storage", syncWithStoredState);

    return () => window.removeEventListener("storage", syncWithStoredState);
  }, []);

  return { dismiss, isVisible, onCallToActionClick };
};
