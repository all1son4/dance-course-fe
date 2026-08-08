-- migration-phase: expand
CREATE TABLE "checkout_consent_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_intent_id" text NOT NULL,
  "checkout_session_id" text NOT NULL,
  "checkout_locale" text NOT NULL,
  "product_external_id" text NOT NULL,
  "offer_external_id" text NOT NULL,
  "currency" text NOT NULL,
  "immediate_access_consent" boolean NOT NULL,
  "withdrawal_notice_acknowledgement" boolean NOT NULL,
  "privacy_policy_acknowledgement" boolean NOT NULL,
  "digital_content_agreement" boolean NOT NULL,
  "immediate_access_consent_version" text NOT NULL,
  "withdrawal_notice_acknowledgement_version" text NOT NULL,
  "privacy_policy_acknowledgement_version" text NOT NULL,
  "digital_content_agreement_version" text NOT NULL,
  "privacy_policy_version" text NOT NULL,
  "accepted_at" timestamp with time zone NOT NULL,
  "source" text NOT NULL,
  "schema_version" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "checkout_consent_evidence_all_accepted_check" CHECK (
    "immediate_access_consent"
    AND "withdrawal_notice_acknowledgement"
    AND "privacy_policy_acknowledgement"
    AND "digital_content_agreement"
  ),
  CONSTRAINT "checkout_consent_evidence_locale_check" CHECK (
    "checkout_locale" IN ('ru', 'en', 'pl')
  ),
  CONSTRAINT "checkout_consent_evidence_currency_check" CHECK (
    "currency" IN ('pln', 'eur')
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_consent_evidence_payment_intent_idx"
ON "checkout_consent_evidence" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "checkout_consent_evidence_checkout_session_idx"
ON "checkout_consent_evidence" USING btree ("checkout_session_id");--> statement-breakpoint
CREATE FUNCTION "reject_checkout_consent_evidence_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'checkout_consent_evidence_is_immutable'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "checkout_consent_evidence_immutable_update"
BEFORE UPDATE ON "checkout_consent_evidence"
FOR EACH ROW
EXECUTE FUNCTION "reject_checkout_consent_evidence_update"();
