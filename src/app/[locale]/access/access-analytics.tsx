"use client";

import { useEffect, useRef } from "react";

import { useCookieConsent } from "@/components/common/CookieConsent";
import {
  type AnalyticsEventProperties,
  trackAnalyticsEvent,
} from "@/lib/mixpanel-analytics";

export default function AccessAnalytics({
  properties,
}: {
  properties: AnalyticsEventProperties["my_access_viewed"];
}) {
  const { canUseAnalytics } = useCookieConsent();
  const lastTrackedRef = useRef<string | null>(null);

  useEffect(() => {
    const key = JSON.stringify(properties);
    if (!canUseAnalytics || lastTrackedRef.current === key) return;

    lastTrackedRef.current = key;
    void trackAnalyticsEvent("my_access_viewed", properties);
  }, [canUseAnalytics, properties]);

  return null;
}
