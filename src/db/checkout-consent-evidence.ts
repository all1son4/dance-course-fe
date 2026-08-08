import { eq } from "drizzle-orm";

import type { CheckoutConsentEvidence } from "@/lib/checkout-consent";

import { getDatabase } from "./client";
import { checkoutConsentEvidence } from "./schema";

const toDatabaseValues = (evidence: CheckoutConsentEvidence) => ({
  acceptedAt: evidence.acceptedAt,
  checkoutLocale: evidence.checkoutLocale,
  checkoutSessionId: evidence.checkoutSessionId,
  currency: evidence.currency,
  digitalContentAgreement: evidence.agreements.digitalContentAgreement,
  digitalContentAgreementVersion: evidence.agreementVersions.digitalContentAgreement,
  immediateAccessConsent: evidence.agreements.immediateAccessConsent,
  immediateAccessConsentVersion: evidence.agreementVersions.immediateAccessConsent,
  offerExternalId: evidence.offerExternalId,
  paymentIntentId: evidence.paymentIntentId,
  privacyPolicyAcknowledgement: evidence.agreements.privacyPolicyAcknowledgement,
  privacyPolicyAcknowledgementVersion:
    evidence.agreementVersions.privacyPolicyAcknowledgement,
  privacyPolicyVersion: evidence.privacyPolicyVersion,
  productExternalId: evidence.productExternalId,
  schemaVersion: evidence.schemaVersion,
  source: evidence.source,
  withdrawalNoticeAcknowledgement: evidence.agreements.withdrawalNoticeAcknowledgement,
  withdrawalNoticeAcknowledgementVersion:
    evidence.agreementVersions.withdrawalNoticeAcknowledgement,
});

const getComparableEvidence = (evidence: CheckoutConsentEvidence) => ({
  ...toDatabaseValues(evidence),
  acceptedAt: evidence.acceptedAt.toISOString(),
});

export const recordCheckoutConsentEvidence = async (
  evidence: CheckoutConsentEvidence,
): Promise<void> => {
  const db = getDatabase();
  const values = toDatabaseValues(evidence);
  const [inserted] = await db
    .insert(checkoutConsentEvidence)
    .values(values)
    .onConflictDoNothing({
      target: checkoutConsentEvidence.paymentIntentId,
    })
    .returning({ id: checkoutConsentEvidence.id });

  if (inserted) {
    return;
  }

  const [existing] = await db
    .select()
    .from(checkoutConsentEvidence)
    .where(eq(checkoutConsentEvidence.paymentIntentId, evidence.paymentIntentId))
    .limit(1);

  if (!existing) {
    throw new Error("checkout_consent_evidence_insert_failed");
  }

  const comparableExisting = {
    acceptedAt: existing.acceptedAt.toISOString(),
    checkoutLocale: existing.checkoutLocale,
    checkoutSessionId: existing.checkoutSessionId,
    currency: existing.currency,
    digitalContentAgreement: existing.digitalContentAgreement,
    digitalContentAgreementVersion: existing.digitalContentAgreementVersion,
    immediateAccessConsent: existing.immediateAccessConsent,
    immediateAccessConsentVersion: existing.immediateAccessConsentVersion,
    offerExternalId: existing.offerExternalId,
    paymentIntentId: existing.paymentIntentId,
    privacyPolicyAcknowledgement: existing.privacyPolicyAcknowledgement,
    privacyPolicyAcknowledgementVersion: existing.privacyPolicyAcknowledgementVersion,
    privacyPolicyVersion: existing.privacyPolicyVersion,
    productExternalId: existing.productExternalId,
    schemaVersion: existing.schemaVersion,
    source: existing.source,
    withdrawalNoticeAcknowledgement: existing.withdrawalNoticeAcknowledgement,
    withdrawalNoticeAcknowledgementVersion:
      existing.withdrawalNoticeAcknowledgementVersion,
  };

  if (
    JSON.stringify(comparableExisting) !== JSON.stringify(getComparableEvidence(evidence))
  ) {
    throw new Error("checkout_consent_evidence_conflict");
  }
};
