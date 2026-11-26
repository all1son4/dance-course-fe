import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { getResolvedCheckoutCurrency } from "@/constants/sellable-products";
import { resolvePaymentValidationLocale } from "@/lib/checkout/payment.validation";
import { getStoredCookieConsent, hasCookieConsentFor } from "@/lib/cookie-consent";
import { PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY } from "@/lib/payment-draft";
import type { PaymentCheckoutDraft } from "@/stores/payment-store";

import {
  isReloadNavigation,
  PAYMENT_DRAFT_SAVE_DEBOUNCE_MS,
  type PaymentStoreInstance,
} from "./payment.helpers";

/**
 * The checkout draft in sessionStorage: restored on a reload or a "back to
 * payment" return, saved as the form changes, only with functional consent.
 */
export const useCheckoutDraft = ({
  canUseFunctionalStorage,
  locale,
  paymentStore,
}: {
  canUseFunctionalStorage: boolean;
  locale: string;
  paymentStore: PaymentStoreInstance;
}) => {
  const hasHydratedCheckoutDraftRef = useRef(false);
  const persistCheckoutDraftNow = useCallback(() => {
    if (typeof window === "undefined" || !canUseFunctionalStorage) {
      return;
    }

    const checkoutDraft = paymentStore.getCheckoutDraftSnapshot();
    sessionStorage.setItem(
      PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY,
      JSON.stringify(checkoutDraft),
    );
  }, [canUseFunctionalStorage, paymentStore]);

  const restoreCheckoutDraft = useCallback(() => {
    if (hasHydratedCheckoutDraftRef.current || typeof window === "undefined") {
      return;
    }

    hasHydratedCheckoutDraftRef.current = true;

    // Drafts survive a reload and the "back to payment" return from a failed
    // attempt (marked with resume=1). Any other fresh visit starts a clean
    // checkout session.
    const isResumeNavigation =
      new URLSearchParams(window.location.search).get("resume") === "1";

    if (!isReloadNavigation() && !isResumeNavigation) {
      sessionStorage.removeItem(PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY);
      return;
    }

    const serializedDraft = sessionStorage.getItem(PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY);

    if (!serializedDraft) {
      return;
    }

    try {
      const parsedDraft = JSON.parse(serializedDraft) as Partial<PaymentCheckoutDraft>;
      const searchParams = new URLSearchParams(window.location.search);
      const queryOfferId = searchParams.get("offer");
      const queryProductId = searchParams.get("product");
      const queryCurrency = searchParams.get("currency");

      paymentStore.applyCheckoutDraft({
        ...parsedDraft,
        selectedCurrency: queryCurrency
          ? getResolvedCheckoutCurrency(queryCurrency)
          : parsedDraft.selectedCurrency,
        selectedOfferId: queryOfferId ?? parsedDraft.selectedOfferId,
        selectedProductId: queryProductId ?? parsedDraft.selectedProductId,
        validationLocale: resolvePaymentValidationLocale(locale),
      });
    } catch {
      sessionStorage.removeItem(PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY);
    }
  }, [locale, paymentStore]);

  // The draft is applied in the hydration commit itself, reading consent
  // straight from storage rather than waiting for the consent provider's
  // mount effect. The store update it makes is flushed before the browser
  // paints, so the first client frame already shows the filled form and the
  // Stripe reveal then opens exactly once - no empty frame, no second pop.
  // (The server HTML stays the empty form: hydration matches it, the fields'
  // values are applied on top.)
  useLayoutEffect(() => {
    if (hasCookieConsentFor(getStoredCookieConsent(), "functional")) {
      restoreCheckoutDraft();
    }
  }, [restoreCheckoutDraft]);

  // Consent given only later in this visit (banner answered after the load).
  useEffect(() => {
    if (canUseFunctionalStorage) {
      restoreCheckoutDraft();
    }
  }, [canUseFunctionalStorage, restoreCheckoutDraft]);

  useEffect(() => {
    if (typeof window === "undefined" || !canUseFunctionalStorage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      persistCheckoutDraftNow();
    }, PAYMENT_DRAFT_SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    canUseFunctionalStorage,
    persistCheckoutDraftNow,
    paymentStore.agreements.digitalContentAgreement,
    paymentStore.agreements.immediateAccessConsent,
    paymentStore.agreements.privacyPolicyAcknowledgement,
    paymentStore.agreements.withdrawalNoticeAcknowledgement,
    paymentStore.checkoutSessionId,
    paymentStore.customerData.country,
    paymentStore.customerData.address,
    paymentStore.customerData.city,
    paymentStore.customerData.email,
    paymentStore.customerData.fullName,
    paymentStore.customerData.instagram,
    paymentStore.customerData.lessonLanguage,
    paymentStore.customerData.nickname,
    paymentStore.customerData.postalCode,
    paymentStore.selectedCurrency,
    paymentStore.selectedOfferId,
    paymentStore.selectedProductId,
    paymentStore.validationLocale,
  ]);
};
