"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import styled, { css, keyframes } from "styled-components";

import { ensureLocationChangeEvents, LOCATION_CHANGE_EVENT } from "@/lib/location-change";
import {
  NAVIGATION_PROGRESS_COMPLETE_EVENT,
  NAVIGATION_PROGRESS_START_EVENT,
} from "@/lib/navigation-events";

const PROGRESS_START = 0.06;
const PROGRESS_IDLE_CAP = 0.86;
const PROGRESS_MAX_BEFORE_SETTLE = 0.9;
const PROGRESS_TICK_MS = 120;
const COMPLETE_HIDE_DELAY_MS = 220;
const FAILSAFE_COMPLETE_MS = 20_000;
const NETWORK_QUIET_COMPLETE_DELAY_MS = 120;
const MIN_NAVIGATION_PROGRESS_MS = 420;
const IDLE_PHASE_ONE_MS = 600;
const IDLE_PHASE_TWO_MS = 2_400;
const IDLE_PHASE_THREE_MS = 7_000;
const IDLE_PHASE_ONE_PROGRESS_GAIN = 0.08;
const IDLE_PHASE_TWO_PROGRESS_START = 0.14;
const IDLE_PHASE_TWO_PROGRESS_GAIN = 0.32;
const IDLE_PHASE_THREE_PROGRESS_START = 0.46;
const IDLE_PHASE_THREE_PROGRESS_GAIN = 0.3;
const IDLE_LONG_TAIL_TIME_CONSTANT_MS = 10_000;
const IDLE_LONG_TAIL_PROGRESS_START = 0.76;
const IDLE_LONG_TAIL_PROGRESS_GAIN = 0.1;
const NETWORK_PROGRESS_START = 0.2;
const NETWORK_PROGRESS_GAIN = 0.68;
const SETTLED_PROGRESS_WITH_ACTIVE_REQUESTS = 0.96;
const PROGRESS_CATCH_UP_FACTOR = 0.24;
const PROGRESS_MIN_TICK_ADVANCE = 0.006;

const progressSheen = keyframes`
  from {
    transform: translateX(-120%);
  }

  to {
    transform: translateX(240%);
  }
`;

const ProgressWrap = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 1.5px;
  z-index: 9999;
  pointer-events: none;
`;

const ProgressBar = styled.span<{
  $isActive: boolean;
  $isVisible: boolean;
  $progress: number;
}>`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: ${({ $progress }) => `${Math.max(0, Math.min(1, $progress)) * 100}%`};
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  background: rgba(124, 0, 2, 1);
  box-shadow: 0 0 10px rgba(124, 0, 2, 0.28);
  transform-origin: left center;
  overflow: hidden;
  transition:
    width var(--motion-base, 220ms) var(--ease-emphasized, ease),
    opacity var(--motion-fast, 160ms) var(--ease-standard, ease);

  &::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 46px;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0.42) 50%,
      rgba(255, 255, 255, 0) 100%
    );
    opacity: 0;
    pointer-events: none;
    transform: translateX(-120%);
    ${({ $isActive }) =>
      $isActive &&
      css`
        opacity: 0.85;
        animation: ${progressSheen} 1.25s linear infinite;
      `}
  }
`;

const isTrackableAnchorClick = (event: MouseEvent): boolean => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }

  const targetElement = event.target as Element | null;
  const anchor = targetElement?.closest("a[href]") as HTMLAnchorElement | null;

  if (!anchor) {
    return false;
  }

  const targetAttr = (anchor.getAttribute("target") ?? "").trim();

  if (targetAttr && targetAttr !== "_self") {
    return false;
  }

  const href = anchor.getAttribute("href")?.trim() ?? "";

  if (
    !href ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  ) {
    return false;
  }

  try {
    const url = new URL(anchor.href, window.location.href);
    const isSameOrigin = url.origin === window.location.origin;

    if (!isSameOrigin) {
      return false;
    }

    const isHashOnlyNavigation =
      url.pathname === window.location.pathname &&
      url.search === window.location.search &&
      Boolean(url.hash);

    return !isHashOnlyNavigation;
  } catch {
    return false;
  }
};

const shouldTrackNetworkRequest = (rawUrl: string): boolean => {
  if (!rawUrl) {
    return false;
  }

  try {
    const resolvedUrl = new URL(rawUrl, window.location.href);

    if (resolvedUrl.origin !== window.location.origin) {
      return false;
    }

    if (resolvedUrl.protocol !== "http:" && resolvedUrl.protocol !== "https:") {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

type TrackedXMLHttpRequest = XMLHttpRequest & {
  __navigationProgressTracked?: boolean;
  __navigationProgressUrl?: string;
};

type XHROpen = (
  this: XMLHttpRequest,
  method: string,
  url: string | URL,
  async?: boolean,
  username?: string | null,
  password?: string | null,
) => void;

const getIdleProgressTarget = (elapsedMs: number): number => {
  if (elapsedMs <= IDLE_PHASE_ONE_MS) {
    const phaseProgress = elapsedMs / IDLE_PHASE_ONE_MS;

    return PROGRESS_START + phaseProgress * IDLE_PHASE_ONE_PROGRESS_GAIN;
  }

  if (elapsedMs <= IDLE_PHASE_TWO_MS) {
    const phaseProgress =
      (elapsedMs - IDLE_PHASE_ONE_MS) / (IDLE_PHASE_TWO_MS - IDLE_PHASE_ONE_MS);

    return IDLE_PHASE_TWO_PROGRESS_START + phaseProgress * IDLE_PHASE_TWO_PROGRESS_GAIN;
  }

  if (elapsedMs <= IDLE_PHASE_THREE_MS) {
    const phaseProgress =
      (elapsedMs - IDLE_PHASE_TWO_MS) / (IDLE_PHASE_THREE_MS - IDLE_PHASE_TWO_MS);

    return (
      IDLE_PHASE_THREE_PROGRESS_START + phaseProgress * IDLE_PHASE_THREE_PROGRESS_GAIN
    );
  }

  const longTailProgress =
    1 - Math.exp(-(elapsedMs - IDLE_PHASE_THREE_MS) / IDLE_LONG_TAIL_TIME_CONSTANT_MS);

  return Math.min(
    PROGRESS_IDLE_CAP,
    IDLE_LONG_TAIL_PROGRESS_START + longTailProgress * IDLE_LONG_TAIL_PROGRESS_GAIN,
  );
};

const getNetworkProgressTarget = (
  completedRequestCount: number,
  observedRequestCount: number,
): number => {
  const completionRatio = Math.min(1, completedRequestCount / observedRequestCount);

  return Math.min(
    PROGRESS_MAX_BEFORE_SETTLE,
    NETWORK_PROGRESS_START + completionRatio * NETWORK_PROGRESS_GAIN,
  );
};

const advanceProgressTowardsTarget = (
  currentProgress: number,
  targetProgress: number,
): number =>
  Math.min(
    targetProgress,
    currentProgress +
      (targetProgress - currentProgress) * PROGRESS_CATCH_UP_FACTOR +
      PROGRESS_MIN_TICK_ADVANCE,
  );

const getFetchRequestUrl = (input: Parameters<Window["fetch"]>[0]): string =>
  typeof input === "string" || input instanceof URL ? input.toString() : input.url;

export default function NavigationProgress() {
  const pathname = usePathname();
  const [searchKey, setSearchKey] = useState("");
  const routeKey = `${pathname}?${searchKey}`;
  const hasMountedRef = useRef(false);
  const progressTickRef = useRef<number | null>(null);
  const failSafeRef = useRef<number | null>(null);
  const hideRef = useRef<number | null>(null);
  const completeDelayRef = useRef<number | null>(null);
  const navigationStartedAtRef = useRef(0);
  const isNavigatingRef = useRef(false);
  const hasSettledRouteRef = useRef(false);
  const hasTrackedNetworkRef = useRef(false);
  const inFlightRequestsRef = useRef(0);
  const observedRequestCountRef = useRef(0);
  const completedRequestCountRef = useRef(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [progress, setProgress] = useState(0);

  const clearTimers = useCallback(() => {
    if (progressTickRef.current !== null) {
      window.clearInterval(progressTickRef.current);
      progressTickRef.current = null;
    }

    if (failSafeRef.current !== null) {
      window.clearTimeout(failSafeRef.current);
      failSafeRef.current = null;
    }

    if (hideRef.current !== null) {
      window.clearTimeout(hideRef.current);
      hideRef.current = null;
    }

    if (completeDelayRef.current !== null) {
      window.clearTimeout(completeDelayRef.current);
      completeDelayRef.current = null;
    }
  }, []);

  const completeProgress = useCallback(() => {
    if (!isVisible && !isNavigatingRef.current) {
      return;
    }

    clearTimers();
    isNavigatingRef.current = false;
    hasSettledRouteRef.current = false;
    hasTrackedNetworkRef.current = false;
    inFlightRequestsRef.current = 0;
    observedRequestCountRef.current = 0;
    completedRequestCountRef.current = 0;
    setProgress(1);
    setIsActive(false);
    window.dispatchEvent(new Event(NAVIGATION_PROGRESS_COMPLETE_EVENT));

    hideRef.current = window.setTimeout(() => {
      setIsVisible(false);
      setProgress(0);
    }, COMPLETE_HIDE_DELAY_MS);
  }, [clearTimers, isVisible]);

  const maybeCompleteWhenQuiet = useCallback(() => {
    if (!isNavigatingRef.current || !hasSettledRouteRef.current) {
      return;
    }

    if (inFlightRequestsRef.current > 0) {
      return;
    }

    if (completeDelayRef.current !== null) {
      window.clearTimeout(completeDelayRef.current);
    }

    const elapsedSinceStartMs = Math.max(0, Date.now() - navigationStartedAtRef.current);
    const minRemainingMs = Math.max(0, MIN_NAVIGATION_PROGRESS_MS - elapsedSinceStartMs);
    const completionDelayMs = Math.max(NETWORK_QUIET_COMPLETE_DELAY_MS, minRemainingMs);

    completeDelayRef.current = window.setTimeout(() => {
      completeProgress();
    }, completionDelayMs);
  }, [completeProgress]);

  const startProgress = useCallback(() => {
    if (isNavigatingRef.current) {
      return;
    }

    isNavigatingRef.current = true;
    hasSettledRouteRef.current = false;
    hasTrackedNetworkRef.current = false;
    inFlightRequestsRef.current = 0;
    observedRequestCountRef.current = 0;
    completedRequestCountRef.current = 0;
    navigationStartedAtRef.current = Date.now();

    setIsVisible(true);
    setIsActive(true);
    setProgress(PROGRESS_START);
    clearTimers();

    progressTickRef.current = window.setInterval(() => {
      setProgress((current) => {
        if (!isNavigatingRef.current) {
          return current;
        }

        const observed = observedRequestCountRef.current;
        const completed = completedRequestCountRef.current;
        const hasNetworkData = hasTrackedNetworkRef.current && observed > 0;
        const elapsedMs = Math.max(0, Date.now() - navigationStartedAtRef.current);
        const idleTarget = getIdleProgressTarget(elapsedMs);

        let target = idleTarget;

        if (hasNetworkData) {
          const networkTarget = getNetworkProgressTarget(completed, observed);
          target = Math.max(idleTarget, networkTarget);
        }

        if (hasSettledRouteRef.current) {
          target =
            inFlightRequestsRef.current > 0 ? SETTLED_PROGRESS_WITH_ACTIVE_REQUESTS : 1;
        }

        if (current >= target) {
          return current;
        }

        return advanceProgressTowardsTarget(current, target);
      });

      maybeCompleteWhenQuiet();
    }, PROGRESS_TICK_MS);

    failSafeRef.current = window.setTimeout(() => {
      completeProgress();
    }, FAILSAFE_COMPLETE_MS);
  }, [clearTimers, completeProgress, maybeCompleteWhenQuiet]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    ensureLocationChangeEvents();

    const syncSearchKey = () => {
      setSearchKey(window.location.search);
    };

    syncSearchKey();
    window.addEventListener(LOCATION_CHANGE_EVENT, syncSearchKey);

    return () => {
      window.removeEventListener(LOCATION_CHANGE_EVENT, syncSearchKey);
    };
  }, []);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!isTrackableAnchorClick(event)) {
        return;
      }

      startProgress();
    };

    const onStartEvent = () => {
      startProgress();
    };

    const onPopState = () => {
      startProgress();
    };

    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener(
      NAVIGATION_PROGRESS_START_EVENT,
      onStartEvent as EventListener,
    );
    window.addEventListener("popstate", onPopState);

    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener(
        NAVIGATION_PROGRESS_START_EVENT,
        onStartEvent as EventListener,
      );
      window.removeEventListener("popstate", onPopState);
      clearTimers();
    };
  }, [clearTimers, startProgress]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const xhrPrototype = window.XMLHttpRequest.prototype;
    const originalOpen = xhrPrototype.open as XHROpen;
    const originalSend = xhrPrototype.send;

    const registerRequestStart = (): void => {
      if (!isNavigatingRef.current) {
        return;
      }

      hasTrackedNetworkRef.current = true;
      observedRequestCountRef.current += 1;
      inFlightRequestsRef.current += 1;
    };

    const registerRequestEnd = (): void => {
      if (!hasTrackedNetworkRef.current) {
        return;
      }

      completedRequestCountRef.current += 1;
      inFlightRequestsRef.current = Math.max(0, inFlightRequestsRef.current - 1);
      maybeCompleteWhenQuiet();
    };

    window.fetch = (async (input, init) => {
      const rawUrl = getFetchRequestUrl(input);
      const shouldTrack = isNavigatingRef.current && shouldTrackNetworkRequest(rawUrl);

      if (shouldTrack) {
        registerRequestStart();
      }

      try {
        return await originalFetch(input, init);
      } finally {
        if (shouldTrack) {
          registerRequestEnd();
        }
      }
    }) as typeof window.fetch;

    xhrPrototype.open = function patchedOpen(
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ) {
      const xhr = this as TrackedXMLHttpRequest;
      xhr.__navigationProgressUrl = typeof url === "string" ? url : url.toString();
      xhr.__navigationProgressTracked = false;

      return originalOpen.call(
        xhr,
        method,
        url,
        async ?? true,
        username ?? undefined,
        password ?? undefined,
      );
    };

    xhrPrototype.send = function patchedSend(body) {
      const xhr = this as TrackedXMLHttpRequest;
      const shouldTrack =
        isNavigatingRef.current &&
        shouldTrackNetworkRequest(xhr.__navigationProgressUrl ?? "");

      if (shouldTrack) {
        xhr.__navigationProgressTracked = true;
        registerRequestStart();

        const onLoadEnd = () => {
          if (!xhr.__navigationProgressTracked) {
            return;
          }

          xhr.__navigationProgressTracked = false;
          registerRequestEnd();
        };

        xhr.addEventListener("loadend", onLoadEnd, { once: true });
      }

      return originalSend.call(this, body);
    };

    return () => {
      // Restoring every captured API together prevents a remount from stacking
      // multiple network trackers on the global implementations.
      window.fetch = originalFetch;
      xhrPrototype.open = originalOpen;
      xhrPrototype.send = originalSend;
    };
  }, [maybeCompleteWhenQuiet]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (!isNavigatingRef.current) {
      return;
    }

    hasSettledRouteRef.current = true;
    maybeCompleteWhenQuiet();
  }, [maybeCompleteWhenQuiet, routeKey]);

  return (
    <ProgressWrap aria-hidden>
      <ProgressBar $isActive={isActive} $isVisible={isVisible} $progress={progress} />
    </ProgressWrap>
  );
}
