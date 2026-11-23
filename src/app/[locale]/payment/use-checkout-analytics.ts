import { useEffect, useMemo, useRef } from "react";

import type { PaymentCustomerFieldName } from "@/lib/checkout/payment.constants";
import { trackAnalyticsEvent } from "@/lib/mixpanel-analytics";

import { getCheckoutBlockReason, type PaymentStoreInstance } from "./payment.helpers";

/**
 * The checkout's own analytics: the checkout viewed, blocked and its payment
 * form revealed, each once per selection, and each field's first start and
 * first completion. Nothing is sent without analytics consent.
 */
export const useCheckoutAnalytics = ({
  canRevealStripe,
  canUseAnalytics,
  isRenewalCheckout,
  isRenewalUnavailable,
  isStaleCheckoutLink,
  paymentStore,
}: {
  canRevealStripe: boolean;
  canUseAnalytics: boolean;
  isRenewalCheckout: boolean;
  isRenewalUnavailable: boolean;
  isStaleCheckoutLink: boolean;
  paymentStore: PaymentStoreInstance;
}) => {
  const lastTrackedCheckoutRef = useRef<string | null>(null);
  const lastTrackedBlockedStateRef = useRef<string | null>(null);
  const lastTrackedPaymentRevealRef = useRef<string | null>(null);
  const trackedCompletedFieldsRef = useRef(new Set<string>());
  const trackedStartedFieldsRef = useRef(new Set<string>());
  const analyticsCommerceProperties = useMemo(
    () =>
      ({
        currency: paymentStore.selectedCurrency,
        is_renewal: isRenewalCheckout,
        offer_code: paymentStore.selectedOffer.code,
        offer_id: paymentStore.selectedOffer.id,
        product_code: paymentStore.selectedProduct.code,
        product_id: paymentStore.selectedProduct.id,
        value: paymentStore.selectedPrice,
      }) as const,
    [
      isRenewalCheckout,
      paymentStore.selectedCurrency,
      paymentStore.selectedOffer.code,
      paymentStore.selectedOffer.id,
      paymentStore.selectedPrice,
      paymentStore.selectedProduct.code,
      paymentStore.selectedProduct.id,
    ],
  );

  useEffect(() => {
    if (
      !canUseAnalytics ||
      paymentStore.catalogStatus !== "ready" ||
      isStaleCheckoutLink ||
      isRenewalUnavailable
    ) {
      return;
    }

    const checkoutKey = [
      paymentStore.selectedProduct.id,
      paymentStore.selectedOffer.id,
      paymentStore.selectedCurrency,
      isRenewalCheckout ? "renewal" : "new",
    ].join(":");

    if (lastTrackedCheckoutRef.current === checkoutKey) {
      return;
    }

    lastTrackedCheckoutRef.current = checkoutKey;
    void trackAnalyticsEvent("checkout_viewed", analyticsCommerceProperties);
  }, [
    analyticsCommerceProperties,
    canUseAnalytics,
    isRenewalCheckout,
    isRenewalUnavailable,
    isStaleCheckoutLink,
    paymentStore.catalogStatus,
    paymentStore.selectedCurrency,
    paymentStore.selectedOffer.id,
    paymentStore.selectedProduct.id,
  ]);

  useEffect(() => {
    // The notice priority of the render below, so the tracked reason is the
    // notice the visitor actually saw.
    const reason = getCheckoutBlockReason({
      isCatalogUnavailable: paymentStore.isCatalogUnavailable,
      isRenewalUnavailable,
      isSalesClosed: paymentStore.isSalesClosed,
      isStaleCheckoutLink,
    });

    if (!canUseAnalytics || !reason || lastTrackedBlockedStateRef.current === reason) {
      return;
    }

    lastTrackedBlockedStateRef.current = reason;
    void trackAnalyticsEvent("checkout_blocked", {
      ...analyticsCommerceProperties,
      reason,
    });
  }, [
    analyticsCommerceProperties,
    canUseAnalytics,
    isRenewalUnavailable,
    isStaleCheckoutLink,
    paymentStore.isCatalogUnavailable,
    paymentStore.isSalesClosed,
  ]);

  useEffect(() => {
    if (!canUseAnalytics || !canRevealStripe) {
      return;
    }

    const revealKey = [
      paymentStore.selectedProduct.id,
      paymentStore.selectedOffer.id,
      paymentStore.selectedCurrency,
    ].join(":");

    if (lastTrackedPaymentRevealRef.current === revealKey) {
      return;
    }

    lastTrackedPaymentRevealRef.current = revealKey;
    void trackAnalyticsEvent("payment_form_revealed", analyticsCommerceProperties);
  }, [
    analyticsCommerceProperties,
    canUseAnalytics,
    canRevealStripe,
    paymentStore.selectedCurrency,
    paymentStore.selectedOffer.id,
    paymentStore.selectedProduct.id,
  ]);

  const getCheckoutFieldInteractionKey = (fieldName: PaymentCustomerFieldName) =>
    [
      paymentStore.selectedProduct.id,
      paymentStore.selectedOffer.id,
      paymentStore.selectedCurrency,
      isRenewalCheckout ? "renewal" : "new",
      fieldName,
    ].join(":");

  const trackFieldStarted = (fieldName: PaymentCustomerFieldName) => {
    if (!canUseAnalytics) {
      return;
    }

    const interactionKey = getCheckoutFieldInteractionKey(fieldName);

    if (trackedStartedFieldsRef.current.has(interactionKey)) {
      return;
    }

    trackedStartedFieldsRef.current.add(interactionKey);
    void trackAnalyticsEvent("checkout_field_started", {
      ...analyticsCommerceProperties,
      field_name: fieldName,
    });
  };

  const trackFieldCompleted = (fieldName: PaymentCustomerFieldName, value: string) => {
    if (!canUseAnalytics || !value.trim()) {
      return;
    }

    const interactionKey = getCheckoutFieldInteractionKey(fieldName);

    if (trackedCompletedFieldsRef.current.has(interactionKey)) {
      return;
    }

    trackedCompletedFieldsRef.current.add(interactionKey);
    void trackAnalyticsEvent("checkout_field_completed", {
      ...analyticsCommerceProperties,
      field_name: fieldName,
    });
  };

  return { analyticsCommerceProperties, trackFieldCompleted, trackFieldStarted };
};
