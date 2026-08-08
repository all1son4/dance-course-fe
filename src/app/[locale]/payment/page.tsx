"use client";

import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent, FocusEvent, FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import InteractiveCard from "@/components/cards/InteractiveCard";
import Checkbox from "@/components/common/Checkbox";
import { useCookieConsent } from "@/components/common/CookieConsent/CookieConsentProvider";
import Input from "@/components/common/Input";
import CurrencySwitch from "@/components/other/CurrencySwitch";
import StripePaymentTabs, {
  type StripePaymentTabsProps,
} from "@/components/other/StripePaymentTabs";
import {
  type CountryOption,
  getFallbackCountryOptions,
  getLocalizedCountryOptions,
} from "@/constants/countries";
import {
  formatCheckoutPrice,
  getDefaultCheckoutCurrencyByLocale,
  getResolvedCheckoutCurrency,
  isOnlineGroupLibraryOfferId,
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
  type PaymentCustomerData,
  type PaymentCustomerFieldName,
  type PaymentInputConfig,
} from "./payment.constants";
import { resolvePaymentValidationLocale } from "./payment.validation";

const getCompactSummaryTitle = (fullTitle: string) => {
  const quotedNameMatch = fullTitle.match(/["“”«»]([^"“”«»]+)["“”«»]/u);

  return quotedNameMatch?.[1]?.trim() || fullTitle;
};

const PAYMENT_DRAFT_SAVE_DEBOUNCE_MS = 240;
const PAYMENT_INTENT_CREATION_DELAY_MS = 420;
const POST_VERIFICATION_FOCUS_DELAY_MS = 120;
const LEGACY_NAVIGATION_TYPE_RELOAD = 1;
const TELEGRAM_LOGIN_SCRIPT_SRC = "https://telegram.org/js/telegram-login.js";
const TELEGRAM_USERNAME_PATTERN = /^@[A-Za-z0-9_]{1,32}$/;
const PAYMENT_API_ENDPOINTS = {
  catalog: "/api/catalog/sellable-products",
  telegramRenewal: "/api/telegram/renewal",
} as const;
const RENEWAL_PROFILE_FIELDS = [
  "fullName",
  "email",
  "address",
  "city",
  "postalCode",
  "country",
] as const satisfies readonly PaymentCustomerFieldName[];
const STRIPE_INTENT_ERROR_TRANSLATION_KEYS = {
  catalog_unavailable: "errors.catalogUnavailable",
  missing_client_secret: "errors.missingClientSecret",
  missing_secret_key: "errors.missingSecretKey",
  online_group_campaign_not_configured: "errors.onlineGroupCampaignNotConfigured",
  payment_intent_failed: "errors.paymentIntentFailed",
  payment_intent_request_failed: "errors.paymentIntentRequestFailed",
  renewal_campaign_inactive: "errors.renewalCampaignInactive",
  renewal_payment_context_mismatch: "errors.renewalPaymentContextMismatch",
  telegram_renewal_verification_required: "errors.telegramRenewalVerificationRequired",
} as const;

let telegramLoginScriptPromise: Promise<void> | null = null;

type RenewalStatus =
  | "error"
  | "idle"
  | "loading"
  | "not_member"
  | "ready"
  | "verified"
  | "verifying";
type RenewalStatusTone = "error" | "info" | "success";
type SelectOption = {
  label: string;
  value: string;
};
type CheckoutInputField = PaymentInputConfig & {
  errorMessage: string;
  label: string;
  placeholder: string;
  selectOptions?: SelectOption[];
  value: string;
};
type CheckoutAgreement = {
  checked: boolean;
  disabled: boolean;
  formName: string;
  name: PaymentAgreementFieldName;
  placeholder: ReactNode;
};

const formatTelegramUsernameInput = (value: string) => {
  const normalizedUsername = value.trim().replace(/^@/, "");

  return normalizedUsername ? `@${normalizedUsername}` : "";
};

const getVisiblePaymentInputs = ({
  isChoreoProduct,
  isRenewalCheckout,
}: {
  isChoreoProduct: boolean;
  isRenewalCheckout: boolean;
}): PaymentInputConfig[] => {
  const productInputs = isChoreoProduct
    ? PAYMENT_INPUTS
    : PAYMENT_INPUTS.filter((inputConfig) => inputConfig.name !== "lessonLanguage");

  if (!isRenewalCheckout) {
    return productInputs;
  }

  // Sort a copy so the shared field configuration remains immutable across checkouts.
  return [...productInputs].sort((left, right) => {
    if (left.name === "nickname") {
      return -1;
    }

    if (right.name === "nickname") {
      return 1;
    }

    return 0;
  });
};

const resolveRenewalStatusTone = (status: RenewalStatus): RenewalStatusTone => {
  if (status === "verified") {
    return "success";
  }

  return status === "error" || status === "not_member" ? "error" : "info";
};

const isRenewalInputDisabled = ({
  fieldName,
  isRenewalCheckout,
  isRenewalVerified,
  renewalStatus,
}: {
  fieldName: PaymentCustomerFieldName;
  isRenewalCheckout: boolean;
  isRenewalVerified: boolean;
  renewalStatus: RenewalStatus;
}) => {
  if (!isRenewalCheckout) {
    return false;
  }

  return fieldName === "nickname"
    ? renewalStatus === "verified" || renewalStatus === "verifying"
    : !isRenewalVerified;
};

const isTelegramVerificationDisabled = ({
  clientId,
  nickname,
  nonce,
  status,
}: {
  clientId: string;
  nickname: string;
  nonce: string;
  status: RenewalStatus;
}) =>
  status === "loading" ||
  status === "verified" ||
  status === "verifying" ||
  !clientId ||
  !nonce ||
  !TELEGRAM_USERNAME_PATTERN.test(nickname.trim());

const canStartTelegramRenewalVerification = ({
  claimedUsername,
  clientId,
  nonce,
  slug,
  status,
}: {
  claimedUsername: string;
  clientId: number;
  nonce: string;
  slug: string;
  status: RenewalStatus;
}) =>
  Boolean(slug) &&
  Boolean(nonce) &&
  TELEGRAM_USERNAME_PATTERN.test(claimedUsername) &&
  Number.isFinite(clientId) &&
  status !== "loading" &&
  status !== "verifying";

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
  errorCode?: "catalog_unavailable";
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
  nonce?: string;
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

type RenewalVerificationFailure =
  | {
      kind: "error";
      errorCode: string;
    }
  | {
      kind: "status";
      messageKey: "renewal.status.notMember" | "renewal.status.usernameMismatch";
      status: "error" | "not_member";
    };

const resolveRenewalVerificationFailure = ({
  data,
  isSuccessful,
}: {
  data: RenewalVerificationResponse;
  isSuccessful: boolean;
}): RenewalVerificationFailure | null => {
  if (isSuccessful) {
    return null;
  }

  if (data.errorCode === "telegram_username_mismatch") {
    return {
      kind: "status",
      messageKey: "renewal.status.usernameMismatch",
      status: "error",
    };
  }

  if (
    data.status === "not_member" ||
    data.errorCode === "telegram_user_not_in_source_chat"
  ) {
    return {
      kind: "status",
      messageKey: "renewal.status.notMember",
      status: "not_member",
    };
  }

  return {
    kind: "error",
    errorCode: data.errorCode ?? "telegram_renewal_verification_failed",
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
            nonce?: string;
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

const requestTelegramIdToken = ({
  clientId,
  locale,
  nonce,
}: {
  clientId: number;
  locale: string;
  nonce: string;
}) =>
  new Promise<string>((resolve, reject) => {
    window.Telegram?.Login?.auth(
      {
        client_id: clientId,
        lang: locale,
        nonce,
        scope: ["profile"],
      },
      (result) => {
        window.focus();

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

const verifyRenewalTelegramMembership = async ({
  checkoutSessionId,
  claimedUsername,
  idToken,
  nonce,
  slug,
}: {
  checkoutSessionId: string;
  claimedUsername: string;
  idToken: string;
  nonce: string;
  slug: string;
}) => {
  const response = await fetch(PAYMENT_API_ENDPOINTS.telegramRenewal, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      claimedUsername,
      checkoutSessionId,
      idToken,
      nonce,
      slug,
    }),
    cache: "no-store",
  });
  const data = (await response.json()) as RenewalVerificationResponse;

  return {
    data,
    isSuccessful: response.ok && data.status === "verified",
  };
};

type PaymentStoreInstance = ReturnType<typeof usePaymentStore>;

const prefillRenewalCustomerProfile = (
  paymentStore: PaymentStoreInstance,
  customerProfile: RenewalVerificationResponse["customerProfile"],
) => {
  let hasPrefilledProfile = false;

  RENEWAL_PROFILE_FIELDS.forEach((fieldName) => {
    const value = customerProfile?.[fieldName]?.trim() ?? "";

    if (!value || paymentStore.customerData[fieldName].trim()) {
      return;
    }

    paymentStore.setCustomerField(fieldName, value, {
      skipStripeIntentReset: true,
    });
    hasPrefilledProfile = true;
  });

  return hasPrefilledProfile;
};

const focusNextCheckoutControl = ({
  customerData,
  inputs,
}: {
  customerData: PaymentCustomerData;
  inputs: PaymentInputConfig[];
}) => {
  window.focus();

  const nextField = inputs.find(
    ({ name }) => name !== "nickname" && !customerData[name].trim(),
  );
  const nextControl = nextField
    ? document.getElementById(nextField.id)
    : document.querySelector<HTMLInputElement>('input[name="immediate_access_consent"]');

  if (
    nextControl instanceof HTMLInputElement ||
    nextControl instanceof HTMLSelectElement
  ) {
    nextControl.focus({ preventScroll: true });
    nextControl.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }
};

type CheckoutSummaryCardProps = {
  accessNote: string;
  amountLabel: string;
  currencyLabel: string;
  descriptionParagraphs: Array<{
    key: string;
    text: string;
  }>;
  formattedPrice: string;
  isMobile?: boolean;
  isRenewalCheckout: boolean;
  offerSummary: string | null;
  onCurrencyChange: (value: SupportedCheckoutCurrency) => void;
  renewalDescription: string;
  selectedCurrency: SupportedCheckoutCurrency;
  title: string;
};

const CheckoutSummaryCard = ({
  accessNote,
  amountLabel,
  currencyLabel,
  descriptionParagraphs,
  formattedPrice,
  isMobile = false,
  isRenewalCheckout,
  offerSummary,
  onCurrencyChange,
  renewalDescription,
  selectedCurrency,
  title,
}: CheckoutSummaryCardProps) => {
  const topRowContent = (
    <SummaryTopContent>
      <SummaryBoxParahraphs>
        {isRenewalCheckout ? (
          <p>{renewalDescription}</p>
        ) : (
          descriptionParagraphs.map((paragraph) => (
            <p key={paragraph.key}>{paragraph.text}</p>
          ))
        )}
        {offerSummary ? <p>{offerSummary}</p> : null}
      </SummaryBoxParahraphs>
      <AdditionalNotification>{accessNote}</AdditionalNotification>
    </SummaryTopContent>
  );
  const bottomRowContent = (
    <SummaryBottomContent>
      <CurrencyBox>
        <MoneyTitle>{currencyLabel}</MoneyTitle>
        <CurrencySwitch
          onChange={onCurrencyChange}
          value={selectedCurrency}
          width="160px"
        />
      </CurrencyBox>
      <PriceBox>
        <MoneyTitle>{amountLabel}</MoneyTitle>
        <Price>{formattedPrice}</Price>
      </PriceBox>
    </SummaryBottomContent>
  );

  return (
    <InteractiveCard
      title={title}
      topRowContent={topRowContent}
      bottomRowContent={bottomRowContent}
      isTopRowCollapsible={isMobile || undefined}
      defaultCollapseTopRow={isMobile || undefined}
    />
  );
};

type CheckoutInputProps = {
  field: CheckoutInputField;
  isRenewalCheckout: boolean;
  isRenewalVerified: boolean;
  onBlur: (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onVerify: () => void | Promise<void>;
  renewalClientId: string;
  renewalNonce: string;
  renewalStatus: RenewalStatus;
  renewalStatusText: string;
  renewalStatusTone: RenewalStatusTone;
  verifyLabel: string;
};

const CheckoutInput = ({
  field,
  isRenewalCheckout,
  isRenewalVerified,
  onBlur,
  onChange,
  onVerify,
  renewalClientId,
  renewalNonce,
  renewalStatus,
  renewalStatusText,
  renewalStatusTone,
  verifyLabel,
}: CheckoutInputProps) => {
  const inputNode = (
    <Input
      errorMessage={field.errorMessage}
      id={field.id}
      label={field.label}
      name={field.name}
      disabled={isRenewalInputDisabled({
        fieldName: field.name,
        isRenewalCheckout,
        isRenewalVerified,
        renewalStatus,
      })}
      onBlur={onBlur}
      onChange={onChange}
      placeholder={field.placeholder}
      selectOptions={field.selectOptions}
      type={field.type}
      value={field.value}
    />
  );
  const isRenewalNickname = field.name === "nickname" && isRenewalCheckout;

  return (
    <InputField $layout={field.layout ?? "full"}>
      {isRenewalNickname ? (
        <>
          <TelegramInputControl $status={renewalStatus}>
            {inputNode}
            <TelegramVerifyButton
              aria-label={verifyLabel}
              disabled={isTelegramVerificationDisabled({
                clientId: renewalClientId,
                nickname: field.value,
                nonce: renewalNonce,
                status: renewalStatus,
              })}
              onClick={onVerify}
              title={verifyLabel}
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
        </>
      ) : (
        inputNode
      )}
    </InputField>
  );
};

type CheckoutFormProps = {
  agreements: CheckoutAgreement[];
  canRevealStripe: boolean;
  fields: CheckoutInputField[];
  isRenewalCheckout: boolean;
  isRenewalVerified: boolean;
  onAgreementChange: (
    fieldName: PaymentAgreementFieldName,
    event: ChangeEvent<HTMLInputElement>,
  ) => void;
  onInputBlur: (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onInputChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onVerify: () => void | Promise<void>;
  personalDataTitle: string;
  renewalClientId: string;
  renewalNonce: string;
  renewalStatus: RenewalStatus;
  renewalStatusText: string;
  renewalStatusTone: RenewalStatusTone;
  stripeIntentErrorText: string;
  stripeProps: StripePaymentTabsProps;
  verifyLabel: string;
};

const CheckoutForm = ({
  agreements,
  canRevealStripe,
  fields,
  isRenewalCheckout,
  isRenewalVerified,
  onAgreementChange,
  onInputBlur,
  onInputChange,
  onSubmit,
  onVerify,
  personalDataTitle,
  renewalClientId,
  renewalNonce,
  renewalStatus,
  renewalStatusText,
  renewalStatusTone,
  stripeIntentErrorText,
  stripeProps,
  verifyLabel,
}: CheckoutFormProps) => (
  <FormBox onSubmit={onSubmit}>
    <PersonalData>
      <PersonalDataTitle>{personalDataTitle}</PersonalDataTitle>
      <Inputs>
        {fields.map((field) => (
          <CheckoutInput
            key={field.name}
            field={field}
            isRenewalCheckout={isRenewalCheckout}
            isRenewalVerified={isRenewalVerified}
            onBlur={onInputBlur}
            onChange={onInputChange}
            onVerify={onVerify}
            renewalClientId={renewalClientId}
            renewalNonce={renewalNonce}
            renewalStatus={renewalStatus}
            renewalStatusText={renewalStatusText}
            renewalStatusTone={renewalStatusTone}
            verifyLabel={verifyLabel}
          />
        ))}
      </Inputs>
      <Checkboxes>
        {agreements.map((agreement) => (
          <Checkbox
            key={agreement.name}
            checked={agreement.checked}
            disabled={agreement.disabled}
            name={agreement.formName}
            onChange={(event) => onAgreementChange(agreement.name, event)}
            placeholder={agreement.placeholder}
          />
        ))}
      </Checkboxes>
    </PersonalData>
    {stripeIntentErrorText ? (
      <PaymentPreparationError>{stripeIntentErrorText}</PaymentPreparationError>
    ) : null}
    <StripeReveal $isVisible={canRevealStripe}>
      <StripePaymentTabs key={stripeProps.resultCurrency} {...stripeProps} />
    </StripeReveal>
  </FormBox>
);

const PaymentPage = observer(function PaymentPage() {
  const paymentStore = usePaymentStore();
  const { canUseFunctionalStorage } = useCookieConsent();
  const locale = useLocale();
  const t = useTranslations("PaymentPage");
  const stripeT = useTranslations("StripePaymentTabs");
  const productT = useTranslations("SellableProducts");
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>(
    getFallbackCountryOptions,
  );
  const [searchKey, setSearchKey] = useState("");
  const [renewalClientId, setRenewalClientId] = useState("");
  const [renewalNonce, setRenewalNonce] = useState("");
  const [renewalStatus, setRenewalStatus] = useState<RenewalStatus>("idle");
  const [renewalStatusText, setRenewalStatusText] = useState("");
  const hasHydratedCheckoutDraftRef = useRef(false);
  const isChoreoProduct = paymentStore.selectedProduct.type === "choreo";
  const isOnlineGroupCheckout =
    paymentStore.selectedProduct.code === "online-group-anna-strok";
  const isOnlineGroupPlusCheckout =
    isOnlineGroupCheckout && isOnlineGroupLibraryOfferId(paymentStore.selectedOffer.id);
  const lessonLanguageOptions = PAYMENT_LESSON_LANGUAGE_OPTIONS.map((option) => ({
    label: t(option.labelKey),
    value: option.value,
  }));
  const selectedProductTitle = productT(paymentStore.selectedProduct.titleKey);
  const renewalSlug = new URLSearchParams(searchKey).get("renewal")?.trim() ?? "";
  const isRenewalCheckout = Boolean(renewalSlug);
  const summaryCardTitle = selectedProductTitle;
  const selectedProductCompactTitle = getCompactSummaryTitle(summaryCardTitle);
  const productPaymentInputs = getVisiblePaymentInputs({
    isChoreoProduct,
    isRenewalCheckout: false,
  });
  const visiblePaymentInputs = getVisiblePaymentInputs({
    isChoreoProduct,
    isRenewalCheckout,
  });
  const isRenewalVerified = !isRenewalCheckout || renewalStatus === "verified";
  const canRevealStripe = paymentStore.canShowStripe && isRenewalVerified;
  const renewalStatusTone = resolveRenewalStatusTone(renewalStatus);
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
    document.body.removeAttribute("data-hide-footer");
  }, []);

  useEffect(() => {
    const requestController = new AbortController();

    void fetch(PAYMENT_API_ENDPOINTS.catalog, {
      signal: requestController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          paymentStore.setCatalogUnavailable();
          return null;
        }

        return (await response.json()) as SellableProductsCatalogResponse;
      })
      .then((data) => {
        if (data?.products?.length) {
          paymentStore.setSellableProducts(data.products);
        } else if (data) {
          paymentStore.setCatalogUnavailable();
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.warn("Failed to load sellable products catalog", error);
        paymentStore.setCatalogUnavailable();
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
      setRenewalNonce("");
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

    void fetch(`${PAYMENT_API_ENDPOINTS.telegramRenewal}?${searchParams.toString()}`, {
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
        setRenewalNonce(data.nonce ?? "");
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
        setRenewalNonce("");
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

  const handleAgreementChange = (
    fieldName: PaymentAgreementFieldName,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
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
      !canStartTelegramRenewalVerification({
        claimedUsername,
        clientId: numericClientId,
        nonce: renewalNonce,
        slug: renewalSlug,
        status: renewalStatus,
      })
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

      const idToken = await requestTelegramIdToken({
        clientId: numericClientId,
        locale,
        nonce: renewalNonce,
      });

      setRenewalStatusText(t("renewal.status.checkingMembership"));

      const { data, isSuccessful } = await verifyRenewalTelegramMembership({
        checkoutSessionId: paymentStore.checkoutSessionId,
        claimedUsername,
        idToken,
        nonce: renewalNonce,
        slug: renewalSlug,
      });
      const verificationFailure = resolveRenewalVerificationFailure({
        data,
        isSuccessful,
      });

      if (verificationFailure?.kind === "status") {
        setRenewalStatus(verificationFailure.status);
        setRenewalStatusText(t(verificationFailure.messageKey));
        return;
      }

      if (verificationFailure?.kind === "error") {
        throw new Error(verificationFailure.errorCode);
      }

      setRenewalStatus("verified");
      const hasPrefilledProfile = prefillRenewalCustomerProfile(
        paymentStore,
        data.customerProfile,
      );

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

      window.focus();
      window.setTimeout(() => {
        focusNextCheckoutControl({
          customerData: paymentStore.customerData,
          inputs: productPaymentInputs,
        });
      }, POST_VERIFICATION_FOCUS_DELAY_MS);
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

  const checkoutInputFields: CheckoutInputField[] = visiblePaymentInputs.map(
    (inputConfig) => ({
      ...inputConfig,
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
    paymentIntentId:
      paymentStore.stripePaymentIntentIds?.[paymentStore.selectedCurrency] ?? "",
    resultCurrency: paymentStore.selectedCurrency,
    resultOfferId: paymentStore.selectedOfferId,
    resultProductId: paymentStore.selectedProductId,
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
        <SummaryBoxMobile>
          <CheckoutSummaryCard
            {...summaryProps}
            isMobile
            title={selectedProductCompactTitle}
          />
        </SummaryBoxMobile>
        <CheckoutForm
          agreements={checkoutAgreements}
          canRevealStripe={canRevealStripe}
          fields={checkoutInputFields}
          isRenewalCheckout={isRenewalCheckout}
          isRenewalVerified={isRenewalVerified}
          onAgreementChange={handleAgreementChange}
          onInputBlur={handleInputBlur}
          onInputChange={handleInputChange}
          onSubmit={handleSubmit}
          onVerify={handleTelegramRenewalVerification}
          personalDataTitle={t("personalDataTitle")}
          renewalClientId={renewalClientId}
          renewalNonce={renewalNonce}
          renewalStatus={renewalStatus}
          renewalStatusText={renewalStatusText}
          renewalStatusTone={renewalStatusTone}
          stripeIntentErrorText={stripeIntentErrorText}
          stripeProps={stripeProps}
          verifyLabel={t("renewal.buttons.verify")}
        />
      </InteractiveBox>
      <SummaryBoxDesktop>
        <CheckoutSummaryCard {...summaryProps} title={summaryCardTitle} />
      </SummaryBoxDesktop>
    </PaymentSection>
  );
});

export default PaymentPage;
