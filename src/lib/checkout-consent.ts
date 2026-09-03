import {
  INITIAL_AGREEMENTS,
  PAYMENT_INPUTS,
  type PaymentAgreementState,
  type PaymentCustomerData,
} from "@/app/[locale]/payment/payment.constants";
import { getPaymentCustomerSchema } from "@/app/[locale]/payment/payment.validation";
import type { CheckoutLocale } from "@/app/api/stripe/payment-intent/lib";
import type { SupportedCheckoutCurrency } from "@/constants/sellable-products";

// These identifiers are historical evidence. Bump the affected version when its
// visible agreement or linked policy meaning changes; never reuse a prior identifier.
export const CHECKOUT_CONSENT_SCHEMA_VERSION = "checkout-consent-v1";
export const CHECKOUT_CONSENT_SOURCE = "internal-checkout";
export const CHECKOUT_PRIVACY_POLICY_VERSION = "privacy-policy-v1";
export const CHECKOUT_AGREEMENT_VERSIONS = {
  digitalContentAgreement: "digital-content-agreement-v1",
  immediateAccessConsent: "immediate-access-consent-v1",
  privacyPolicyAcknowledgement: "privacy-policy-acknowledgement-v1",
  withdrawalNoticeAcknowledgement: "withdrawal-notice-acknowledgement-v1",
} as const;
export const CHECKOUT_CONSENT_VERSION_KEY = [
  CHECKOUT_CONSENT_SCHEMA_VERSION,
  CHECKOUT_PRIVACY_POLICY_VERSION,
  ...Object.values(CHECKOUT_AGREEMENT_VERSIONS),
].join(":");

export const CHECKOUT_CONSENT_METADATA_KEYS = {
  digitalContentAgreement: "consent_digital_content",
  digitalContentAgreementVersion: "consent_digital_content_version",
  immediateAccessConsent: "consent_immediate_access",
  immediateAccessConsentVersion: "consent_immediate_access_version",
  privacyPolicyAcknowledgement: "consent_privacy_acknowledgement",
  privacyPolicyAcknowledgementVersion: "consent_privacy_ack_version",
  privacyPolicyVersion: "consent_privacy_policy_version",
  schemaVersion: "consent_schema_version",
  source: "consent_source",
  withdrawalNoticeAcknowledgement: "consent_withdrawal_notice",
  withdrawalNoticeAcknowledgementVersion: "consent_withdrawal_notice_version",
} as const;

const PAYMENT_AGREEMENT_FIELD_NAMES = Object.keys(INITIAL_AGREEMENTS) as Array<
  keyof PaymentAgreementState
>;
const PAYMENT_CUSTOMER_FIELD_NAMES = PAYMENT_INPUTS.map(({ name }) => name);
const CHECKOUT_LOCALES = new Set<CheckoutLocale>(["ru", "en", "pl"]);
const CHECKOUT_CURRENCIES = new Set<SupportedCheckoutCurrency>(["pln", "eur"]);

type CheckoutRequestValidationErrorCode =
  "invalid_customer_data" | "required_consent_missing";

export type CheckoutConsentEvidence = {
  acceptedAt: Date;
  agreements: PaymentAgreementState;
  agreementVersions: typeof CHECKOUT_AGREEMENT_VERSIONS;
  checkoutLocale: CheckoutLocale;
  checkoutSessionId: string;
  currency: SupportedCheckoutCurrency;
  offerExternalId: string;
  paymentIntentId: string;
  privacyPolicyVersion: typeof CHECKOUT_PRIVACY_POLICY_VERSION;
  productExternalId: string;
  schemaVersion: typeof CHECKOUT_CONSENT_SCHEMA_VERSION;
  source: typeof CHECKOUT_CONSENT_SOURCE;
};

type CheckoutRequestValidationResult =
  | {
      agreements: PaymentAgreementState;
      customerData: PaymentCustomerData;
      errorCode?: never;
      valid: true;
    }
  | {
      agreements?: never;
      customerData?: never;
      errorCode: CheckoutRequestValidationErrorCode;
      valid: false;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasRequiredCustomerFieldTypes = (
  value: unknown,
): value is Record<keyof PaymentCustomerData, string> =>
  isRecord(value) &&
  PAYMENT_CUSTOMER_FIELD_NAMES.every((fieldName) => typeof value[fieldName] === "string");

const getAcceptedAgreements = (value: unknown): PaymentAgreementState | null => {
  if (!isRecord(value)) {
    return null;
  }

  const agreements = { ...INITIAL_AGREEMENTS };

  for (const fieldName of PAYMENT_AGREEMENT_FIELD_NAMES) {
    if (value[fieldName] !== true) {
      return null;
    }

    agreements[fieldName] = true;
  }

  return agreements;
};

export const validateCheckoutCustomerAndConsent = ({
  agreements,
  checkoutLocale,
  customerData,
}: {
  agreements: unknown;
  checkoutLocale: string | null | undefined;
  customerData: unknown;
}): CheckoutRequestValidationResult => {
  if (!hasRequiredCustomerFieldTypes(customerData)) {
    return {
      errorCode: "invalid_customer_data",
      valid: false,
    };
  }

  let validatedCustomerData: PaymentCustomerData;

  try {
    validatedCustomerData = getPaymentCustomerSchema(checkoutLocale).validateSync(
      customerData,
      {
        abortEarly: false,
        stripUnknown: true,
      },
    );
  } catch {
    return {
      errorCode: "invalid_customer_data",
      valid: false,
    };
  }

  const acceptedAgreements = getAcceptedAgreements(agreements);

  if (!acceptedAgreements) {
    return {
      errorCode: "required_consent_missing",
      valid: false,
    };
  }

  return {
    agreements: acceptedAgreements,
    customerData: validatedCustomerData,
    valid: true,
  };
};

export const createCheckoutConsentMetadata = ({
  agreements,
}: Pick<CheckoutConsentEvidence, "agreements">): Record<string, string> => ({
  [CHECKOUT_CONSENT_METADATA_KEYS.digitalContentAgreement]: String(
    agreements.digitalContentAgreement,
  ),
  [CHECKOUT_CONSENT_METADATA_KEYS.digitalContentAgreementVersion]:
    CHECKOUT_AGREEMENT_VERSIONS.digitalContentAgreement,
  [CHECKOUT_CONSENT_METADATA_KEYS.immediateAccessConsent]: String(
    agreements.immediateAccessConsent,
  ),
  [CHECKOUT_CONSENT_METADATA_KEYS.immediateAccessConsentVersion]:
    CHECKOUT_AGREEMENT_VERSIONS.immediateAccessConsent,
  [CHECKOUT_CONSENT_METADATA_KEYS.privacyPolicyAcknowledgement]: String(
    agreements.privacyPolicyAcknowledgement,
  ),
  [CHECKOUT_CONSENT_METADATA_KEYS.privacyPolicyAcknowledgementVersion]:
    CHECKOUT_AGREEMENT_VERSIONS.privacyPolicyAcknowledgement,
  [CHECKOUT_CONSENT_METADATA_KEYS.privacyPolicyVersion]: CHECKOUT_PRIVACY_POLICY_VERSION,
  [CHECKOUT_CONSENT_METADATA_KEYS.schemaVersion]: CHECKOUT_CONSENT_SCHEMA_VERSION,
  [CHECKOUT_CONSENT_METADATA_KEYS.source]: CHECKOUT_CONSENT_SOURCE,
  [CHECKOUT_CONSENT_METADATA_KEYS.withdrawalNoticeAcknowledgement]: String(
    agreements.withdrawalNoticeAcknowledgement,
  ),
  [CHECKOUT_CONSENT_METADATA_KEYS.withdrawalNoticeAcknowledgementVersion]:
    CHECKOUT_AGREEMENT_VERSIONS.withdrawalNoticeAcknowledgement,
});

const getRequiredMetadataValue = (
  metadata: Record<string, string>,
  key: string,
): string => metadata[key]?.trim() ?? "";

export const parseCheckoutConsentEvidence = ({
  acceptedAt,
  metadata,
  paymentIntentId,
}: {
  acceptedAt: Date;
  metadata: Record<string, string>;
  paymentIntentId: string;
}): CheckoutConsentEvidence | null => {
  const acceptedAtTimestamp = acceptedAt.getTime();
  const checkoutLocale = getRequiredMetadataValue(metadata, "checkout_locale");
  const currency = getRequiredMetadataValue(metadata, "checkout_currency");
  const checkoutSessionId = getRequiredMetadataValue(metadata, "checkout_session_id");
  const productExternalId = getRequiredMetadataValue(metadata, "product_id");
  const offerExternalId = getRequiredMetadataValue(metadata, "offer_id");
  const normalizedPaymentIntentId = paymentIntentId.trim();
  const hasAcceptedEveryAgreement = PAYMENT_AGREEMENT_FIELD_NAMES.every((fieldName) => {
    const metadataKey = CHECKOUT_CONSENT_METADATA_KEYS[fieldName];
    return getRequiredMetadataValue(metadata, metadataKey) === "true";
  });
  const hasCurrentVersions =
    getRequiredMetadataValue(
      metadata,
      CHECKOUT_CONSENT_METADATA_KEYS.digitalContentAgreementVersion,
    ) === CHECKOUT_AGREEMENT_VERSIONS.digitalContentAgreement &&
    getRequiredMetadataValue(
      metadata,
      CHECKOUT_CONSENT_METADATA_KEYS.immediateAccessConsentVersion,
    ) === CHECKOUT_AGREEMENT_VERSIONS.immediateAccessConsent &&
    getRequiredMetadataValue(
      metadata,
      CHECKOUT_CONSENT_METADATA_KEYS.privacyPolicyAcknowledgementVersion,
    ) === CHECKOUT_AGREEMENT_VERSIONS.privacyPolicyAcknowledgement &&
    getRequiredMetadataValue(
      metadata,
      CHECKOUT_CONSENT_METADATA_KEYS.withdrawalNoticeAcknowledgementVersion,
    ) === CHECKOUT_AGREEMENT_VERSIONS.withdrawalNoticeAcknowledgement &&
    getRequiredMetadataValue(
      metadata,
      CHECKOUT_CONSENT_METADATA_KEYS.privacyPolicyVersion,
    ) === CHECKOUT_PRIVACY_POLICY_VERSION &&
    getRequiredMetadataValue(metadata, CHECKOUT_CONSENT_METADATA_KEYS.schemaVersion) ===
      CHECKOUT_CONSENT_SCHEMA_VERSION &&
    getRequiredMetadataValue(metadata, CHECKOUT_CONSENT_METADATA_KEYS.source) ===
      CHECKOUT_CONSENT_SOURCE;

  if (
    !Number.isFinite(acceptedAtTimestamp) ||
    !CHECKOUT_LOCALES.has(checkoutLocale as CheckoutLocale) ||
    !CHECKOUT_CURRENCIES.has(currency as SupportedCheckoutCurrency) ||
    !checkoutSessionId ||
    !productExternalId ||
    !offerExternalId ||
    !normalizedPaymentIntentId ||
    !hasAcceptedEveryAgreement ||
    !hasCurrentVersions
  ) {
    return null;
  }

  return {
    acceptedAt: new Date(acceptedAtTimestamp),
    agreements: {
      digitalContentAgreement: true,
      immediateAccessConsent: true,
      privacyPolicyAcknowledgement: true,
      withdrawalNoticeAcknowledgement: true,
    },
    agreementVersions: CHECKOUT_AGREEMENT_VERSIONS,
    checkoutLocale: checkoutLocale as CheckoutLocale,
    checkoutSessionId,
    currency: currency as SupportedCheckoutCurrency,
    offerExternalId,
    paymentIntentId: normalizedPaymentIntentId,
    privacyPolicyVersion: CHECKOUT_PRIVACY_POLICY_VERSION,
    productExternalId,
    schemaVersion: CHECKOUT_CONSENT_SCHEMA_VERSION,
    source: CHECKOUT_CONSENT_SOURCE,
  };
};
