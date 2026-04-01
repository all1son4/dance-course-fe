"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { useCookieConsent } from "@/components/common/CookieConsent/CookieConsentProvider";
import {
  isCheckoutPaymentPathname,
  PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY,
} from "@/lib/payment-draft";

export default function CheckoutDraftLifecycle() {
  const pathname = usePathname();
  const { canUseFunctionalStorage } = useCookieConsent();
  const previousPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    if (!canUseFunctionalStorage) {
      previousPathnameRef.current = pathname;
      return;
    }

    const previousPathname = previousPathnameRef.current;
    const isCurrentPathCheckout = isCheckoutPaymentPathname(pathname);

    if (!isCurrentPathCheckout) {
      sessionStorage.removeItem(PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY);
    }

    if (
      previousPathname &&
      isCheckoutPaymentPathname(previousPathname) &&
      pathname !== previousPathname
    ) {
      sessionStorage.removeItem(PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY);
    }

    previousPathnameRef.current = pathname;
  }, [canUseFunctionalStorage, pathname]);

  return null;
}
