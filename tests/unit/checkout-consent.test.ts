import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_AGREEMENTS,
  INITIAL_CUSTOMER_DATA,
  type PaymentAgreementState,
} from "@/app/[locale]/payment/payment.constants";
import {
  CHECKOUT_AGREEMENT_VERSIONS,
  CHECKOUT_CONSENT_METADATA_KEYS,
  CHECKOUT_CONSENT_SCHEMA_VERSION,
  CHECKOUT_CONSENT_SOURCE,
  CHECKOUT_PRIVACY_POLICY_VERSION,
  createCheckoutConsentMetadata,
  parseCheckoutConsentEvidence,
  validateCheckoutCustomerAndConsent,
} from "@/lib/checkout-consent";

const ACCEPTED_AGREEMENTS = Object.fromEntries(
  Object.keys(INITIAL_AGREEMENTS).map((fieldName) => [fieldName, true]),
) as PaymentAgreementState;

const VALID_CUSTOMER_DATA = {
  ...INITIAL_CUSTOMER_DATA,
  address: "  Main Street 1 ",
  city: " Warsaw ",
  country: "pl",
  email: " Buyer@Example.com ",
  fullName: " Anna Test ",
  lessonLanguage: "EN",
  nickname: "@anna_test",
  postalCode: " 00-001 ",
};

test("validates the same customer fields and four agreements on the server", () => {
  const result = validateCheckoutCustomerAndConsent({
    agreements: ACCEPTED_AGREEMENTS,
    checkoutLocale: "en",
    customerData: VALID_CUSTOMER_DATA,
  });

  assert.equal(result.valid, true);

  if (!result.valid) {
    return;
  }

  assert.deepEqual(result.agreements, ACCEPTED_AGREEMENTS);
  assert.deepEqual(result.customerData, {
    address: "Main Street 1",
    city: "Warsaw",
    country: "PL",
    email: "Buyer@Example.com",
    fullName: "Anna Test",
    lessonLanguage: "en",
    nickname: "@anna_test",
    postalCode: "00-001",
  });
});

test("rejects missing consent and invalid customer input", () => {
  for (const fieldName of Object.keys(ACCEPTED_AGREEMENTS) as Array<
    keyof PaymentAgreementState
  >) {
    assert.deepEqual(
      validateCheckoutCustomerAndConsent({
        agreements: {
          ...ACCEPTED_AGREEMENTS,
          [fieldName]: false,
        },
        checkoutLocale: "en",
        customerData: VALID_CUSTOMER_DATA,
      }),
      {
        errorCode: "required_consent_missing",
        valid: false,
      },
    );
  }

  assert.deepEqual(
    validateCheckoutCustomerAndConsent({
      agreements: ACCEPTED_AGREEMENTS,
      checkoutLocale: "en",
      customerData: {
        ...VALID_CUSTOMER_DATA,
        email: "not-an-email",
      },
    }),
    {
      errorCode: "invalid_customer_data",
      valid: false,
    },
  );
  assert.deepEqual(
    validateCheckoutCustomerAndConsent({
      agreements: ACCEPTED_AGREEMENTS,
      checkoutLocale: "en",
      customerData: {
        ...VALID_CUSTOMER_DATA,
        fullName: 42,
      },
    }),
    {
      errorCode: "invalid_customer_data",
      valid: false,
    },
  );
});

test("round-trips a versioned consent snapshot through Stripe metadata", () => {
  const acceptedAt = new Date("2026-08-08T20:00:00.000Z");
  const metadata = {
    checkout_currency: "eur",
    checkout_locale: "en",
    checkout_session_id: "checkout_safe08",
    offer_id: "off_safe08",
    product_id: "prd_safe08",
    ...createCheckoutConsentMetadata({
      agreements: ACCEPTED_AGREEMENTS,
    }),
  };
  const evidence = parseCheckoutConsentEvidence({
    acceptedAt,
    metadata,
    paymentIntentId: "pi_safe08",
  });

  assert.deepEqual(evidence, {
    acceptedAt,
    agreements: ACCEPTED_AGREEMENTS,
    agreementVersions: CHECKOUT_AGREEMENT_VERSIONS,
    checkoutLocale: "en",
    checkoutSessionId: "checkout_safe08",
    currency: "eur",
    offerExternalId: "off_safe08",
    paymentIntentId: "pi_safe08",
    privacyPolicyVersion: CHECKOUT_PRIVACY_POLICY_VERSION,
    productExternalId: "prd_safe08",
    schemaVersion: CHECKOUT_CONSENT_SCHEMA_VERSION,
    source: CHECKOUT_CONSENT_SOURCE,
  });

  assert.equal(
    parseCheckoutConsentEvidence({
      acceptedAt,
      metadata: {
        ...metadata,
        [CHECKOUT_CONSENT_METADATA_KEYS.privacyPolicyAcknowledgement]: "false",
      },
      paymentIntentId: "pi_safe08",
    }),
    null,
  );
  assert.equal(
    parseCheckoutConsentEvidence({
      acceptedAt,
      metadata: {
        ...metadata,
        [CHECKOUT_CONSENT_METADATA_KEYS.schemaVersion]: "",
      },
      paymentIntentId: "pi_safe08",
    }),
    null,
  );
});
