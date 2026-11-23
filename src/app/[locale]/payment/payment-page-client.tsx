"use client";

import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent, FocusEvent, FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import Button from "@/components/common/Button";
import { useCookieConsent } from "@/components/common/CookieConsent/CookieConsentProvider";
import EmailSuggestion from "@/components/common/EmailSuggestion";
import type { StripePaymentTabsProps } from "@/components/other/StripePaymentTabs";
import type { CountryOption } from "@/constants/countries";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import {
  BIRTHDAY_DROP_PRODUCT_ID,
  buildCheckoutHref,
  formatCheckoutPrice,
  getDefaultCheckoutCurrencyByLocale,
  getResolvedCheckoutCurrency,
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  INSPIRATION_HUB_DISCOUNT_SLUG,
  isOnlineGroupLibraryOfferId,
  type SupportedCheckoutCurrency,
} from "@/constants/sellable-products";
import {
  applyBirthdayPopupSignal,
  getBirthdayPopupState,
  isBirthdayOfferId,
  saveBirthdayPopupState,
} from "@/lib/birthday-popup";
import {
  PAYMENT_CHECKBOXES,
  PAYMENT_INPUTS,
  PAYMENT_LESSON_LANGUAGE_OPTIONS,
  PAYMENT_STEPS,
  type PaymentAgreementFieldName,
  type PaymentCustomerFieldName,
  type PaymentStep,
} from "@/lib/checkout/payment.constants";
import {
  getCompactSummaryTitle,
  isChoreoTutorialProduct,
  shouldNameOfferAtCheckout,
} from "@/lib/choreo-offer-presentation";
import { getEmailSuggestion } from "@/lib/email-suggestion";
import { ensureLocationChangeEvents, LOCATION_CHANGE_EVENT } from "@/lib/location-change";
import {
  type ButtonAnalyticsMetadata,
  trackAnalyticsEvent,
  trackCtaClick,
} from "@/lib/mixpanel-analytics";
import { getAlternativeTariffHref } from "@/lib/public-sales";
import { prefersReducedMotion } from "@/lib/reveal";
import { StoreProvider, usePaymentStore } from "@/stores";
import type { PaymentStoreInitialization } from "@/stores/payment-store";

import {
  CHECKOUT_CONSENT_ID,
  CheckoutForm,
  type CheckoutFormField,
  type CheckoutStepView,
  getCheckoutStepId,
} from "./checkout-form";
import {
  CheckoutSummaryBar,
  CheckoutSummaryCard,
  type CheckoutSummaryCardProps,
} from "./checkout-summary-card";
import {
  AgreementLink,
  CheckoutProgress,
  CheckoutProgressFill,
  CheckoutProgressText,
  CheckoutProgressTrack,
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
  bringIntoViewIfNeeded,
  type CheckoutAgreement,
  type CheckoutBlockReason,
  type CheckoutIntent,
  getCheckoutBlockReason,
  getCheckoutEnterKeyHint,
  getCheckoutSelectionFromSearch,
  getVisiblePaymentInputs,
  isCheckoutLinkStale,
  PAYMENT_INTENT_CREATION_DELAY_MS,
  pointCheckoutField,
  shouldMoveCheckoutFocus,
  STRIPE_INTENT_ERROR_TRANSLATION_KEYS,
} from "./payment.helpers";
import { useCheckoutAnalytics } from "./use-checkout-analytics";
import { useCheckoutDraft } from "./use-checkout-draft";
import { useTelegramRenewal } from "./use-telegram-renewal";

type PaymentPageProps = {
  countryOptions: CountryOption[];
  initialSearchKey: string;
};

/** --motion-slow, the fold of a step body, plus a frame to settle. */
const STEP_FOLD_DURATION_MS = 340;

/** What the checkout shows instead of the form, one notice per block reason. */
const CheckoutBlockedNotice = ({
  alternativeTariffHref,
  analyticsCommerceProperties,
  reason,
  selectedProductCompactTitle,
}: {
  alternativeTariffHref: string | null;
  analyticsCommerceProperties: Omit<ButtonAnalyticsMetadata, "id" | "placement">;
  reason: CheckoutBlockReason;
  selectedProductCompactTitle: string;
}) => {
  const t = useTranslations("PaymentPage");
  const commonT = useTranslations("Common");

  switch (reason) {
    case "catalog_unavailable":
      return (
        <SalesClosedNotice>
          <SalesClosedTitle>{t("catalogUnavailable.title")}</SalesClosedTitle>
          <SalesClosedDescription>
            {t("catalogUnavailable.description")}
          </SalesClosedDescription>
          <SalesClosedActions>
            {/* Re-read availability on the server without exposing technical details. */}
            <Button
              size="sm"
              buttonText={commonT("refresh")}
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
              buttonText={t("staleLink.catalogButton")}
              href="/online"
              analytics={{
                id: "checkout_back_to_catalog",
                placement: "catalog_unavailable",
                ...analyticsCommerceProperties,
              }}
            />
          </SalesClosedActions>
        </SalesClosedNotice>
      );
    case "stale_link":
      // Before the closed-sales notice: when the link itself is dead, "sales
      // are closed" would be about the fallback product, not the one asked for.
      return (
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
      );
    case "sales_closed":
      return (
        <SalesClosedNotice>
          <SalesClosedTitle>{selectedProductCompactTitle}</SalesClosedTitle>
          <SalesClosedDescription>
            {t(alternativeTariffHref ? "offerUnavailable.title" : "salesClosed.title")}
          </SalesClosedDescription>
          <Button
            size="sm"
            buttonText={t(
              alternativeTariffHref
                ? "offerUnavailable.selectButton"
                : "staleLink.catalogButton",
            )}
            href={alternativeTariffHref ?? "/online"}
            analytics={{
              id: "checkout_back_to_catalog",
              placement: alternativeTariffHref ? "offer_unavailable" : "sales_closed",
              ...analyticsCommerceProperties,
            }}
          />
        </SalesClosedNotice>
      );
    case "renewal_unavailable":
      return (
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
      );
  }
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
  // The step the buyer opened; null until they first touch the form.
  const [openedStep, setOpenedStep] = useState<PaymentStep | null>(null);
  // The email hint holds back an ending still being typed ("gmail.co").
  const [isTypingEmail, setIsTypingEmail] = useState(false);
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
  const isHubDiscountCheckout = renewalSlug === INSPIRATION_HUB_DISCOUNT_SLUG;
  // A product may name itself for the checkout - the drop is sold under its
  // campaign name, not the track in quotes. Otherwise the wide card keeps the
  // full title and the narrow one falls back to the quoted short name.
  const checkoutTitle = checkoutTitleKey ? productT(checkoutTitleKey) : "";
  const summaryCardTitle = checkoutTitle || selectedProductTitle;
  const selectedProductCompactTitle =
    checkoutTitle || getCompactSummaryTitle(selectedProductTitle);
  const visiblePaymentInputs = getVisiblePaymentInputs({
    isRenewalCheckout,
    showsLessonLanguage,
  });
  const {
    isRenewalUnavailable: isRenewalLinkUnavailable,
    renewalClientId,
    renewalNonce,
    renewalStatus,
    renewalStatusText,
    renewalStatusTone,
    verifyTelegramRenewal,
  } = useTelegramRenewal({
    locale,
    paymentStore,
    renewalSlug,
    t,
  });
  const isRenewalUnavailable =
    isRenewalLinkUnavailable ||
    paymentStore.stripeIntentError === "renewal_campaign_inactive" ||
    paymentStore.stripeIntentError === "renewal_payment_context_mismatch";
  const isRenewalVerified = !isRenewalCheckout || renewalStatus === "verified";
  const hubFullPriceHref = `${buildCheckoutHref({
    offerId: INSPIRATION_HUB_ACCESS_OFFER_ID,
    productId: paymentStore.selectedProduct.id,
  })}&currency=${paymentStore.selectedCurrency}`;

  // A stale or mistyped link must not silently sell the default product: when
  // the requested product or offer is missing from the authoritative catalogue,
  // the form gives way to an honest notice pointing at the current offerings.
  const requestedSelection = new URLSearchParams(searchKey);
  const isStaleCheckoutLink =
    paymentStore.hasAuthoritativeCatalog &&
    !isRenewalCheckout &&
    isCheckoutLinkStale({
      products: paymentStore.sellableProducts,
      productId: requestedSelection.get("product") ?? "",
      offerId: requestedSelection.get("offer") ?? "",
    });
  const checkoutBlockReason = getCheckoutBlockReason({
    isCatalogUnavailable: paymentStore.isCatalogUnavailable,
    isRenewalUnavailable,
    isSalesClosed: paymentStore.isSalesClosed,
    isStaleCheckoutLink,
  });
  const isCheckoutBlocked = checkoutBlockReason !== null;
  const alternativeTariffHref = paymentStore.isSalesClosed
    ? getAlternativeTariffHref(
        paymentStore.selectedProduct,
        paymentStore.selectedOffer.id,
      )
    : null;
  const canRevealStripe =
    paymentStore.canShowStripe && isRenewalVerified && !isCheckoutBlocked;
  const stripeIntentErrorText = paymentStore.isCatalogUnavailable
    ? stripeT("errors.catalogUnavailable")
    : paymentStore.stripeIntentError
      ? stripeT(
          STRIPE_INTENT_ERROR_TRANSLATION_KEYS[paymentStore.stripeIntentError] ??
            "errors.paymentIntentRequestFailed",
        )
      : "";
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

    paymentStore.configureCheckoutSelection(getCheckoutSelectionFromSearch(searchParams));
    paymentStore.setRenewalCampaignSlug(searchParams.get("renewal"));
  }, [paymentStore, searchKey]);

  const { analyticsCommerceProperties, trackFieldCompleted, trackFieldStarted } =
    useCheckoutAnalytics({
      canRevealStripe,
      canUseAnalytics,
      isRenewalCheckout,
      isRenewalUnavailable,
      isStaleCheckoutLink,
      paymentStore,
    });

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

  useCheckoutDraft({ canUseFunctionalStorage, locale, paymentStore });

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
    const fieldName = event.target.name as PaymentCustomerFieldName;
    const { value } = event.target;

    if (fieldName === "nickname") {
      // The field draws the "@" itself and shows the handle without it.
      const handle = value.replace(/^@+/, "");
      paymentStore.setCustomerField(fieldName, handle ? `@${handle}` : "");
      return;
    }

    paymentStore.setCustomerField(fieldName, value);
  };

  const applyEmailSuggestion = (suggestedEmail: string) => {
    paymentStore.setCustomerField("email", suggestedEmail);
    paymentStore.touchCustomerField("email");
  };

  const handleAcceptAllChange = (isAccepted: boolean) => {
    PAYMENT_CHECKBOXES.forEach(({ name }) => paymentStore.setAgreement(name, isAccepted));

    if (canUseAnalytics) {
      void trackAnalyticsEvent("checkout_agreement_changed", {
        ...analyticsCommerceProperties,
        agreement_name: "all",
        is_accepted: isAccepted,
      });
    }
  };

  const handleInputFocus = (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const fieldName = event.currentTarget.name as PaymentCustomerFieldName;
    if (fieldName === "email") setIsTypingEmail(true);
    const fieldStep = PAYMENT_INPUTS.find((input) => input.name === fieldName)?.step;

    // The first touch pins the open step; from here on only the buyer moves it.
    if (openedStep === null && fieldStep) {
      setOpenedStep(fieldStep);
    }

    trackFieldStarted(fieldName);
  };

  const handleInputBlur = (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const fieldName = event.currentTarget.name as PaymentCustomerFieldName;
    if (fieldName === "email") setIsTypingEmail(false);
    // Settles the value into its normalized form and validates it.
    paymentStore.touchCustomerField(fieldName);

    trackFieldCompleted(fieldName, event.currentTarget.value);
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

    // Enter inside a details step means "continue", not "submit everything".
    if (openStep !== "payment") {
      // Enter in the last field: the buyer is typing, focus may follow.
      handleStepContinue(openStep, "keyboard");
      return;
    }

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

  const emailSuggestion = getEmailSuggestion(paymentStore.customerData.email ?? "", {
    isTyping: isTypingEmail,
  });
  const getInputHint = (fieldName: PaymentCustomerFieldName, hintKey?: string) => {
    if (fieldName === "email" && emailSuggestion) {
      return (
        <EmailSuggestion
          label={t("inputs.email.suggestion")}
          onApply={applyEmailSuggestion}
          suggestion={emailSuggestion}
        />
      );
    }

    return hintKey ? t(hintKey) : undefined;
  };
  const checkoutInputFields: CheckoutFormField[] = visiblePaymentInputs.map(
    (inputConfig, index) => {
      const value = paymentStore.customerData[inputConfig.name] ?? "";

      return {
        ...inputConfig,
        enterKeyHint: getCheckoutEnterKeyHint(index, visiblePaymentInputs.length),
        errorMessage: paymentStore.customerErrors[inputConfig.name] ?? "",
        hint: getInputHint(inputConfig.name, inputConfig.hintKey),
        // The language select starts filled in; a tick there would claim
        // work the buyer has not done.
        isComplete:
          inputConfig.name !== "lessonLanguage" &&
          value.trim().length > 0 &&
          paymentStore.isCustomerFieldValid(inputConfig.name),
        label: t(inputConfig.labelKey),
        placeholder: t(inputConfig.placeholderKey),
        selectOptions: getInputSelectOptions(inputConfig.name),
        value,
      };
    },
  );
  const firstIncompleteField = checkoutInputFields.find(
    (field) => !paymentStore.isCustomerFieldValid(field.name),
  );
  const isStepComplete = (stepId: (typeof PAYMENT_STEPS)[number]) => {
    // A renewal is locked until Telegram confirms the account, whatever the
    // fields hold: the verify button lives in this step, so it stays open.
    if (stepId === "access" && !isRenewalVerified) {
      return false;
    }

    return stepId === "payment"
      ? paymentStore.areAllAgreementsAccepted && !firstIncompleteField
      : checkoutInputFields
          .filter((field) => field.step === stepId)
          .every((field) => paymentStore.isCustomerFieldValid(field.name));
  };
  const isCheckoutReady = PAYMENT_STEPS.every(isStepComplete);
  // Until the buyer touches the form the open step follows the data - a
  // restored draft lands straight on the payment step. From the first focus on
  // it only moves when the buyer asks ("Continue", Enter, "Edit"), so a step
  // never folds away mid-typing the moment its last field turns valid.
  const openStep: PaymentStep =
    openedStep ?? PAYMENT_STEPS.find((stepId) => !isStepComplete(stepId)) ?? "payment";
  const openStepIndex = PAYMENT_STEPS.indexOf(openStep);
  const getStepSummary = (stepId: PaymentStep) => {
    if (stepId === "payment") {
      return t("steps.payment.summary");
    }

    const values = checkoutInputFields
      .filter((field) => field.step === stepId)
      .map((field) =>
        field.selectOptions
          ? (field.selectOptions.find((option) => option.value === field.value)?.label ??
            "")
          : field.value.trim(),
      )
      .filter(Boolean);

    return values.join(" · ");
  };
  const checkoutSteps: CheckoutStepView[] = PAYMENT_STEPS.map((stepId, index) => ({
    // Before Telegram confirms a renewal there is nowhere to continue to.
    canContinue: stepId !== "access" || isRenewalVerified,
    id: stepId,
    isOpen: stepId === openStep,
    meta: stepId === "payment" ? t("steps.payment.meta") : "",
    number: index + 1,
    state: stepId === openStep ? "current" : isStepComplete(stepId) ? "done" : "upcoming",
    summary: getStepSummary(stepId),
    // A renewal opens on the Telegram check, so the first step says so; once
    // confirmed it is the usual "where to send your access".
    title: t(
      stepId === "access" && !isRenewalVerified
        ? "steps.access.titleVerify"
        : `steps.${stepId}.title`,
    ),
  }));
  const stepText =
    isCheckoutReady && openStep === "payment"
      ? t("progress.ready")
      : t("progress.step", { current: openStepIndex + 1, total: PAYMENT_STEPS.length });
  // The bar moves with every answered question, not only per step: each field
  // the buyer has to fill counts once, the agreements count once more.
  const progressItems = [
    ...checkoutInputFields
      .filter((field) => field.name !== "lessonLanguage")
      .map((field) => paymentStore.isCustomerFieldValid(field.name)),
    paymentStore.areAllAgreementsAccepted,
  ];
  const progressRatio =
    progressItems.filter(Boolean).length / Math.max(progressItems.length, 1);

  /**
   * Moves the buyer into a step. Its first open question takes focus only when that
   * will not pop a phone keyboard up uninvited (see shouldMoveCheckoutFocus); the
   * step itself takes it otherwise, so a screen reader follows. The page scrolls
   * only when the step is not already in view.
   */
  const revealStep = (stepId: PaymentStep, intent: CheckoutIntent) => {
    // After the fold/unfold has been committed, so the target is laid out.
    window.requestAnimationFrame(() => {
      const stepElement = document.getElementById(getCheckoutStepId(stepId));
      const focusTarget =
        stepId === "payment"
          ? document.getElementById(CHECKOUT_CONSENT_ID)
          : document.getElementById(
              (
                checkoutInputFields.find(
                  (field) =>
                    field.step === stepId &&
                    !paymentStore.isCustomerFieldValid(field.name),
                ) ?? checkoutInputFields.find((field) => field.step === stepId)
              )?.id ?? "",
            );

      if (shouldMoveCheckoutFocus(intent)) {
        focusTarget?.focus({ preventScroll: true });
      } else {
        stepElement?.focus({ preventScroll: true });
      }
      // The step above is still folding; measured now, the target would be
      // overshot by its height. Measure once the fold has settled.
      window.setTimeout(
        () => stepElement && bringIntoViewIfNeeded(stepElement, "start"),
        prefersReducedMotion() ? 0 : STEP_FOLD_DURATION_MS,
      );
    });
  };

  const handleStepContinue = (stepId: PaymentStep, intent: CheckoutIntent) => {
    if (stepId === "access" && !isRenewalVerified) {
      // Every other field is hidden until the blue button is pressed: the only
      // thing to point at is the handle it verifies.
      paymentStore.touchCustomerField("nickname");
      pointCheckoutField("nickname", intent);
      return;
    }

    const invalidFields = checkoutInputFields.filter(
      (field) => field.step === stepId && !paymentStore.isCustomerFieldValid(field.name),
    );

    if (invalidFields.length > 0) {
      // Shows what is missing right where it is, instead of moving on.
      invalidFields.forEach((field) => paymentStore.touchCustomerField(field.name));
      pointCheckoutField(invalidFields[0].id, intent);
      return;
    }

    // Coming back through "Edit", steps that are already done are not walked
    // through again.
    const nextStep =
      PAYMENT_STEPS.slice(PAYMENT_STEPS.indexOf(stepId) + 1).find(
        (laterStep) => !isStepComplete(laterStep),
      ) ?? "payment";

    if (canUseAnalytics) {
      void trackAnalyticsEvent("checkout_step_completed", {
        ...analyticsCommerceProperties,
        step: stepId,
      });
    }

    setOpenedStep(nextStep);
    revealStep(nextStep, intent);
  };

  const handleStepEdit = (stepId: PaymentStep) => {
    setOpenedStep(stepId);
    revealStep(stepId, "pointer");
  };

  // Telegram has just confirmed a renewal and may have filled the profile in:
  // the buyer is asked to check it, so the receipt details open rather than
  // jumping past them to the payment.
  const previousRenewalStatusRef = useRef(renewalStatus);
  useEffect(() => {
    const previousStatus = previousRenewalStatusRef.current;
    previousRenewalStatusRef.current = renewalStatus;

    if (previousStatus !== "verifying" || renewalStatus !== "verified") {
      return;
    }

    const isAccessFilled = checkoutInputFields
      .filter((field) => field.step === "access")
      .every((field) => paymentStore.isCustomerFieldValid(field.name));

    const nextStep = isAccessFilled ? "billing" : "access";
    setOpenedStep(nextStep);
    // Back from Telegram: on a computer the next empty field takes focus, on a
    // phone the step is only shown, the buyer taps the field when ready.
    revealStep(nextStep, "auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the status change only
  }, [renewalStatus]);
  const privacyPolicyLink = (chunks: ReactNode) => (
    <AgreementLink
      href="/privacy-policy"
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        event.stopPropagation();
        void trackCtaClick(
          { id: "privacy_policy", placement: "checkout_agreement" },
          "/privacy-policy",
        );
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {chunks}
    </AgreementLink>
  );
  const checkoutAgreements: CheckoutAgreement[] = PAYMENT_CHECKBOXES.map(
    (checkboxConfig) => ({
      checked: paymentStore.agreements[checkboxConfig.name],
      disabled: isRenewalCheckout && !isRenewalVerified,
      formName: checkboxConfig.formName,
      name: checkboxConfig.name,
      placeholder:
        checkboxConfig.name === "privacyPolicyAcknowledgement"
          ? t.rich(checkboxConfig.placeholderKey, { link: privacyPolicyLink })
          : t(checkboxConfig.placeholderKey),
    }),
  );
  const consentCopy = {
    acceptAll: (
      <>
        <b>{t("agreements.acceptAll.title")}</b>
        {t.rich("agreements.acceptAll.summary", { link: privacyPolicyLink })}
      </>
    ),
    hideAll: t("agreements.acceptAll.hide"),
    showAll: t("agreements.acceptAll.show", { count: PAYMENT_CHECKBOXES.length }),
  };
  const accessNote = isHubDiscountCheckout
    ? productT(paymentStore.selectedProduct.accessNoteKey)
    : isRenewalCheckout
      ? t(
          isOnlineGroupPlusCheckout
            ? "renewal.summaryCard.accessNotePlus"
            : "renewal.summaryCard.accessNote",
        )
      : productT(
          isOnlineGroupPlusCheckout
            ? "onlineGroupAnnaStrok.accessNotePlus"
            : paymentStore.selectedProduct.accessNoteKey,
        );
  const namedOfferLabel = shouldNameOfferAtCheckout(
    paymentStore.selectedProduct,
    paymentStore.selectedOffer.id,
  )
    ? productT(paymentStore.selectedOffer.labelKey)
    : "";
  const summaryProps: Omit<CheckoutSummaryCardProps, "title"> = {
    amountLabel: t("summary.amountLabel"),
    currencyLabel: t("summary.currencyLabel"),
    // Format/choice copy belongs to the selected offer, not the shared tutorial description.
    descriptionParagraphs: paymentStore.selectedProduct.descriptionKeys
      .filter(
        (key) =>
          !isChoreoTutorialProduct(paymentStore.selectedProduct) ||
          !key.endsWith(".description.3"),
      )
      .map((paragraphKey) => ({
        key: paragraphKey,
        text: productT(paragraphKey),
      })),
    eyebrow: t(isRenewalCheckout ? "summary.eyebrowRenewal" : "summary.eyebrow"),
    formattedPrice: formatCheckoutPrice(
      paymentStore.selectedPrice,
      paymentStore.selectedCurrency,
    ),
    // The access note reads as a checklist: one line per sentence.
    includes: accessNote
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim().replace(/\.$/, ""))
      .filter(Boolean),
    isCurrencyLocked: isPaymentSubmitting,
    isLoading: paymentStore.catalogStatus === "loading",
    isRenewalCheckout,
    offerSummary: namedOfferLabel
      ? t("summary.offerLabel", { offer: namedOfferLabel })
      : null,
    onCurrencyChange: handleCurrencyChange,
    renewalDescription: t(
      isHubDiscountCheckout
        ? "hubDiscount.summaryDescription"
        : "renewal.summaryCard.description",
    ),
    selectedCurrency: paymentStore.selectedCurrency,
    support: {
      href: SUPPORT_TELEGRAM_URL,
      label: t("summary.support.label"),
      title: t("summary.support.title"),
    },
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
    clientSecret: paymentStore.stripeClientSecret,
    hasIntentError: Boolean(paymentStore.stripeIntentError),
    isUpdating: paymentStore.isStripeIntentUpdating,
    onSubmittingChange: setIsPaymentSubmitting,
    paymentIntentId: paymentStore.stripePaymentIntentId,
    resultCurrency: paymentStore.selectedCurrency,
    resultOfferId: paymentStore.selectedOfferId,
    resultOfferCode: paymentStore.selectedOffer.code,
    resultProductId: paymentStore.selectedProductId,
    resultProductCode: paymentStore.selectedProduct.code,
    resultRenewalSlug: renewalSlug || undefined,
    resultValue: paymentStore.selectedPrice,
    isRenewalCheckout,
  };

  return (
    <PaymentSection>
      <InteractiveBox>
        <TextBox>
          <PaymentTitle>{t("title")}</PaymentTitle>
          {!isCheckoutBlocked && (
            <CheckoutProgress>
              <CheckoutProgressTrack
                aria-label={stepText}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.round(progressRatio * 100)}
                role="progressbar"
              >
                <CheckoutProgressFill style={{ transform: `scaleX(${progressRatio})` }} />
              </CheckoutProgressTrack>
              <CheckoutProgressText>
                {stepText}
                {isCheckoutReady ? null : <span> · {t("progress.duration")}</span>}
              </CheckoutProgressText>
            </CheckoutProgress>
          )}
          {!isCheckoutBlocked && isRenewalCheckout ? (
            <PaymentDescription>
              {t(
                isHubDiscountCheckout ? "hubDiscount.description" : "renewal.description",
              )}
            </PaymentDescription>
          ) : null}
        </TextBox>
        {/* With an invalid link the selected product is just the fallback, so
            showing its summary next to the notice would mislead. */}
        {!isCheckoutBlocked && (
          <SummaryBoxMobile>
            <CheckoutSummaryBar
              {...summaryProps}
              progressRatio={progressRatio}
              stepText={stepText}
              title={
                namedOfferLabel
                  ? `${selectedProductCompactTitle} · ${namedOfferLabel}`
                  : selectedProductCompactTitle
              }
            />
          </SummaryBoxMobile>
        )}
        {checkoutBlockReason ? (
          <CheckoutBlockedNotice
            alternativeTariffHref={alternativeTariffHref}
            analyticsCommerceProperties={analyticsCommerceProperties}
            reason={checkoutBlockReason}
            selectedProductCompactTitle={selectedProductCompactTitle}
          />
        ) : (
          <CheckoutForm
            agreements={checkoutAgreements}
            canRevealStripe={canRevealStripe}
            consentCopy={consentCopy}
            fields={checkoutInputFields}
            isPersonalDataLocked={isPaymentSubmitting}
            isRenewalCheckout={isRenewalCheckout}
            isRenewalVerified={isRenewalVerified}
            onAcceptAllChange={handleAcceptAllChange}
            onAgreementChange={handleAgreementChange}
            onInputBlur={handleInputBlur}
            onInputChange={handleInputChange}
            onInputFocus={handleInputFocus}
            onSubmit={handleSubmit}
            paymentLockedCopy={{
              text: t("paymentLocked.text"),
              title: t("paymentLocked.title"),
            }}
            renewal={{
              clientId: renewalClientId,
              nonce: renewalNonce,
              onVerify: verifyTelegramRenewal,
              status: renewalStatus,
              statusText:
                isHubDiscountCheckout && renewalStatus === "not_member" ? (
                  // П17: the same Hub at full price, in the currency already chosen.
                  <>
                    {t("hubDiscount.notEligible")}{" "}
                    <AgreementLink
                      href={hubFullPriceHref}
                      onClick={() => {
                        void trackCtaClick(
                          {
                            id: "hub_discount_full_price",
                            placement: "hub_discount_not_eligible",
                            currency: paymentStore.selectedCurrency,
                            offer_id: INSPIRATION_HUB_ACCESS_OFFER_ID,
                            product_id: paymentStore.selectedProduct.id,
                          },
                          hubFullPriceHref,
                        );
                      }}
                    >
                      {t("hubDiscount.fullPriceLink")}
                    </AgreementLink>
                  </>
                ) : (
                  renewalStatusText
                ),
              statusTone: renewalStatusTone,
            }}
            onRetryPaymentPreparation={
              paymentStore.stripeIntentError ? handleRetryPaymentPreparation : undefined
            }
            retryLabel={commonT("tryAgain")}
            onStepContinue={handleStepContinue}
            onStepEdit={handleStepEdit}
            stepCopy={{ continue: t("steps.continue"), edit: t("steps.edit") }}
            steps={checkoutSteps}
            stripeIntentErrorText={stripeIntentErrorText}
            stripeProps={stripeProps}
            verifyLabel={t("renewal.buttons.verify")}
          />
        )}
      </InteractiveBox>
      {!isCheckoutBlocked && (
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
