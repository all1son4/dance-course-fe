"use client";

import { useEffect } from "react";

import { useCookieConsent } from "@/components/common/CookieConsent";
import { trackAnalyticsEvent } from "@/lib/mixpanel-analytics";

type FailedPageGuardProps = {
  currency?: "eur" | "pln";
  offerCode?: string;
  offerId?: string;
  productCode?: string;
  productId?: string;
  value?: number;
};

export default function FailedPageGuard({
  currency,
  offerCode,
  offerId,
  productCode,
  productId,
  value,
}: FailedPageGuardProps) {
  const { canUseAnalytics } = useCookieConsent();

  useEffect(() => {
    if (!canUseAnalytics) {
      return;
    }

    void trackAnalyticsEvent("payment_failed", {
      ...(currency ? { currency } : {}),
      failure_stage: "result_page",
      ...(offerCode ? { offer_code: offerCode } : {}),
      ...(offerId ? { offer_id: offerId } : {}),
      ...(productCode ? { product_code: productCode } : {}),
      ...(productId ? { product_id: productId } : {}),
      ...(typeof value === "number" ? { value } : {}),
    });
  }, [canUseAnalytics, currency, offerCode, offerId, productCode, productId, value]);

  return null;
}
