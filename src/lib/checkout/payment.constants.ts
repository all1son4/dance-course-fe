import { normalizeCountryCode } from "@/constants/countries";

export type PaymentCustomerFieldName =
  | "fullName"
  | "email"
  | "instagram"
  | "nickname"
  | "address"
  | "city"
  | "postalCode"
  | "country"
  | "lessonLanguage";

export type PaymentLessonLanguage = "ru" | "en";

/**
 * The handle a checkout asks for: Telegram where the Telegram account is verified
 * (an Online Group renewal, the Hub at the special price), Instagram everywhere else.
 */
export type PaymentContactField = "instagram" | "nickname";

export const getPaymentContactField = (
  renewalCampaignSlug: string | null | undefined,
): PaymentContactField => (renewalCampaignSlug?.trim() ? "nickname" : "instagram");

/** Instagram's own rule: Latin letters, digits, "." and "_", 30 at most, no dot at an end or twice in a row. */
export const INSTAGRAM_USERNAME_PATTERN = /^(?!\.)(?!.*\.\.)[a-z0-9._]{1,30}(?<!\.)$/u;

export type PaymentCustomerData = Record<PaymentCustomerFieldName, string>;

export type PaymentAgreementFieldName =
  | "immediateAccessConsent"
  | "withdrawalNoticeAcknowledgement"
  | "privacyPolicyAcknowledgement"
  | "digitalContentAgreement";

export type PaymentAgreementState = Record<PaymentAgreementFieldName, boolean>;

export type PaymentInputMode = "email" | "numeric" | "text";

/**
 * The checkout asks in two groups: where the access goes (it is sent to these
 * contacts) and what the invoice needs. Agreements and the payment itself are
 * the third step.
 */
export type PaymentFieldStep = "access" | "billing";

export const PAYMENT_STEPS = ["access", "billing", "payment"] as const;
export type PaymentStep = (typeof PAYMENT_STEPS)[number];

export type PaymentInputConfig = {
  autoComplete?: string;
  /** Why the field is asked, shown under it. */
  hintKey?: string;
  id: PaymentCustomerFieldName;
  /** Virtual keyboard hint; every field is a plain text control otherwise. */
  inputMode?: PaymentInputMode;
  labelKey: string;
  layout?: "full" | "half";
  name: PaymentCustomerFieldName;
  placeholderKey: string;
  step: PaymentFieldStep;
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
  instagram: "",
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

/* Rendered in this order: the access group first, then the invoice group with
   the country ahead of the address it shapes. */
export const PAYMENT_INPUTS: PaymentInputConfig[] = [
  {
    autoComplete: "email",
    hintKey: "inputs.email.hint",
    id: "email",
    inputMode: "email",
    labelKey: "inputs.email.label",
    name: "email",
    placeholderKey: "inputs.email.placeholder",
    step: "access",
    type: "email",
  },
  {
    // A social handle is not a browser-known identity field; keep autofill from
    // guessing a username into it.
    autoComplete: "off",
    hintKey: "inputs.instagram.hint",
    id: "instagram",
    labelKey: "inputs.instagram.label",
    name: "instagram",
    placeholderKey: "inputs.instagram.placeholder",
    step: "access",
    type: "text",
  },
  {
    autoComplete: "off",
    id: "nickname",
    labelKey: "inputs.nickname.label",
    name: "nickname",
    placeholderKey: "inputs.nickname.placeholder",
    step: "access",
    type: "text",
  },
  {
    id: "lessonLanguage",
    labelKey: "inputs.lessonLanguage.label",
    name: "lessonLanguage",
    placeholderKey: "inputs.lessonLanguage.placeholder",
    step: "access",
  },
  {
    autoComplete: "name",
    id: "fullName",
    labelKey: "inputs.fullName.label",
    name: "fullName",
    placeholderKey: "inputs.fullName.placeholder",
    step: "billing",
  },
  {
    autoComplete: "country",
    id: "country",
    labelKey: "inputs.country.label",
    name: "country",
    placeholderKey: "inputs.country.placeholder",
    step: "billing",
  },
  {
    autoComplete: "address-level2",
    id: "city",
    labelKey: "inputs.city.label",
    layout: "half",
    name: "city",
    placeholderKey: "inputs.city.placeholder",
    step: "billing",
    type: "text",
  },
  {
    autoComplete: "postal-code",
    id: "postalCode",
    // A plain text keyboard on purpose: Polish codes carry a hyphen ("00-950")
    // and others letters (GB, NL, CA), and iOS's numeric pad has neither.
    inputMode: "text",
    labelKey: "inputs.postalCode.label",
    layout: "half",
    name: "postalCode",
    placeholderKey: "inputs.postalCode.placeholder",
    step: "billing",
    type: "text",
  },
  {
    autoComplete: "street-address",
    id: "address",
    labelKey: "inputs.address.label",
    name: "address",
    placeholderKey: "inputs.address.placeholder",
    step: "billing",
    type: "text",
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

const normalizeTelegramNickname = (value: string) => {
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

/**
 * A pasted profile link or a leading "@" becomes the bare handle; anything else
 * stays as typed, so a wrong character is reported instead of silently dropped.
 */
export const normalizeInstagramUsername = (value: string) =>
  value
    .replace(/\s+/gu, "")
    .replace(/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\//iu, "")
    .replace(/[/?#].*$/u, "")
    .replace(/^@+/u, "")
    .toLowerCase();

export const normalizePaymentCustomerFieldValue = (
  fieldName: PaymentCustomerFieldName,
  value: string,
) => {
  if (fieldName === "nickname") {
    return normalizeTelegramNickname(value);
  }

  if (fieldName === "instagram") {
    return normalizeInstagramUsername(value);
  }

  if (fieldName === "country") {
    return normalizeCountryCode(value);
  }

  if (fieldName === "lessonLanguage") {
    const normalizedValue = value.trim().toLowerCase();

    return normalizedValue === "en" ? "en" : "ru";
  }

  return value.replace(/\s+/g, " ").trim();
};

/**
 * The record the checkout validates, sends to the intent API and saves as a
 * draft. Field values are stored raw while they are being typed (normalising
 * on every keystroke throws the caret to the end of the field); this is the
 * canonical form they take on blur, on submit and on the wire.
 */
export const normalizePaymentCustomerData = (
  customerData: PaymentCustomerData,
): PaymentCustomerData =>
  (Object.keys(INITIAL_CUSTOMER_DATA) as PaymentCustomerFieldName[]).reduce(
    (acc, fieldName) => {
      acc[fieldName] = normalizePaymentCustomerFieldValue(
        fieldName,
        customerData[fieldName] ?? INITIAL_CUSTOMER_DATA[fieldName],
      );

      return acc;
    },
    { ...INITIAL_CUSTOMER_DATA },
  );
