"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useCallback, useEffect, useRef } from "react";

import {
  disableMixpanel,
  enableMixpanel,
  getInitialMixpanelAttributionProperties,
  getMixpanelAttributionProperties,
  getMixpanelPageProperties,
  getWebVitalAnalyticsProperties,
  isMixpanelConfigured,
  shouldRecordMixpanelLocation,
  shouldTrackMixpanelPath,
  stopLoadedMixpanelRecording,
  trackAnalyticsEvent,
} from "@/lib/mixpanel-analytics";

import { useCookieConsent } from "./CookieConsent";

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];
type WebVitalEventProperties = NonNullable<
  ReturnType<typeof getWebVitalAnalyticsProperties>
>;

export default function ConsentAwareAnalytics() {
  const { canUseAnalytics, consent, isReady } = useCookieConsent();
  const pathname = usePathname();
  const lastTrackedPathRef = useRef<string | null>(null);
  const pendingWebVitalsRef = useRef(new Map<string, WebVitalEventProperties>());
  const trackedWebVitalsRef = useRef(new Set<string>());
  const canUseAnalyticsRef = useRef(canUseAnalytics);
  const isProduction = process.env.NODE_ENV === "production";
  const reportWebVitals = useCallback<ReportWebVitalsCallback>((metric) => {
    const properties = getWebVitalAnalyticsProperties(metric);

    if (!properties) {
      return;
    }

    const metricKey = `${metric.id}:${properties.metric_name}`;

    if (trackedWebVitalsRef.current.has(metricKey)) {
      return;
    }

    if (!canUseAnalyticsRef.current) {
      pendingWebVitalsRef.current.set(metricKey, properties);
      return;
    }

    trackedWebVitalsRef.current.add(metricKey);
    void trackAnalyticsEvent("web_vital_measured", properties);
  }, []);

  useReportWebVitals(reportWebVitals);

  useEffect(() => {
    canUseAnalyticsRef.current = canUseAnalytics;
  }, [canUseAnalytics]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!canUseAnalytics) {
      // Keep only pre-choice measurements in volatile memory. An explicit
      // rejection or later revocation discards them without sending anything.
      if (consent) {
        pendingWebVitalsRef.current.clear();
      }
      return;
    }

    pendingWebVitalsRef.current.forEach((properties, metricKey) => {
      if (trackedWebVitalsRef.current.has(metricKey)) {
        return;
      }

      trackedWebVitalsRef.current.add(metricKey);
      void trackAnalyticsEvent("web_vital_measured", properties);
    });
    pendingWebVitalsRef.current.clear();
  }, [canUseAnalytics, consent, isReady]);

  useEffect(() => {
    if (!isProduction || !isReady || !isMixpanelConfigured()) {
      return;
    }

    if (!canUseAnalytics) {
      lastTrackedPathRef.current = null;
      void disableMixpanel();
      return;
    }

    if (!shouldTrackMixpanelPath(pathname)) {
      lastTrackedPathRef.current = null;
      void stopLoadedMixpanelRecording();
      return;
    }

    let isCancelled = false;

    void enableMixpanel().then((mixpanel) => {
      if (!mixpanel || isCancelled) {
        return;
      }

      try {
        if (shouldRecordMixpanelLocation(pathname, window.location.search)) {
          mixpanel.start_session_recording();
        } else {
          mixpanel.stop_session_recording();
        }

        if (lastTrackedPathRef.current === pathname) {
          return;
        }

        const localeHint =
          document.querySelector<HTMLElement>("main[lang]")?.lang ||
          document.documentElement.lang;
        const attributionProperties = getMixpanelAttributionProperties(
          window.location.search,
        );

        if (Object.keys(attributionProperties).length > 0) {
          mixpanel.register(attributionProperties);
          mixpanel.register_once(
            getInitialMixpanelAttributionProperties(attributionProperties),
          );
        }

        mixpanel.track_pageview(getMixpanelPageProperties(pathname, localeHint));
        lastTrackedPathRef.current = pathname;
      } catch (error) {
        console.error("Failed to run Mixpanel page analytics", error);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [canUseAnalytics, isProduction, isReady, pathname]);

  return null;
}
