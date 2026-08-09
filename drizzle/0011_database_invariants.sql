-- migration-phase: expand
CREATE UNIQUE INDEX "product_offers_id_product_id_idx"
ON "product_offers" USING btree ("id", "product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_entitlements_id_purchase_id_idx"
ON "access_entitlements" USING btree ("id", "purchase_id");--> statement-breakpoint
ALTER TABLE "products"
ADD CONSTRAINT "products_type_check"
CHECK ("type" IN ('course', 'choreo')) NOT VALID;--> statement-breakpoint
ALTER TABLE "product_offers"
ADD CONSTRAINT "product_offers_code_check"
CHECK (
  "code" IN (
    'standard',
    'library-access',
    'without-mentor',
    'with-mentor',
    'renewal-discount',
    'renewal-library-access'
  )
) NOT VALID;--> statement-breakpoint
ALTER TABLE "product_offers"
ADD CONSTRAINT "product_offers_ranges_check"
CHECK (
  "sort_order" >= 0
  AND (
    "telegram_access_duration_days" IS NULL
    OR "telegram_access_duration_days" >= 0
  )
) NOT VALID;--> statement-breakpoint
ALTER TABLE "renewal_campaigns"
ADD CONSTRAINT "renewal_campaigns_status_check"
CHECK ("status" IN ('active', 'archived')) NOT VALID;--> statement-breakpoint
ALTER TABLE "online_group_campaigns"
ADD CONSTRAINT "online_group_campaigns_status_check"
CHECK ("status" IN ('active', 'archived')) NOT VALID;--> statement-breakpoint
ALTER TABLE "telegram_renewal_verifications"
ADD CONSTRAINT "telegram_renewal_verifications_status_check"
CHECK ("status" IN ('verified', 'not_member', 'failed')) NOT VALID;--> statement-breakpoint
ALTER TABLE "offer_prices"
ADD CONSTRAINT "offer_prices_currency_check"
CHECK ("currency" IN ('pln', 'eur')) NOT VALID;--> statement-breakpoint
ALTER TABLE "offer_prices"
ADD CONSTRAINT "offer_prices_amount_minor_check"
CHECK ("amount_minor" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "purchases"
ADD CONSTRAINT "purchases_amount_minor_check"
CHECK ("amount_minor" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "purchases"
ADD CONSTRAINT "purchases_currency_check"
CHECK (
  "currency" IN ('pln', 'eur')
  AND (
    "checkout_currency" IS NULL
    OR "checkout_currency" IN ('pln', 'eur')
  )
  AND (
    "settlement_currency" IS NULL
    OR length(btrim("settlement_currency")) = 3
  )
) NOT VALID;--> statement-breakpoint
ALTER TABLE "purchases"
ADD CONSTRAINT "purchases_money_ranges_check"
CHECK (
  (
    "settlement_amount_minor" IS NULL
    OR "settlement_amount_minor" >= 0
  )
  AND (
    "stripe_fee_amount_minor" IS NULL
    OR "stripe_fee_amount_minor" >= 0
  )
) NOT VALID;--> statement-breakpoint
ALTER TABLE "purchases"
ADD CONSTRAINT "purchases_locale_language_check"
CHECK (
  (
    "checkout_locale" IS NULL
    OR "checkout_locale" IN ('ru', 'en', 'pl')
  )
  AND (
    "lesson_language" IS NULL
    OR "lesson_language" IN ('ru', 'en')
  )
) NOT VALID;--> statement-breakpoint
ALTER TABLE "purchases"
ADD CONSTRAINT "purchases_outcome_check"
CHECK (
  "outcome" IN (
    'succeeded',
    'processing',
    'requires_action',
    'failed',
    'canceled'
  )
) NOT VALID;--> statement-breakpoint
ALTER TABLE "purchases"
ADD CONSTRAINT "purchases_source_check"
CHECK ("source" IN ('stripe', 'admin_offer_link')) NOT VALID;--> statement-breakpoint
ALTER TABLE "purchase_side_effects"
ADD CONSTRAINT "purchase_side_effects_attempt_count_check"
CHECK ("attempt_count" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_ranges_check"
CHECK (
  "sequence_year" BETWEEN 2000 AND 9999
  AND "sequence_month" BETWEEN 1 AND 12
  AND "sequence_number" > 0
  AND "amount_minor" >= 0
  AND "currency" IN ('pln', 'eur')
) NOT VALID;--> statement-breakpoint
ALTER TABLE "access_entitlements"
ADD CONSTRAINT "access_entitlements_status_check"
CHECK (
  "status" IN (
    'pending',
    'not_required',
    'token_issued',
    'activated',
    'expired',
    'revoked',
    'left_channel',
    'link_failed',
    'manual_pending',
    'manual_done'
  )
) NOT VALID;--> statement-breakpoint
ALTER TABLE "access_entitlements"
ADD CONSTRAINT "access_entitlements_external_target_type_check"
CHECK (
  "external_target_type" IS NULL
  OR "external_target_type" IN ('telegram_chat', 'telegram_bot', 'manual')
) NOT VALID;--> statement-breakpoint
ALTER TABLE "telegram_access_tokens"
ADD CONSTRAINT "telegram_access_tokens_kind_status_check"
CHECK (
  "link_kind" IN ('channel_invite', 'start_token')
  AND "status" IN ('issued', 'used', 'expired', 'revoked')
) NOT VALID;--> statement-breakpoint
ALTER TABLE "telegram_user_bindings"
ADD CONSTRAINT "telegram_user_bindings_status_check"
CHECK ("status" IN ('active', 'left', 'revoked')) NOT VALID;--> statement-breakpoint
ALTER TABLE "monthly_report_runs"
ADD CONSTRAINT "monthly_report_runs_status_range_check"
CHECK (
  "delivery_status" IN ('sent', 'skipped', 'failed')
  AND "row_count" >= 0
  AND "period_end_utc" > "period_start_utc"
) NOT VALID;--> statement-breakpoint
ALTER TABLE "email_campaign_leads"
ADD CONSTRAINT "email_campaign_leads_status_attempts_check"
CHECK (
  "email_send_status" IN ('blocked', 'excluded', 'failed', 'pending', 'sent')
  AND "email_send_attempts" >= 0
) NOT VALID;--> statement-breakpoint
ALTER TABLE "purchases"
ADD CONSTRAINT "purchases_offer_product_fk"
FOREIGN KEY ("offer_id", "product_id")
REFERENCES "product_offers" ("id", "product_id")
NOT VALID;--> statement-breakpoint
ALTER TABLE "renewal_campaigns"
ADD CONSTRAINT "renewal_campaigns_offer_product_fk"
FOREIGN KEY ("offer_id", "product_id")
REFERENCES "product_offers" ("id", "product_id")
NOT VALID;--> statement-breakpoint
ALTER TABLE "access_entitlements"
ADD CONSTRAINT "access_entitlements_offer_product_fk"
FOREIGN KEY ("offer_id", "product_id")
REFERENCES "product_offers" ("id", "product_id")
NOT VALID;--> statement-breakpoint
ALTER TABLE "telegram_access_tokens"
ADD CONSTRAINT "telegram_access_tokens_entitlement_purchase_fk"
FOREIGN KEY ("entitlement_id", "purchase_id")
REFERENCES "access_entitlements" ("id", "purchase_id")
NOT VALID;--> statement-breakpoint
ALTER TABLE "telegram_user_bindings"
ADD CONSTRAINT "telegram_user_bindings_entitlement_purchase_fk"
FOREIGN KEY ("entitlement_id", "purchase_id")
REFERENCES "access_entitlements" ("id", "purchase_id")
NOT VALID;--> statement-breakpoint
ALTER TABLE "products"
VALIDATE CONSTRAINT "products_type_check";--> statement-breakpoint
ALTER TABLE "product_offers"
VALIDATE CONSTRAINT "product_offers_code_check";--> statement-breakpoint
ALTER TABLE "product_offers"
VALIDATE CONSTRAINT "product_offers_ranges_check";--> statement-breakpoint
ALTER TABLE "renewal_campaigns"
VALIDATE CONSTRAINT "renewal_campaigns_status_check";--> statement-breakpoint
ALTER TABLE "online_group_campaigns"
VALIDATE CONSTRAINT "online_group_campaigns_status_check";--> statement-breakpoint
ALTER TABLE "telegram_renewal_verifications"
VALIDATE CONSTRAINT "telegram_renewal_verifications_status_check";--> statement-breakpoint
ALTER TABLE "offer_prices"
VALIDATE CONSTRAINT "offer_prices_currency_check";--> statement-breakpoint
ALTER TABLE "offer_prices"
VALIDATE CONSTRAINT "offer_prices_amount_minor_check";--> statement-breakpoint
ALTER TABLE "purchases"
VALIDATE CONSTRAINT "purchases_amount_minor_check";--> statement-breakpoint
ALTER TABLE "purchases"
VALIDATE CONSTRAINT "purchases_currency_check";--> statement-breakpoint
ALTER TABLE "purchases"
VALIDATE CONSTRAINT "purchases_money_ranges_check";--> statement-breakpoint
ALTER TABLE "purchases"
VALIDATE CONSTRAINT "purchases_locale_language_check";--> statement-breakpoint
ALTER TABLE "purchases"
VALIDATE CONSTRAINT "purchases_outcome_check";--> statement-breakpoint
ALTER TABLE "purchases"
VALIDATE CONSTRAINT "purchases_source_check";--> statement-breakpoint
ALTER TABLE "purchase_side_effects"
VALIDATE CONSTRAINT "purchase_side_effects_attempt_count_check";--> statement-breakpoint
ALTER TABLE "invoices"
VALIDATE CONSTRAINT "invoices_ranges_check";--> statement-breakpoint
ALTER TABLE "access_entitlements"
VALIDATE CONSTRAINT "access_entitlements_status_check";--> statement-breakpoint
ALTER TABLE "access_entitlements"
VALIDATE CONSTRAINT "access_entitlements_external_target_type_check";--> statement-breakpoint
ALTER TABLE "telegram_access_tokens"
VALIDATE CONSTRAINT "telegram_access_tokens_kind_status_check";--> statement-breakpoint
ALTER TABLE "telegram_user_bindings"
VALIDATE CONSTRAINT "telegram_user_bindings_status_check";--> statement-breakpoint
ALTER TABLE "monthly_report_runs"
VALIDATE CONSTRAINT "monthly_report_runs_status_range_check";--> statement-breakpoint
ALTER TABLE "email_campaign_leads"
VALIDATE CONSTRAINT "email_campaign_leads_status_attempts_check";--> statement-breakpoint
ALTER TABLE "purchases"
VALIDATE CONSTRAINT "purchases_offer_product_fk";--> statement-breakpoint
ALTER TABLE "renewal_campaigns"
VALIDATE CONSTRAINT "renewal_campaigns_offer_product_fk";--> statement-breakpoint
ALTER TABLE "access_entitlements"
VALIDATE CONSTRAINT "access_entitlements_offer_product_fk";--> statement-breakpoint
ALTER TABLE "telegram_access_tokens"
VALIDATE CONSTRAINT "telegram_access_tokens_entitlement_purchase_fk";--> statement-breakpoint
ALTER TABLE "telegram_user_bindings"
VALIDATE CONSTRAINT "telegram_user_bindings_entitlement_purchase_fk";
