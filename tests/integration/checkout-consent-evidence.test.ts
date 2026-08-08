import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { recordCheckoutConsentEvidence } from "@/db/checkout-consent-evidence";
import { getDatabaseClient } from "@/db/client";
import {
  CHECKOUT_AGREEMENT_VERSIONS,
  CHECKOUT_CONSENT_SCHEMA_VERSION,
  CHECKOUT_CONSENT_SOURCE,
  CHECKOUT_PRIVACY_POLICY_VERSION,
  type CheckoutConsentEvidence,
} from "@/lib/checkout-consent";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, {
  max: 2,
  prepare: false,
});
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

test("records an idempotent immutable snapshot and rejects conflicting retries", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const paymentIntentId = `pi_safe08_record_${suffix}`;
  const evidence: CheckoutConsentEvidence = {
    acceptedAt: new Date("2026-08-08T20:00:00.000Z"),
    agreements: {
      digitalContentAgreement: true,
      immediateAccessConsent: true,
      privacyPolicyAcknowledgement: true,
      withdrawalNoticeAcknowledgement: true,
    },
    agreementVersions: CHECKOUT_AGREEMENT_VERSIONS,
    checkoutLocale: "en",
    checkoutSessionId: `checkout_safe08_record_${suffix}`,
    currency: "eur",
    offerExternalId: "off_safe08",
    paymentIntentId,
    privacyPolicyVersion: CHECKOUT_PRIVACY_POLICY_VERSION,
    productExternalId: "prd_safe08",
    schemaVersion: CHECKOUT_CONSENT_SCHEMA_VERSION,
    source: CHECKOUT_CONSENT_SOURCE,
  };

  try {
    await recordCheckoutConsentEvidence(evidence);
    await recordCheckoutConsentEvidence(evidence);

    const [rowCount] = await client<{ count: number }[]>`
      SELECT COUNT(*)::integer AS count
      FROM checkout_consent_evidence
      WHERE payment_intent_id = ${paymentIntentId}
    `;

    assert.equal(rowCount?.count, 1);
    await assert.rejects(
      recordCheckoutConsentEvidence({
        ...evidence,
        checkoutLocale: "pl",
      }),
      /checkout_consent_evidence_conflict/u,
    );
  } finally {
    await client`
      DELETE FROM checkout_consent_evidence
      WHERE payment_intent_id = ${paymentIntentId}
    `;
  }
});

test("keeps per-purchase consent evidence complete and immutable", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const paymentIntentId = `pi_safe08_${suffix}`;
  const rejectedPaymentIntentId = `pi_safe08_rejected_${suffix}`;

  try {
    await client`
      INSERT INTO checkout_consent_evidence (
        payment_intent_id,
        checkout_session_id,
        checkout_locale,
        product_external_id,
        offer_external_id,
        currency,
        immediate_access_consent,
        withdrawal_notice_acknowledgement,
        privacy_policy_acknowledgement,
        digital_content_agreement,
        immediate_access_consent_version,
        withdrawal_notice_acknowledgement_version,
        privacy_policy_acknowledgement_version,
        digital_content_agreement_version,
        privacy_policy_version,
        accepted_at,
        source,
        schema_version
      ) VALUES (
        ${paymentIntentId},
        ${`checkout_safe08_${suffix}`},
        'en',
        'prd_safe08',
        'off_safe08',
        'eur',
        true,
        true,
        true,
        true,
        'immediate-access-v1',
        'withdrawal-notice-v1',
        'privacy-acknowledgement-v1',
        'digital-content-v1',
        'privacy-policy-v1',
        '2026-08-08T20:00:00.000Z',
        'internal-checkout',
        'checkout-consent-v1'
      )
    `;

    await assert.rejects(
      client`
        UPDATE checkout_consent_evidence
        SET checkout_locale = 'pl'
        WHERE payment_intent_id = ${paymentIntentId}
      `,
      /checkout_consent_evidence_is_immutable/u,
    );

    await assert.rejects(
      client`
        INSERT INTO checkout_consent_evidence (
          payment_intent_id,
          checkout_session_id,
          checkout_locale,
          product_external_id,
          offer_external_id,
          currency,
          immediate_access_consent,
          withdrawal_notice_acknowledgement,
          privacy_policy_acknowledgement,
          digital_content_agreement,
          immediate_access_consent_version,
          withdrawal_notice_acknowledgement_version,
          privacy_policy_acknowledgement_version,
          digital_content_agreement_version,
          privacy_policy_version,
          accepted_at,
          source,
          schema_version
        ) VALUES (
          ${rejectedPaymentIntentId},
          ${`checkout_safe08_rejected_${suffix}`},
          'en',
          'prd_safe08',
          'off_safe08',
          'eur',
          true,
          true,
          false,
          true,
          'immediate-access-v1',
          'withdrawal-notice-v1',
          'privacy-acknowledgement-v1',
          'digital-content-v1',
          'privacy-policy-v1',
          '2026-08-08T20:00:00.000Z',
          'internal-checkout',
          'checkout-consent-v1'
        )
      `,
      /checkout_consent_evidence_all_accepted_check/u,
    );

    const [evidence] = await client<
      {
        accepted_at: Date;
        checkout_locale: string;
        privacy_policy_acknowledgement: boolean;
      }[]
    >`
      SELECT
        accepted_at,
        checkout_locale,
        privacy_policy_acknowledgement
      FROM checkout_consent_evidence
      WHERE payment_intent_id = ${paymentIntentId}
    `;

    assert.equal(evidence?.checkout_locale, "en");
    assert.equal(evidence?.privacy_policy_acknowledgement, true);
    assert.equal(evidence?.accepted_at.toISOString(), "2026-08-08T20:00:00.000Z");
  } finally {
    await client`
      DELETE FROM checkout_consent_evidence
      WHERE payment_intent_id IN (${paymentIntentId}, ${rejectedPaymentIntentId})
    `;
  }
});
