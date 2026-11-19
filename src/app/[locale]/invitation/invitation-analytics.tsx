"use client";

import { useEffect, useRef } from "react";

import { useCookieConsent } from "@/components/common/CookieConsent";
import {
  type AnalyticsEventProperties,
  trackAnalyticsEvent,
} from "@/lib/mixpanel-analytics";

/** `invitation_viewed`, once per state, after the cookie choice allows it. */
export default function InvitationAnalytics({
  properties,
}: {
  properties: AnalyticsEventProperties["invitation_viewed"];
}) {
  const { canUseAnalytics } = useCookieConsent();
  const lastTrackedRef = useRef<string | null>(null);

  useEffect(() => {
    const key = JSON.stringify(properties);
    if (!canUseAnalytics || lastTrackedRef.current === key) return;

    lastTrackedRef.current = key;
    void trackAnalyticsEvent("invitation_viewed", properties);
  }, [canUseAnalytics, properties]);

  return null;
}
