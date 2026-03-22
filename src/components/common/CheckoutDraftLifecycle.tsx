"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import {
  isCheckoutPaymentPathname,
  PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY,
} from "@/lib/payment-draft";

export default function CheckoutDraftLifecycle() {
  const pathname = usePathname();
  const previousPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;

    if (
      previousPathname &&
      isCheckoutPaymentPathname(previousPathname) &&
      pathname !== previousPathname
    ) {
      sessionStorage.removeItem(PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY);
    }

    previousPathnameRef.current = pathname;
  }, [pathname]);

  return null;
}
