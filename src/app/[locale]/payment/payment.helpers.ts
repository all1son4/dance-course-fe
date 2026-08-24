import type { ReactNode } from "react";

import type { SellableProduct } from "@/constants/sellable-products";
import type { usePaymentStore } from "@/stores";

import {
  PAYMENT_INPUTS,
  type PaymentAgreementFieldName,
  type PaymentCustomerData,
  type PaymentCustomerFieldName,
  type PaymentInputConfig,
} from "./payment.constants";

export const PAYMENT_DRAFT_SAVE_DEBOUNCE_MS = 240;
export const PAYMENT_INTENT_CREATION_DELAY_MS = 420;
export const POST_VERIFICATION_FOCUS_DELAY_MS = 120;
const LEGACY_NAVIGATION_TYPE_RELOAD = 1;
export const TELEGRAM_USERNAME_PATTERN = /^@[A-Za-z0-9_]{1,32}$/;
export const PAYMENT_API_ENDPOINTS = {
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
export const STRIPE_INTENT_ERROR_TRANSLATION_KEYS = {
  catalog_unavailable: "errors.catalogUnavailable",
  consent_evidence_failed: "errors.consentEvidenceFailed",
  invalid_customer_data: "errors.invalidCustomerData",
  missing_client_secret: "errors.missingClientSecret",
  missing_secret_key: "errors.missingSecretKey",
  online_group_campaign_not_configured: "errors.onlineGroupCampaignNotConfigured",
  payment_intent_failed: "errors.paymentIntentFailed",
  payment_intent_request_failed: "errors.paymentIntentRequestFailed",
  required_consent_missing: "errors.requiredConsentMissing",
  renewal_campaign_inactive: "errors.renewalCampaignInactive",
  renewal_payment_context_mismatch: "errors.renewalPaymentContextMismatch",
  sales_closed: "errors.salesClosed",
  telegram_renewal_verification_required: "errors.telegramRenewalVerificationRequired",
} as const;

export type RenewalStatus =
  | "error"
  | "idle"
  | "loading"
  | "not_member"
  | "ready"
  | "verified"
  | "verifying";
export type RenewalStatusTone = "error" | "info" | "success";
export type SelectOption = {
  label: string;
  value: string;
};
export type CheckoutInputField = PaymentInputConfig & {
  errorMessage: string;
  label: string;
  placeholder: string;
  selectOptions?: SelectOption[];
  value: string;
};
export type CheckoutAgreement = {
  checked: boolean;
  disabled: boolean;
  formName: string;
  name: PaymentAgreementFieldName;
  placeholder: ReactNode;
};

export type SellableProductsCatalogResponse = {
  errorCode?: "catalog_unavailable";
  products?: SellableProduct[];
};
export type RenewalCampaignResponse = {
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
export type RenewalVerificationResponse = {
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

export type RenewalVerificationFailure =
  | {
      kind: "error";
      errorCode: string;
    }
  | {
      kind: "status";
      messageKey: "renewal.status.notMember" | "renewal.status.usernameMismatch";
      status: "error" | "not_member";
    };

export type PaymentStoreInstance = ReturnType<typeof usePaymentStore>;

export const getCompactSummaryTitle = (fullTitle: string) => {
  const quotedNameMatch = fullTitle.match(/["“”«»]([^"“”«»]+)["“”«»]/u);

  return quotedNameMatch?.[1]?.trim() || fullTitle;
};

export const formatTelegramUsernameInput = (value: string) => {
  const normalizedUsername = value.trim().replace(/^@/, "");

  return normalizedUsername ? `@${normalizedUsername}` : "";
};

export const getVisiblePaymentInputs = ({
  isRenewalCheckout,
  showsLessonLanguage,
}: {
  isRenewalCheckout: boolean;
  showsLessonLanguage: boolean;
}): PaymentInputConfig[] => {
  const productInputs = showsLessonLanguage
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

export const resolveRenewalStatusTone = (status: RenewalStatus): RenewalStatusTone => {
  if (status === "verified") {
    return "success";
  }

  return status === "error" || status === "not_member" ? "error" : "info";
};

export const isRenewalInputDisabled = ({
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

export const isTelegramVerificationDisabled = ({
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

export const canStartTelegramRenewalVerification = ({
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

export const resolveRenewalVerificationFailure = ({
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

export const isReloadNavigation = () => {
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

export const prefillRenewalCustomerProfile = (
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

export const focusNextCheckoutControl = ({
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
