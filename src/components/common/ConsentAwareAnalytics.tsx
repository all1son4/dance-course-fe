"use client";

import { Analytics } from "@vercel/analytics/next";
import { useEffect } from "react";

import { disableVercelAnalytics } from "@/lib/cookie-consent";

import { useCookieConsent } from "./CookieConsent";

export default function ConsentAwareAnalytics() {
  const { canUseAnalytics, isReady } = useCookieConsent();
  const isProduction = process.env.NODE_ENV === "production";

  useEffect(() => {
    if (!isReady || canUseAnalytics) {
      return;
    }

    disableVercelAnalytics();
  }, [canUseAnalytics, isReady]);

  if (!isProduction || !isReady || !canUseAnalytics) {
    return null;
  }

  return <Analytics />;
}
