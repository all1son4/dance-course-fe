"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const IMPRESSION_DWELL_MS = 600;
const IMPRESSION_VISIBILITY_THRESHOLD = 0.5;

type MeaningfulImpressionOptions = {
  enabled: boolean;
  impressionKey: string;
  onImpression: () => void;
};

/** Counts a CTA only after it remains meaningfully visible, once per mounted key. */
export const useMeaningfulImpression = ({
  enabled,
  impressionKey,
  onImpression,
}: MeaningfulImpressionOptions) => {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const lastTrackedKeyRef = useRef<string | null>(null);
  const onImpressionRef = useRef(onImpression);

  useEffect(() => {
    onImpressionRef.current = onImpression;
  }, [onImpression]);

  useEffect(() => {
    if (
      !enabled ||
      !impressionKey ||
      !target ||
      lastTrackedKeyRef.current === impressionKey ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    let dwellTimeoutId: number | null = null;
    const clearDwellTimeout = () => {
      if (dwellTimeoutId !== null) {
        window.clearTimeout(dwellTimeoutId);
        dwellTimeoutId = null;
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        const isMeaningfullyVisible =
          entry?.isIntersecting &&
          entry.intersectionRatio >= IMPRESSION_VISIBILITY_THRESHOLD;

        if (!isMeaningfullyVisible) {
          clearDwellTimeout();
          return;
        }

        if (dwellTimeoutId !== null) {
          return;
        }

        dwellTimeoutId = window.setTimeout(() => {
          lastTrackedKeyRef.current = impressionKey;
          onImpressionRef.current();
          observer.disconnect();
          dwellTimeoutId = null;
        }, IMPRESSION_DWELL_MS);
      },
      { threshold: [IMPRESSION_VISIBILITY_THRESHOLD] },
    );

    observer.observe(target);

    return () => {
      clearDwellTimeout();
      observer.disconnect();
    };
  }, [enabled, impressionKey, target]);

  return useCallback((node: HTMLElement | null) => {
    setTarget(node);
  }, []);
};
