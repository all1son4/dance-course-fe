"use client";

import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent, FocusEvent, FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import InteractiveCard from "@/components/cards/InteractiveCard";
import Checkbox from "@/components/common/Checkbox";
import { useCookieConsent } from "@/components/common/CookieConsent/CookieConsentProvider";
import Input from "@/components/common/Input";
import CurrencySwitch from "@/components/other/CurrencySwitch";
import StripePaymentTabs from "@/components/other/StripePaymentTabs";
import {
  type CountryOption,
  getFallbackCountryOptions,
  getLocalizedCountryOptions,
} from "@/constants/countries";
import {
  formatCheckoutPrice,
  getDefaultCheckoutCurrencyByLocale,
  getResolvedCheckoutCurrency,
  type SellableProduct,
  type SupportedCheckoutCurrency,
} from "@/constants/sellable-products";
import { ensureLocationChangeEvents, LOCATION_CHANGE_EVENT } from "@/lib/location-change";
import { PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY } from "@/lib/payment-draft";
import { usePaymentStore } from "@/stores";
import type { PaymentCheckoutDraft } from "@/stores/payment-store";

import {
  AdditionalNotification,
  AgreementLink,
  Checkboxes,
  CurrencyBox,
  FormBox,
  InputField,
  Inputs,
  InteractiveBox,
  MoneyTitle,
  PaymentDescription,
  PaymentPreparationError,
  PaymentSection,
  PaymentTitle,
  PersonalData,
  PersonalDataTitle,
  Price,
  PriceBox,
  StripeReveal,
  SummaryBottomContent,
  SummaryBoxDesktop,
  SummaryBoxMobile,
  SummaryBoxParahraphs,
  SummaryTopContent,
  TelegramInputControl,
  TelegramInputStatus,
  TelegramVerifyButton,
  TextBox,
} from "./page.styles";
import {
  PAYMENT_CHECKBOXES,
  PAYMENT_INPUTS,
  PAYMENT_LESSON_LANGUAGE_OPTIONS,
  type PaymentAgreementFieldName,
  type PaymentCustomerFieldName,
} from "./payment.constants";
import { resolvePaymentValidationLocale } from "./payment.validation";

const getCompactSummaryTitle = (fullTitle: string) => {
  const quotedNameMatch = fullTitle.match(/["“”«»]([^"“”«»]+)["“”«»]/u);

  return quotedNameMatch?.[1]?.trim() || fullTitle;
};

const PAYMENT_DRAFT_SAVE_DEBOUNCE_MS = 240;
const LEGACY_NAVIGATION_TYPE_RELOAD = 1;
const TELEGRAM_LOGIN_SCRIPT_SRC = "https://telegram.org/js/telegram-login.js";
let telegramLoginScriptPromise: Promise<void> | null = null;
const formatTelegramUsernameInput = (value: string) => {
  const normalizedUsername = value.trim().replace(/^@/, "");

  return normalizedUsername ? `@${normalizedUsername}` : "";
};

const TelegramPlaneIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <path
      d="M20.6 4.4 3.9 10.9c-1.1.4-1.1 1.1-.2 1.4l4.3 1.3 1.6 5c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.1-2 4.4 3.2c.8.4 1.3.2 1.5-.8l2.7-12.7c.3-1.2-.4-1.7-1.4-1.2Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    />
    <path
      d="m8 13.6 9.8-6.1-7.6 7.3"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    />
  </svg>
);

type SellableProductsCatalogResponse = {
  products?: SellableProduct[];
};
type RenewalCampaignResponse = {
  campaign?: {
    offerId: string;
    productId: string;
    slug: string;
    sourceChatTitle: string;
    targetChatTitle: string;
    title: string;
  };
  clientId?: string;
  errorCode?: string;
  status?: string;
  telegramUser?: {
    id: string;
    name: string;
    username: string;
  } | null;
  verified?: boolean;
};
type TelegramLoginResult = {
  error?: string;
  id_token?: string;
};
type RenewalVerificationResponse = {
  customerProfile?: {
    address: string;
    city: string;
    country: string;
    email: string;
    fullName: string;
    nickname: string;
    postalCode: string;
  } | null;
  errorCode?: string;
  status?: "not_member" | "verified";
  telegramUser?: {
    id: string;
    name: string;
    username: string;
  };
};

declare global {
  interface Window {
    Telegram?: {
      Login?: {
        auth: (
          options: {
            client_id: number;
            lang?: string;
            scope?: string[];
          },
          callback: (result: TelegramLoginResult) => void,
        ) => void;
      };
    };
  }
}

const isReloadNavigation = () => {
  if (typeof window === "undefined" || typeof window.performance === "undefined") {
    return false;
  }

  const [navigationEntry] = window.performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];

  if (navigationEntry?.type) {
    return navigationEntry.type === "reload";
  }

  const legacyNavigation = (
    window.performance as Performance & {
      navigation?: {
        type?: number;
      };
    }
  ).navigation;

  return legacyNavigation?.type === LEGACY_NAVIGATION_TYPE_RELOAD;
};

const loadTelegramLoginScript = () => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window_unavailable"));
  }

  if (window.Telegram?.Login?.auth) {
    return Promise.resolve();
  }

  if (telegramLoginScriptPromise) {
    return telegramLoginScriptPromise;
  }

  telegramLoginScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${TELEGRAM_LOGIN_SCRIPT_SRC}"]`,
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("telegram_login_script_failed")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = TELEGRAM_LOGIN_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("telegram_login_script_failed"));
    document.head.appendChild(script);
  }).catch((error) => {
    telegramLoginScriptPromise = null;
    throw error;
  });

  return telegramLoginScriptPromise;
};

const PaymentPage = observer(function PaymentPage() {
  const paymentStore = usePaymentStore();
  const { canUseFunctionalStorage } = useCookieConsent();
  const locale = useLocale();
  const t = useTranslations("PaymentPage");
  const productT = useTranslations("SellableProducts");
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>(
    getFallbackCountryOptions,
  );
  const [searchKey, setSearchKey] = useState("");
  const [renewalClientId, setRenewalClientId] = useState("");
  const [renewalStatus, setRenewalStatus] = useState<
    "error" | "idle" | "loading" | "not_member" | "ready" | "verified" | "verifying"
  >("idle");
  const [renewalStatusText, setRenewalStatusText] = useState("");
  const hasHydratedCheckoutDraftRef = useRef(false);
  const isChoreoProduct = paymentStore.selectedProduct.type === "choreo";
  const isOnlineGroupCheckout =
    paymentStore.selectedProduct.code === "online-group-anna-strok";
  const lessonLanguageOptions = PAYMENT_LESSON_LANGUAGE_OPTIONS.map((option) => ({
    label: t(option.labelKey),
    value: option.value,
  }));
  const selectedProductTitle = productT(paymentStore.selectedProduct.titleKey);
  const renewalSlug = new URLSearchParams(searchKey).get("renewal")?.trim() ?? "";
  const isRenewalCheckout = Boolean(renewalSlug);
  const summaryCardTitle = selectedProductTitle;
  const selectedProductCompactTitle = getCompactSummaryTitle(summaryCardTitle);
  const productPaymentInputs = isChoreoProduct
    ? PAYMENT_INPUTS
    : PAYMENT_INPUTS.filter((inputConfig) => inputConfig.name !== "lessonLanguage");
  const visiblePaymentInputs = isRenewalCheckout
    ? [...productPaymentInputs].sort((left, right) => {
        if (left.name === "nickname") return -1;
        if (right.name === "nickname") return 1;
        return 0;
      })
    : productPaymentInputs;
  const isRenewalVerified = !isRenewalCheckout || renewalStatus === "verified";
  const canRevealStripe = paymentStore.canShowStripe && isRenewalVerified;
  const renewalStatusTone =
    renewalStatus === "verified"
      ? "success"
      : renewalStatus === "error" || renewalStatus === "not_member"
        ? "error"
        : "info";
  const stripeIntentErrorText = paymentStore.stripeIntentError
    ? t(
        {
          missing_client_secret: "errors.missingClientSecret",
          missing_secret_key: "errors.missingSecretKey",
          online_group_campaign_not_configured: "errors.onlineGroupCampaignNotConfigured",
          payment_intent_failed: "errors.paymentIntentFailed",
          payment_intent_request_failed: "errors.paymentIntentRequestFailed",
          renewal_campaign_inactive: "errors.renewalCampaignInactive",
          renewal_payment_context_mismatch: "errors.renewalPaymentContextMismatch",
          telegram_renewal_verification_required:
            "errors.telegramRenewalVerificationRequired",
        }[paymentStore.stripeIntentError] ?? "errors.paymentIntentRequestFailed",
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
    document.body.removeAttribute("data-hide-footer");
  }, []);

  useEffect(() => {
    const requestController = new AbortController();

    void fetch("/api/catalog/sellable-products", {
      signal: requestController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as SellableProductsCatalogResponse;
      })
      .then((data) => {
        if (data?.products?.length) {
          paymentStore.setSellableProducts(data.products);
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.warn("Failed to load sellable products catalog", error);
      });

    return () => {
      requestController.abort();
    };
  }, [paymentStore]);

  useEffect(() => {
    paymentStore.setValidationLocale(locale);
    paymentStore.initializeCheckoutCurrency(getDefaultCheckoutCurrencyByLocale(locale));
  }, [locale, paymentStore]);

  useEffect(() => {
    setCountryOptions(getLocalizedCountryOptions(locale));
  }, [locale]);

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
    const searchParams = new URLSearchParams(searchKey);
    const queryCurrency = searchParams.get("currency");

    if (!queryCurrency) {
      return;
    }

    const nextCurrency = getResolvedCheckoutCurrency(queryCurrency);
    paymentStore.setSelectedCurrency(nextCurrency);
  }, [paymentStore, searchKey]);

  useEffect(() => {
    if (!renewalSlug) {
      setRenewalClientId("");
      setRenewalStatus("idle");
      setRenewalStatusText("");
      return;
    }

    const requestController = new AbortController();
    const searchParams = new URLSearchParams({
      checkoutSessionId: paymentStore.checkoutSessionId,
      slug: renewalSlug,
    });

    setRenewalStatus("loading");
    setRenewalStatusText(t("renewal.status.loading"));

    void fetch(`/api/telegram/renewal?${searchParams.toString()}`, {
      cache: "no-store",
      signal: requestController.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as RenewalCampaignResponse;

        if (!response.ok || data.status !== "ready" || !data.campaign) {
          throw new Error(data.errorCode ?? "renewal_campaign_load_failed");
        }

        const verifiedUsername = formatTelegramUsernameInput(
          data.telegramUser?.username ?? "",
        );

        if (data.verified && verifiedUsername) {
          paymentStore.setCustomerField("nickname", verifiedUsername, {
            skipStripeIntentReset: true,
          });
        }

        setRenewalClientId(data.clientId ?? "");
        setRenewalStatus(data.verified ? "verified" : "ready");
        setRenewalStatusText(
          data.verified ? t("renewal.status.verified") : t("renewal.status.ready"),
        );
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setRenewalClientId("");
        setRenewalStatus("error");
        setRenewalStatusText(t("renewal.status.loadFailed"));
      });

    return () => {
      requestController.abort();
    };
  }, [paymentStore, paymentStore.checkoutSessionId, renewalSlug, t]);

  useEffect(() => {
    if (
      hasHydratedCheckoutDraftRef.current ||
      typeof window === "undefined" ||
      !canUseFunctionalStorage
    ) {
      return;
    }

    hasHydratedCheckoutDraftRef.current = true;

    // Drafts are a reload-only safety net. A fresh visit should start a new checkout
    // session, while a browser refresh should keep typed customer data intact.
    if (!isReloadNavigation()) {
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
  }, [canUseFunctionalStorage, locale, paymentStore]);

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
    }, 420);

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

  useEffect(() => {
    return () => {
      paymentStore.resetCheckoutForm();
    };
  }, [paymentStore]);

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    paymentStore.setCustomerField(
      event.target.name as PaymentCustomerFieldName,
      event.target.value,
    );
  };

  const handleInputBlur = (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    paymentStore.touchCustomerField(event.target.name as PaymentCustomerFieldName);
  };

  const handleAgreementChange =
    (fieldName: PaymentAgreementFieldName) => (event: ChangeEvent<HTMLInputElement>) => {
      paymentStore.setAgreement(fieldName, event.target.checked);
    };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    paymentStore.validateCustomerForm();
  };

  const handleCurrencyChange = (value: SupportedCheckoutCurrency) => {
    paymentStore.setSelectedCurrency(value);
  };

  const handleTelegramRenewalVerification = async () => {
    const numericClientId = Number(renewalClientId);
    const claimedUsername = paymentStore.customerData.nickname.trim();

    if (
      !renewalSlug ||
      !/^@[A-Za-z0-9_]{1,32}$/.test(claimedUsername) ||
      !Number.isFinite(numericClientId) ||
      renewalStatus === "loading" ||
      renewalStatus === "verifying"
    ) {
      return;
    }

    setRenewalStatus("verifying");
    setRenewalStatusText(t("renewal.status.openingTelegram"));

    try {
      await loadTelegramLoginScript();

      if (!window.Telegram?.Login?.auth) {
        throw new Error("telegram_login_unavailable");
      }

      const idToken = await new Promise<string>((resolve, reject) => {
        window.Telegram?.Login?.auth(
          {
            client_id: numericClientId,
            lang: locale,
            scope: ["profile"],
          },
          (result) => {
            if (result.error) {
              reject(new Error(result.error));
              return;
            }

            if (!result.id_token) {
              reject(new Error("missing_telegram_id_token"));
              return;
            }

            resolve(result.id_token);
          },
        );
      });

      setRenewalStatusText(t("renewal.status.checkingMembership"));

      const response = await fetch("/api/telegram/renewal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          claimedUsername,
          checkoutSessionId: paymentStore.checkoutSessionId,
          idToken,
          slug: renewalSlug,
        }),
        cache: "no-store",
      });
      const data = (await response.json()) as RenewalVerificationResponse;

      if (!response.ok || data.status !== "verified") {
        if (data.errorCode === "telegram_username_mismatch") {
          setRenewalStatus("error");
          setRenewalStatusText(t("renewal.status.usernameMismatch"));
          return;
        }

        if (
          data.status === "not_member" ||
          data.errorCode === "telegram_user_not_in_source_chat"
        ) {
          setRenewalStatus("not_member");
          setRenewalStatusText(t("renewal.status.notMember"));
          return;
        }

        throw new Error(data.errorCode ?? "telegram_renewal_verification_failed");
      }

      setRenewalStatus("verified");
      const profileFields = [
        "fullName",
        "email",
        "address",
        "city",
        "postalCode",
        "country",
      ] as const;
      let hasPrefilledProfile = false;

      profileFields.forEach((fieldName) => {
        const value = data.customerProfile?.[fieldName]?.trim() ?? "";

        if (!value || paymentStore.customerData[fieldName].trim()) {
          return;
        }

        paymentStore.setCustomerField(fieldName, value, {
          skipStripeIntentReset: true,
        });
        hasPrefilledProfile = true;
      });

      const verifiedNickname = formatTelegramUsernameInput(
        data.telegramUser?.username?.trim() ||
          data.customerProfile?.nickname?.trim() ||
          "",
      );

      setRenewalStatusText(
        verifiedNickname
          ? t(
              hasPrefilledProfile
                ? "renewal.status.verifiedAsWithProfile"
                : "renewal.status.verifiedAs",
              {
                username: verifiedNickname,
              },
            )
          : t("renewal.status.verified"),
      );

      if (verifiedNickname) {
        paymentStore.setCustomerField("nickname", verifiedNickname, {
          skipStripeIntentReset: true,
        });
      }
    } catch {
      setRenewalStatus("error");
      setRenewalStatusText(t("renewal.status.failed"));
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

  const summaryTopContent = (
    <SummaryTopContent>
      <SummaryBoxParahraphs>
        {isRenewalCheckout ? (
          <p>{t("renewal.summaryCard.description")}</p>
        ) : (
          paymentStore.selectedProduct.descriptionKeys.map((paragraphKey) => (
            <p key={paragraphKey}>{productT(paragraphKey)}</p>
          ))
        )}
        {isOnlineGroupCheckout ? (
          <p>
            {t("summary.offerLabel", {
              offer: productT(paymentStore.selectedOffer.labelKey),
            })}
          </p>
        ) : null}
      </SummaryBoxParahraphs>
      <AdditionalNotification>
        {isRenewalCheckout
          ? t("renewal.summaryCard.accessNote")
          : productT(paymentStore.selectedProduct.accessNoteKey)}
      </AdditionalNotification>
    </SummaryTopContent>
  );

  const summaryBottomContent = (
    <SummaryBottomContent>
      <CurrencyBox>
        <MoneyTitle>{t("summary.currencyLabel")}</MoneyTitle>
        <CurrencySwitch
          onChange={handleCurrencyChange}
          value={paymentStore.selectedCurrency}
          width="160px"
        />
      </CurrencyBox>
      <PriceBox>
        <MoneyTitle>{t("summary.amountLabel")}</MoneyTitle>
        <Price>
          {formatCheckoutPrice(paymentStore.selectedPrice, paymentStore.selectedCurrency)}
        </Price>
      </PriceBox>
    </SummaryBottomContent>
  );

  const interactiveCardDesktopComponent = (
    <InteractiveCard
      title={summaryCardTitle}
      topRowContent={summaryTopContent}
      bottomRowContent={summaryBottomContent}
    />
  );

  const interactiveCardMobileComponent = (
    <InteractiveCard
      title={selectedProductCompactTitle}
      topRowContent={summaryTopContent}
      bottomRowContent={summaryBottomContent}
      isTopRowCollapsible
      defaultCollapseTopRow
    />
  );

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
        <SummaryBoxMobile>{interactiveCardMobileComponent}</SummaryBoxMobile>
        <FormBox onSubmit={handleSubmit}>
          <PersonalData>
            <PersonalDataTitle>{t("personalDataTitle")}</PersonalDataTitle>
            <Inputs>
              {visiblePaymentInputs.map((inputConfig) => {
                const inputNode = (
                  <Input
                    errorMessage={paymentStore.customerErrors[inputConfig.name] ?? ""}
                    id={inputConfig.id}
                    label={t(inputConfig.labelKey)}
                    name={inputConfig.name}
                    disabled={
                      isRenewalCheckout &&
                      (inputConfig.name === "nickname"
                        ? renewalStatus === "verified" || renewalStatus === "verifying"
                        : !isRenewalVerified)
                    }
                    onBlur={handleInputBlur}
                    onChange={handleInputChange}
                    placeholder={t(inputConfig.placeholderKey)}
                    selectOptions={getInputSelectOptions(inputConfig.name)}
                    type={inputConfig.type}
                    value={paymentStore.customerData[inputConfig.name] ?? ""}
                  />
                );

                if (inputConfig.name !== "nickname" || !isRenewalCheckout) {
                  return (
                    <InputField
                      key={inputConfig.name}
                      $layout={inputConfig.layout ?? "full"}
                    >
                      {inputNode}
                    </InputField>
                  );
                }

                return (
                  <InputField
                    key={inputConfig.name}
                    $layout={inputConfig.layout ?? "full"}
                  >
                    <TelegramInputControl $status={renewalStatus}>
                      {inputNode}
                      <TelegramVerifyButton
                        aria-label={t("renewal.buttons.verify")}
                        disabled={
                          renewalStatus === "loading" ||
                          renewalStatus === "verified" ||
                          renewalStatus === "verifying" ||
                          !renewalClientId ||
                          !/^@[A-Za-z0-9_]{1,32}$/.test(
                            paymentStore.customerData.nickname.trim(),
                          )
                        }
                        onClick={handleTelegramRenewalVerification}
                        title={t("renewal.buttons.verify")}
                        type="button"
                        $isVerified={renewalStatus === "verified"}
                      >
                        <TelegramPlaneIcon />
                      </TelegramVerifyButton>
                    </TelegramInputControl>
                    {renewalStatusText && (
                      <TelegramInputStatus $tone={renewalStatusTone}>
                        {renewalStatusText}
                      </TelegramInputStatus>
                    )}
                  </InputField>
                );
              })}
            </Inputs>
            <Checkboxes>
              {PAYMENT_CHECKBOXES.map((checkboxConfig) => (
                <Checkbox
                  key={checkboxConfig.name}
                  checked={paymentStore.agreements[checkboxConfig.name]}
                  disabled={isRenewalCheckout && !isRenewalVerified}
                  name={checkboxConfig.formName}
                  onChange={handleAgreementChange(checkboxConfig.name)}
                  placeholder={
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
                      : t(checkboxConfig.placeholderKey)
                  }
                />
              ))}
            </Checkboxes>
          </PersonalData>
          {stripeIntentErrorText ? (
            <PaymentPreparationError>{stripeIntentErrorText}</PaymentPreparationError>
          ) : null}
          <StripeReveal $isVisible={canRevealStripe}>
            <StripePaymentTabs
              key={paymentStore.selectedCurrency}
              allPaymentIntentIds={Object.values(paymentStore.stripePaymentIntentIds)}
              billingCountry={paymentStore.customerData.country}
              billingEmail={paymentStore.customerData.email}
              billingName={paymentStore.customerData.fullName.trim()}
              billingAddressLine1={paymentStore.customerData.address}
              billingCity={paymentStore.customerData.city}
              billingPostalCode={paymentStore.customerData.postalCode}
              checkoutSessionId={paymentStore.checkoutSessionId}
              clientSecret={
                paymentStore.stripeClientSecrets?.[paymentStore.selectedCurrency] ?? ""
              }
              paymentIntentId={
                paymentStore.stripePaymentIntentIds?.[paymentStore.selectedCurrency] ?? ""
              }
              resultCurrency={paymentStore.selectedCurrency}
              resultOfferId={paymentStore.selectedOfferId}
              resultProductId={paymentStore.selectedProductId}
            />
          </StripeReveal>
        </FormBox>
      </InteractiveBox>
      <SummaryBoxDesktop>{interactiveCardDesktopComponent}</SummaryBoxDesktop>
    </PaymentSection>
  );
});

export default PaymentPage;
