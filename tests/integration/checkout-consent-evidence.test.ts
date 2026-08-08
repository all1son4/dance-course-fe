import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), {
  max: 2,
  prepare: false,
});

after(async () => {
  await client.end();
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
