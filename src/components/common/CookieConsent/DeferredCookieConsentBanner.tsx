"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const CookieConsentBanner = dynamic(() => import("./CookieConsentBanner"), {
  ssr: false,
});

const BANNER_FALLBACK_DELAY_MS = 180;
const BANNER_IDLE_TIMEOUT_MS = 900;

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export default function DeferredCookieConsentBanner() {
  const [isDeferredMounted, setIsDeferredMounted] = useState(false);

  useEffect(() => {
    const idleWindow = window as IdleWindow;

    if (
      typeof idleWindow.requestIdleCallback === "function" &&
      typeof idleWindow.cancelIdleCallback === "function"
    ) {
      const idleId = idleWindow.requestIdleCallback(
        () => {
          setIsDeferredMounted(true);
        },
        { timeout: BANNER_IDLE_TIMEOUT_MS },
      );

      return () => {
        idleWindow.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = window.setTimeout(() => {
      setIsDeferredMounted(true);
    }, BANNER_FALLBACK_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!isDeferredMounted) {
    return null;
  }

  return <CookieConsentBanner />;
}
