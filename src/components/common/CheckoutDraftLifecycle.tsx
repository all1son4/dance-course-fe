"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useCookieConsent } from "@/components/common/CookieConsent/CookieConsentProvider";
import {
  isCheckoutDraftPathname,
  PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY,
} from "@/lib/payment-draft";

/**
 * The checkout draft lives in sessionStorage for exactly one journey: the
 * form, a failed attempt and the way back to the form, or the success page
 * while it still verifies. Landing anywhere else ends that journey. The
 * checkout page decides on its own whether a fresh visit restores the draft
 * (reload or resume=1) or starts clean, so this only has to drop it on exit.
 */
export default function CheckoutDraftLifecycle() {
  const pathname = usePathname();
  const { canUseFunctionalStorage } = useCookieConsent();

  useEffect(() => {
    if (!canUseFunctionalStorage || isCheckoutDraftPathname(pathname)) {
      return;
    }

    sessionStorage.removeItem(PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY);
  }, [canUseFunctionalStorage, pathname]);

  return null;
}
