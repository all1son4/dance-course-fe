"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const ConsentAwareAnalytics = dynamic(() => import("./ConsentAwareAnalytics"), {
  ssr: false,
});
const NavigationProgress = dynamic(() => import("./NavigationProgress"), {
  ssr: false,
});
const CheckoutDraftLifecycle = dynamic(() => import("./CheckoutDraftLifecycle"), {
  ssr: false,
});

const DEFERRED_FEATURES_FALLBACK_DELAY_MS = 320;
const DEFERRED_FEATURES_IDLE_TIMEOUT_MS = 1200;

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export default function DeferredClientFeatures() {
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
        { timeout: DEFERRED_FEATURES_IDLE_TIMEOUT_MS },
      );

      return () => {
        idleWindow.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = window.setTimeout(() => {
      setIsDeferredMounted(true);
    }, DEFERRED_FEATURES_FALLBACK_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!isDeferredMounted) {
    return null;
  }

  return (
    <>
      <ConsentAwareAnalytics />
      <NavigationProgress />
      <CheckoutDraftLifecycle />
    </>
  );
}
