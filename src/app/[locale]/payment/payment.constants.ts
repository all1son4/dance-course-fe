export type PaymentCustomerFieldName = "name" | "lastName" | "email" | "nickname";

export type PaymentCustomerData = Record<PaymentCustomerFieldName, string>;

export type PaymentAgreementFieldName =
  | "immediateAccessConsent"
  | "withdrawalNoticeAcknowledgement"
  | "privacyPolicyAcknowledgement"
  | "digitalContentAgreement";

export type PaymentAgreementState = Record<PaymentAgreementFieldName, boolean>;

export type PaymentInputConfig = {
  id: PaymentCustomerFieldName;
  labelKey: string;
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
  name: "",
  lastName: "",
  email: "",
  nickname: "",
};

export const INITIAL_AGREEMENTS: PaymentAgreementState = {
  immediateAccessConsent: false,
  withdrawalNoticeAcknowledgement: false,
  privacyPolicyAcknowledgement: false,
  digitalContentAgreement: false,
};

export const PAYMENT_INPUTS: PaymentInputConfig[] = [
  {
    id: "name",
    labelKey: "inputs.name.label",
    name: "name",
    placeholderKey: "inputs.name.placeholder",
  },
  {
    id: "lastName",
    labelKey: "inputs.lastName.label",
    name: "lastName",
    placeholderKey: "inputs.lastName.placeholder",
  },
  {
    id: "email",
    labelKey: "inputs.email.label",
    name: "email",
    placeholderKey: "inputs.email.placeholder",
    type: "email",
  },
  {
    id: "nickname",
    labelKey: "inputs.nickname.label",
    name: "nickname",
    placeholderKey: "inputs.nickname.placeholder",
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
