import { normalizeCountryCode } from "@/constants/countries";

export type PaymentCustomerFieldName =
  | "fullName"
  | "email"
  | "nickname"
  | "address"
  | "city"
  | "postalCode"
  | "country"
  | "lessonLanguage";

export type PaymentLessonLanguage = "ru" | "en";

export type PaymentCustomerData = Record<PaymentCustomerFieldName, string>;

export type PaymentAgreementFieldName =
  | "immediateAccessConsent"
  | "withdrawalNoticeAcknowledgement"
  | "privacyPolicyAcknowledgement"
  | "digitalContentAgreement";

export type PaymentAgreementState = Record<PaymentAgreementFieldName, boolean>;

export type PaymentInputConfig = {
  autoComplete?: string;
  id: PaymentCustomerFieldName;
  labelKey: string;
  layout?: "full" | "half";
  name: PaymentCustomerFieldName;
  placeholderKey: string;
  type?: "text" | "email";
};

export type PaymentCheckboxConfig = {
  name: PaymentAgreementFieldName;
  formName: string;
  placeholderKey: string;
};

export const INITIAL_CUSTOMER_DATA: PaymentCustomerData = {
  fullName: "",
  email: "",
  nickname: "",
  address: "",
  city: "",
  postalCode: "",
  country: "",
  lessonLanguage: "ru",
};

export const INITIAL_AGREEMENTS: PaymentAgreementState = {
  immediateAccessConsent: false,
  withdrawalNoticeAcknowledgement: false,
  privacyPolicyAcknowledgement: false,
  digitalContentAgreement: false,
};

export const PAYMENT_INPUTS: PaymentInputConfig[] = [
  {
    autoComplete: "name",
    id: "fullName",
    labelKey: "inputs.fullName.label",
    name: "fullName",
    placeholderKey: "inputs.fullName.placeholder",
  },
  {
    autoComplete: "email",
    id: "email",
    labelKey: "inputs.email.label",
    name: "email",
    placeholderKey: "inputs.email.placeholder",
    type: "email",
  },
  {
    // A Telegram handle is not a browser-known identity field; keep autofill
    // from guessing a username into it.
    autoComplete: "off",
    id: "nickname",
    labelKey: "inputs.nickname.label",
    name: "nickname",
    placeholderKey: "inputs.nickname.placeholder",
    type: "text",
  },
  {
    autoComplete: "street-address",
    id: "address",
    labelKey: "inputs.address.label",
    name: "address",
    placeholderKey: "inputs.address.placeholder",
    type: "text",
  },
  {
    autoComplete: "address-level2",
    id: "city",
    labelKey: "inputs.city.label",
    layout: "half",
    name: "city",
    placeholderKey: "inputs.city.placeholder",
    type: "text",
  },
  {
    autoComplete: "postal-code",
    id: "postalCode",
    labelKey: "inputs.postalCode.label",
    layout: "half",
    name: "postalCode",
    placeholderKey: "inputs.postalCode.placeholder",
    type: "text",
  },
  {
    autoComplete: "country",
    id: "country",
    labelKey: "inputs.country.label",
    name: "country",
    placeholderKey: "inputs.country.placeholder",
  },
  {
    id: "lessonLanguage",
    labelKey: "inputs.lessonLanguage.label",
    name: "lessonLanguage",
    placeholderKey: "inputs.lessonLanguage.placeholder",
  },
];

export const PAYMENT_LESSON_LANGUAGE_OPTIONS: Array<{
  labelKey: string;
  value: PaymentLessonLanguage;
}> = [
  {
    labelKey: "inputs.lessonLanguage.options.ru",
    value: "ru",
  },
  {
    labelKey: "inputs.lessonLanguage.options.en",
    value: "en",
  },
];

export const PAYMENT_CHECKBOXES: PaymentCheckboxConfig[] = [
  {
    name: "immediateAccessConsent",
    formName: "immediate_access_consent",
    placeholderKey: "agreements.immediateAccessConsent",
  },
  {
    name: "withdrawalNoticeAcknowledgement",
    formName: "withdrawal_notice_acknowledgement",
    placeholderKey: "agreements.withdrawalNoticeAcknowledgement",
  },
  {
    name: "privacyPolicyAcknowledgement",
    formName: "privacy_policy_acknowledgement",
    placeholderKey: "agreements.privacyPolicyAcknowledgement",
  },
  {
    name: "digitalContentAgreement",
    formName: "digital_content_agreement",
    placeholderKey: "agreements.digitalContentAgreement",
  },
];

export const normalizeTelegramNickname = (value: string) => {
  if (!value) {
    return "";
  }

  const trimmedValue = value.replace(/\s+/g, "");
  const nicknameBody = trimmedValue.replace(/[^A-Za-z0-9_]/g, "").slice(0, 32);

  if (!nicknameBody) {
    return trimmedValue.includes("@") ? "@" : "";
  }

  return `@${nicknameBody}`;
};

export const normalizePaymentCustomerFieldValue = (
  fieldName: PaymentCustomerFieldName,
  value: string,
) => {
  if (fieldName === "nickname") {
    return normalizeTelegramNickname(value);
  }

  if (fieldName === "country") {
    return normalizeCountryCode(value);
  }

  if (fieldName === "lessonLanguage") {
    const normalizedValue = value.trim().toLowerCase();

    return normalizedValue === "en" ? "en" : "ru";
  }

  return value.replace(/\s+/g, " ").trimStart();
};
