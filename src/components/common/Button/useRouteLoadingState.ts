"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ensureLocationChangeEvents, LOCATION_CHANGE_EVENT } from "@/lib/location-change";
import { NAVIGATION_PROGRESS_START_EVENT } from "@/lib/navigation-events";

const NAVIGATION_SPINNER_DELAY_MS = 135;
const NAVIGATION_SPINNER_FAILSAFE_MS = 10_000;
const PAGE_HIDE_EVENT = "pagehide";

/**
 * The "this link is loading" state of a route link: the spinner appears after a
 * short delay (so fast navigations never flash it), the progress bar is kicked
 * off immediately, and everything is cleared once the location changes, the
 * page hides, the fail-safe elapses or the component unmounts.
 */
export const useRouteLoadingState = () => {
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const revealTimerRef = useRef<number | null>(null);
  const failSafeTimerRef = useRef<number | null>(null);

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

  return { isRouteLoading, startRouteLoadingState };
};
