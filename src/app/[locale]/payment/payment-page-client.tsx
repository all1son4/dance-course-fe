"use client";

import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent, FocusEvent, FormEvent } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Button from "@/components/common/Button";
import { useCookieConsent } from "@/components/common/CookieConsent/CookieConsentProvider";
import type { StripePaymentTabsProps } from "@/components/other/StripePaymentTabs";
import type { CountryOption } from "@/constants/countries";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import {
  BIRTHDAY_DROP_PRODUCT_ID,
  formatCheckoutPrice,
  getDefaultCheckoutCurrencyByLocale,
  getResolvedCheckoutCurrency,
  isOnlineGroupLibraryOfferId,
  type SupportedCheckoutCurrency,
} from "@/constants/sellable-products";
import {
  applyBirthdayPopupSignal,
  getBirthdayPopupState,
  isBirthdayOfferId,
  saveBirthdayPopupState,
} from "@/lib/birthday-popup";
import { getStoredCookieConsent, hasCookieConsentFor } from "@/lib/cookie-consent";
import { ensureLocationChangeEvents, LOCATION_CHANGE_EVENT } from "@/lib/location-change";
import { trackAnalyticsEvent } from "@/lib/mixpanel-analytics";
import { PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY } from "@/lib/payment-draft";
import { StoreProvider, usePaymentStore } from "@/stores";
import type {
  PaymentCheckoutDraft,
  PaymentStoreInitialization,
} from "@/stores/payment-store";

import { CheckoutForm } from "./checkout-form";
import {
  CheckoutSummaryCard,
  type CheckoutSummaryCardProps,
} from "./checkout-summary-card";
import {
  AgreementLink,
  InteractiveBox,
  PaymentDescription,
  PaymentSection,
  PaymentTitle,
  SalesClosedActions,
  SalesClosedDescription,
  SalesClosedNotice,
  SalesClosedTitle,
  SummaryBoxDesktop,
  SummaryBoxMobile,
  TextBox,
} from "./page.styles";
import {
  PAYMENT_CHECKBOXES,
  PAYMENT_LESSON_LANGUAGE_OPTIONS,
  type PaymentAgreementFieldName,
  type PaymentCustomerFieldName,
} from "./payment.constants";
import {
  type CheckoutAgreement,
  type CheckoutInputField,
  getCheckoutEnterKeyHint,
  getCompactSummaryTitle,
  getVisiblePaymentInputs,
  isReloadNavigation,
  PAYMENT_DRAFT_SAVE_DEBOUNCE_MS,
  PAYMENT_INTENT_CREATION_DELAY_MS,
  STRIPE_INTENT_ERROR_TRANSLATION_KEYS,
} from "./payment.helpers";
import { resolvePaymentValidationLocale } from "./payment.validation";
import { useTelegramRenewal } from "./use-telegram-renewal";

type PaymentPageProps = {
  countryOptions: CountryOption[];
  initialSearchKey: string;
};

const PaymentPage = observer(function PaymentPage({
  countryOptions,
  initialSearchKey,
}: PaymentPageProps) {
  const paymentStore = usePaymentStore();
  const { canUseAnalytics, canUseFunctionalStorage } = useCookieConsent();
  const locale = useLocale();
  const t = useTranslations("PaymentPage");
  const commonT = useTranslations("Common");
  const stripeT = useTranslations("StripePaymentTabs");
  const productT = useTranslations("SellableProducts");
  const [searchKey, setSearchKey] = useState(initialSearchKey);
  // Stripe is confirming: the customer data it was minted for must not move.
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);
  const hasHydratedCheckoutDraftRef = useRef(false);
  const lastTrackedCheckoutRef = useRef<string | null>(null);
  const lastTrackedBlockedStateRef = useRef<string | null>(null);
  const lastTrackedPaymentRevealRef = useRef<string | null>(null);
  const trackedCompletedFieldsRef = useRef(new Set<string>());
  const trackedStartedFieldsRef = useRef(new Set<string>());
  const isChoreoProduct = paymentStore.selectedProduct.type === "choreo";
  // The drop ships one Telegram channel with both languages inside, so a
  // language choice on its checkout would be meaningless noise.
  const showsLessonLanguage =
    isChoreoProduct && paymentStore.selectedProduct.id !== BIRTHDAY_DROP_PRODUCT_ID;
  const isOnlineGroupCheckout =
    paymentStore.selectedProduct.code === "online-group-anna-strok";
  const isOnlineGroupPlusCheckout =
    isOnlineGroupCheckout && isOnlineGroupLibraryOfferId(paymentStore.selectedOffer.id);
  const lessonLanguageOptions = PAYMENT_LESSON_LANGUAGE_OPTIONS.map((option) => ({
    label: t(option.labelKey),
    value: option.value,
  }));
  const selectedProductTitle = productT(paymentStore.selectedProduct.titleKey);
  const checkoutTitleKey = paymentStore.selectedProduct.checkoutTitleKey;
  const renewalSlug = new URLSearchParams(searchKey).get("renewal")?.trim() ?? "";
  const isRenewalCheckout = Boolean(renewalSlug);
  // A product may name itself for the checkout - the drop is sold under its
  // campaign name, not the track in quotes. Otherwise the wide card keeps the
  // full title and the narrow one falls back to the quoted short name.
  const checkoutTitle = checkoutTitleKey ? productT(checkoutTitleKey) : "";
  const summaryCardTitle = checkoutTitle || selectedProductTitle;
  const selectedProductCompactTitle =
    checkoutTitle || getCompactSummaryTitle(selectedProductTitle);
  const productPaymentInputs = getVisiblePaymentInputs({
    isRenewalCheckout: false,
    showsLessonLanguage,
  });
  const visiblePaymentInputs = getVisiblePaymentInputs({
    isRenewalCheckout,
    showsLessonLanguage,
  });
  const {
    isRenewalUnavailable,
    renewalClientId,
    renewalNonce,
    renewalStatus,
    renewalStatusText,
    renewalStatusTone,
    verifyTelegramRenewal,
  } = useTelegramRenewal({
    locale,
    paymentStore,
    productPaymentInputs,
    renewalSlug,
    t,
  });
  const isRenewalVerified = !isRenewalCheckout || renewalStatus === "verified";

  // A stale or mistyped link must not silently sell the default product: when
  // the requested product or offer is missing from the authoritative catalogue,
  // the form gives way to an honest notice pointing at the current offerings.
  const requestedProductId = new URLSearchParams(searchKey).get("product") ?? "";
  const requestedOfferId = new URLSearchParams(searchKey).get("offer") ?? "";
  const requestedProduct = requestedProductId
    ? paymentStore.sellableProducts.find((product) => product.id === requestedProductId)
    : undefined;
  const isStaleCheckoutLink =
    paymentStore.hasAuthoritativeCatalog &&
    !isRenewalCheckout &&
    ((Boolean(requestedProductId) && !requestedProduct) ||
      (Boolean(requestedProduct) &&
        Boolean(requestedOfferId) &&
        !requestedProduct?.offers.some((offer) => offer.id === requestedOfferId)));
  const canRevealStripe = paymentStore.canShowStripe && isRenewalVerified;
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
  const stripeIntentErrorText = paymentStore.isCatalogUnavailable
    ? stripeT("errors.catalogUnavailable")
    : paymentStore.stripeIntentError
      ? stripeT(
          STRIPE_INTENT_ERROR_TRANSLATION_KEYS[paymentStore.stripeIntentError] ??
            "errors.paymentIntentRequestFailed",
        )
      : "";
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

  useEffect(() => {
    paymentStore.setValidationLocale(locale);
    paymentStore.initializeCheckoutCurrency(getDefaultCheckoutCurrencyByLocale(locale));
  }, [locale, paymentStore]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    ensureLocationChangeEvents();

    const syncSearchKey = () => {
      setSearchKey(window.location.search);
    };

    syncSearchKey();
    window.addEventListener(LOCATION_CHANGE_EVENT, syncSearchKey);

    return () => {
      window.removeEventListener(LOCATION_CHANGE_EVENT, syncSearchKey);
    };
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(searchKey);

    paymentStore.configureCheckoutSelection({
      offerId: searchParams.get("offer"),
      productId: searchParams.get("product"),
    });
    paymentStore.setRenewalCampaignSlug(searchParams.get("renewal"));
  }, [paymentStore, searchKey]);

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
    // Mirrors the notice priority in the render below, so the tracked reason is
    // the notice the visitor actually saw.
    const reason = paymentStore.isCatalogUnavailable
      ? "catalog_unavailable"
      : isStaleCheckoutLink
        ? "stale_link"
        : paymentStore.isSalesClosed
          ? "sales_closed"
          : isRenewalUnavailable
            ? "renewal_unavailable"
            : null;

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

  // Reaching checkout for the campaign offer counts as "thinking about it": the
  // birthday popup observes the reaction cooldown even if the payment is dropped.
  useEffect(() => {
    const offerId = new URLSearchParams(searchKey).get("offer");

    if (!offerId || !isBirthdayOfferId(offerId)) {
      return;
    }

    saveBirthdayPopupState(
      applyBirthdayPopupSignal(getBirthdayPopupState(), "checkout_started", new Date()),
      canUseFunctionalStorage,
    );
  }, [canUseFunctionalStorage, searchKey]);

  useEffect(() => {
    const searchParams = new URLSearchParams(searchKey);
    const queryCurrency = searchParams.get("currency");

    if (!queryCurrency) {
      return;
    }

    const nextCurrency = getResolvedCheckoutCurrency(queryCurrency);
    paymentStore.setSelectedCurrency(nextCurrency);
  }, [paymentStore, searchKey]);

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
    paymentStore.customerData.lessonLanguage,
    paymentStore.customerData.nickname,
    paymentStore.customerData.postalCode,
    paymentStore.selectedCurrency,
    paymentStore.selectedOfferId,
    paymentStore.selectedProductId,
    paymentStore.validationLocale,
  ]);

  useEffect(() => {
    if (!paymentStore.canShowStripe || !isRenewalVerified) {
      return;
    }

    // Let the last keystroke/checkbox update settle before creating a billable Stripe
    // intent, reducing the chance of immediately canceling stale intents.
    const timeoutId = window.setTimeout(() => {
      void paymentStore.ensureStripePaymentIntent(paymentStore.selectedCurrency);
    }, PAYMENT_INTENT_CREATION_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    paymentStore,
    paymentStore.canShowStripe,
    isRenewalVerified,
    paymentStore.selectedOfferId,
    paymentStore.selectedProductId,
    paymentStore.selectedCurrency,
    paymentStore.customerData.email,
    paymentStore.customerData.fullName,
    paymentStore.customerData.nickname,
    paymentStore.customerData.address,
    paymentStore.customerData.city,
    paymentStore.customerData.postalCode,
    paymentStore.customerData.country,
    paymentStore.customerData.lessonLanguage,
    paymentStore.renewalCampaignSlug,
  ]);

  // Leaving the checkout resets it and cancels the intents it minted - unless
  // a payment is under way. Stripe keeps `processing` intents cancellable, so
  // cancelling here could void a payment the buyer has already confirmed.
  const isPaymentSubmittingRef = useRef(isPaymentSubmitting);
  isPaymentSubmittingRef.current = isPaymentSubmitting;

  useEffect(() => {
    return () => {
      paymentStore.resetCheckoutForm({
        cancelActiveIntents: !isPaymentSubmittingRef.current,
      });
    };
  }, [paymentStore]);

  const handleRetryPaymentPreparation = () => {
    void paymentStore.retryStripePaymentIntent();
  };

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    paymentStore.setCustomerField(
      event.target.name as PaymentCustomerFieldName,
      event.target.value,
    );
  };

  const getCheckoutFieldInteractionKey = (fieldName: PaymentCustomerFieldName) =>
    [
      paymentStore.selectedProduct.id,
      paymentStore.selectedOffer.id,
      paymentStore.selectedCurrency,
      isRenewalCheckout ? "renewal" : "new",
      fieldName,
    ].join(":");

  const handleInputFocus = (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!canUseAnalytics) {
      return;
    }

    const fieldName = event.currentTarget.name as PaymentCustomerFieldName;
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

  const handleInputBlur = (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const fieldName = event.currentTarget.name as PaymentCustomerFieldName;
    // Settles the value into its normalized form and validates it.
    paymentStore.touchCustomerField(fieldName);

    if (!canUseAnalytics || !event.currentTarget.value.trim()) {
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

  const handleAgreementChange = (
    fieldName: PaymentAgreementFieldName,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    paymentStore.setAgreement(fieldName, event.target.checked);

    if (canUseAnalytics) {
      void trackAnalyticsEvent("checkout_agreement_changed", {
        ...analyticsCommerceProperties,
        agreement_name: fieldName,
        is_accepted: event.target.checked,
      });
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void trackAnalyticsEvent("checkout_form_submitted", analyticsCommerceProperties);
    paymentStore.validateCustomerForm();

    const invalidFields = Object.keys(paymentStore.customerErrors);
    const invalidAgreements = Object.entries(paymentStore.agreements)
      .filter(([, isAccepted]) => !isAccepted)
      .map(([agreement]) => agreement);
    const renewalVerificationRequired = !isRenewalVerified;

    if (
      invalidFields.length > 0 ||
      invalidAgreements.length > 0 ||
      renewalVerificationRequired
    ) {
      void trackAnalyticsEvent("checkout_validation_failed", {
        ...analyticsCommerceProperties,
        invalid_agreements: invalidAgreements,
        invalid_fields: invalidFields,
        renewal_verification_required: renewalVerificationRequired,
      });
    }
  };

  const handleCurrencyChange = (value: SupportedCheckoutCurrency) => {
    if (isPaymentSubmitting) {
      return;
    }

    const previousCurrency = paymentStore.selectedCurrency;
    paymentStore.setSelectedCurrency(value);

    if (previousCurrency !== value) {
      void trackAnalyticsEvent("currency_changed", {
        ...analyticsCommerceProperties,
        currency: value,
        from_currency: previousCurrency,
        to_currency: value,
        value: paymentStore.selectedPrice,
      });
    }
  };

  const getInputSelectOptions = (fieldName: PaymentCustomerFieldName) => {
    if (fieldName === "country") {
      return countryOptions;
    }

    if (fieldName === "lessonLanguage") {
      return lessonLanguageOptions;
    }

    return undefined;
  };

  const checkoutInputFields: CheckoutInputField[] = visiblePaymentInputs.map(
    (inputConfig, index) => ({
      ...inputConfig,
      enterKeyHint: getCheckoutEnterKeyHint(index, visiblePaymentInputs.length),
      errorMessage: paymentStore.customerErrors[inputConfig.name] ?? "",
      label: t(inputConfig.labelKey),
      placeholder: t(inputConfig.placeholderKey),
      selectOptions: getInputSelectOptions(inputConfig.name),
      value: paymentStore.customerData[inputConfig.name] ?? "",
    }),
  );
  const checkoutAgreements: CheckoutAgreement[] = PAYMENT_CHECKBOXES.map(
    (checkboxConfig) => ({
      checked: paymentStore.agreements[checkboxConfig.name],
      disabled: isRenewalCheckout && !isRenewalVerified,
      formName: checkboxConfig.formName,
      name: checkboxConfig.name,
      placeholder:
        checkboxConfig.name === "privacyPolicyAcknowledgement"
          ? t.rich(checkboxConfig.placeholderKey, {
              link: (chunks) => (
                <AgreementLink
                  href="/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  {chunks}
                </AgreementLink>
              ),
            })
          : t(checkboxConfig.placeholderKey),
    }),
  );
  const summaryProps: Omit<CheckoutSummaryCardProps, "isMobile" | "title"> = {
    accessNote: isRenewalCheckout
      ? t(
          isOnlineGroupPlusCheckout
            ? "renewal.summaryCard.accessNotePlus"
            : "renewal.summaryCard.accessNote",
        )
      : productT(
          isOnlineGroupPlusCheckout
            ? "onlineGroupAnnaStrok.accessNotePlus"
            : paymentStore.selectedProduct.accessNoteKey,
        ),
    amountLabel: t("summary.amountLabel"),
    currencyLabel: t("summary.currencyLabel"),
    descriptionParagraphs: paymentStore.selectedProduct.descriptionKeys.map(
      (paragraphKey) => ({
        key: paragraphKey,
        text: productT(paragraphKey),
      }),
    ),
    formattedPrice: formatCheckoutPrice(
      paymentStore.selectedPrice,
      paymentStore.selectedCurrency,
    ),
    isCurrencyLocked: isPaymentSubmitting,
    isLoading: paymentStore.catalogStatus === "loading",
    isRenewalCheckout,
    offerSummary: isOnlineGroupCheckout
      ? t("summary.offerLabel", {
          offer: productT(paymentStore.selectedOffer.labelKey),
        })
      : null,
    onCurrencyChange: handleCurrencyChange,
    renewalDescription: t("renewal.summaryCard.description"),
    selectedCurrency: paymentStore.selectedCurrency,
  };
  const stripeProps: StripePaymentTabsProps = {
    allPaymentIntentIds: Object.values(paymentStore.stripePaymentIntentIds),
    billingAddressLine1: paymentStore.customerData.address,
    billingCity: paymentStore.customerData.city,
    billingCountry: paymentStore.customerData.country,
    billingEmail: paymentStore.customerData.email,
    billingName: paymentStore.customerData.fullName.trim(),
    billingPostalCode: paymentStore.customerData.postalCode,
    checkoutSessionId: paymentStore.checkoutSessionId,
    clientSecret: paymentStore.stripeClientSecrets?.[paymentStore.selectedCurrency] ?? "",
    hasIntentError: Boolean(paymentStore.stripeIntentError),
    isUpdating: paymentStore.isStripeIntentUpdating,
    onSubmittingChange: setIsPaymentSubmitting,
    paymentIntentId:
      paymentStore.stripePaymentIntentIds?.[paymentStore.selectedCurrency] ?? "",
    resultCurrency: paymentStore.selectedCurrency,
    resultOfferId: paymentStore.selectedOfferId,
    resultOfferCode: paymentStore.selectedOffer.code,
    resultProductId: paymentStore.selectedProductId,
    resultProductCode: paymentStore.selectedProduct.code,
    resultValue: paymentStore.selectedPrice,
    isRenewalCheckout,
  };

  return (
    <PaymentSection>
      <InteractiveBox>
        <TextBox>
          <PaymentTitle>{t("title")}</PaymentTitle>
          <PaymentDescription>
            {isRenewalCheckout
              ? `${t("description")} ${t("renewal.description")}`
              : t("description")}
          </PaymentDescription>
        </TextBox>
        {/* With an invalid link the selected product is just the fallback, so
            showing its summary next to the notice would mislead. */}
        {!paymentStore.isCatalogUnavailable &&
          !isRenewalUnavailable &&
          !isStaleCheckoutLink && (
            <SummaryBoxMobile>
              <CheckoutSummaryCard
                {...summaryProps}
                isMobile
                title={selectedProductCompactTitle}
              />
            </SummaryBoxMobile>
          )}
        {paymentStore.isCatalogUnavailable ? (
          <SalesClosedNotice>
            <SalesClosedTitle>{t("catalogUnavailable.title")}</SalesClosedTitle>
            <SalesClosedDescription>
              {t("catalogUnavailable.description")}
            </SalesClosedDescription>
            <SalesClosedActions>
              {/* The copy promises a retry helps, so the retry is one click - a
                  full reload re-runs the authoritative server catalogue read. */}
              <Button
                size="sm"
                buttonText={commonT("tryAgain")}
                analytics={{
                  id: "checkout_retry_catalog",
                  placement: "catalog_unavailable",
                  ...analyticsCommerceProperties,
                }}
                onClick={() => window.location.reload()}
              />
              <Button
                size="sm"
                variant="secondary"
                buttonText={t("salesClosed.contactButton")}
                href={SUPPORT_TELEGRAM_URL}
                target="_blank"
                analytics={{
                  id: "checkout_contact_support",
                  placement: "catalog_unavailable",
                  ...analyticsCommerceProperties,
                }}
              />
            </SalesClosedActions>
          </SalesClosedNotice>
        ) : isStaleCheckoutLink ? (
          // Before the closed-sales notice: when the link itself is dead, "sales
          // are closed" would be about the fallback product, not the one asked for.
          <SalesClosedNotice>
            <SalesClosedTitle>{t("staleLink.title")}</SalesClosedTitle>
            <SalesClosedDescription>{t("staleLink.description")}</SalesClosedDescription>
            <Button
              size="sm"
              buttonText={t("staleLink.catalogButton")}
              href="/online"
              analytics={{ id: "checkout_back_to_catalog", placement: "stale_link" }}
            />
          </SalesClosedNotice>
        ) : paymentStore.isSalesClosed ? (
          <SalesClosedNotice>
            <SalesClosedTitle>{t("salesClosed.title")}</SalesClosedTitle>
            <SalesClosedDescription>
              {t("salesClosed.description")}
            </SalesClosedDescription>
            <Button
              size="sm"
              buttonText={t("salesClosed.contactButton")}
              href={SUPPORT_TELEGRAM_URL}
              target="_blank"
              analytics={{
                id: "checkout_contact_support",
                placement: "sales_closed",
                ...analyticsCommerceProperties,
              }}
            />
          </SalesClosedNotice>
        ) : isRenewalUnavailable ? (
          <SalesClosedNotice>
            <SalesClosedTitle>{t("renewal.unavailable.title")}</SalesClosedTitle>
            <SalesClosedDescription>
              {t("renewal.unavailable.description")}
            </SalesClosedDescription>
            <Button
              size="sm"
              buttonText={t("salesClosed.contactButton")}
              href={SUPPORT_TELEGRAM_URL}
              target="_blank"
              analytics={{
                id: "checkout_contact_support",
                placement: "renewal_unavailable",
                ...analyticsCommerceProperties,
              }}
            />
          </SalesClosedNotice>
        ) : (
          <CheckoutForm
            agreements={checkoutAgreements}
            canRevealStripe={canRevealStripe}
            fields={checkoutInputFields}
            isPersonalDataLocked={isPaymentSubmitting}
            isRenewalCheckout={isRenewalCheckout}
            isRenewalVerified={isRenewalVerified}
            onAgreementChange={handleAgreementChange}
            onInputBlur={handleInputBlur}
            onInputChange={handleInputChange}
            onInputFocus={handleInputFocus}
            onSubmit={handleSubmit}
            onVerify={verifyTelegramRenewal}
            personalDataTitle={t("personalDataTitle")}
            renewalClientId={renewalClientId}
            renewalNonce={renewalNonce}
            renewalStatus={renewalStatus}
            renewalStatusText={renewalStatusText}
            renewalStatusTone={renewalStatusTone}
            onRetryPaymentPreparation={
              paymentStore.stripeIntentError ? handleRetryPaymentPreparation : undefined
            }
            paymentLockedHintText={t("paymentLockedHint")}
            retryLabel={commonT("tryAgain")}
            stripeIntentErrorText={stripeIntentErrorText}
            stripeProps={stripeProps}
            verifyLabel={t("renewal.buttons.verify")}
          />
        )}
      </InteractiveBox>
      {!paymentStore.isCatalogUnavailable &&
        !isRenewalUnavailable &&
        !isStaleCheckoutLink && (
          <SummaryBoxDesktop>
            <CheckoutSummaryCard {...summaryProps} title={summaryCardTitle} />
          </SummaryBoxDesktop>
        )}
    </PaymentSection>
  );
});

export default function PaymentRouteClient({
  countryOptions,
  initialSearchKey,
  paymentInitialization,
}: {
  countryOptions: CountryOption[];
  initialSearchKey: string;
  paymentInitialization: PaymentStoreInitialization;
}) {
  return (
    <StoreProvider paymentInitialization={paymentInitialization}>
      <PaymentPage countryOptions={countryOptions} initialSearchKey={initialSearchKey} />
    </StoreProvider>
  );
}
