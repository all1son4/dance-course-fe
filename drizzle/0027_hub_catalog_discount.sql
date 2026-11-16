-- migration-phase: expand
CREATE TABLE "hub_discount_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkout_session_id" text NOT NULL,
	"telegram_user_id" text NOT NULL,
	"telegram_username" text,
	"basis" text,
	"cohort_id" uuid,
	"status" text NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_discount_verifications_status_check" CHECK ("hub_discount_verifications"."status" IN ('verified', 'not_member', 'failed')),
	CONSTRAINT "hub_discount_verifications_basis_check" CHECK ("hub_discount_verifications"."basis" IS NULL OR "hub_discount_verifications"."basis" IN ('cohort_chat', 'active_hub')),
	CONSTRAINT "hub_discount_verifications_verified_check" CHECK (CASE
        WHEN "hub_discount_verifications"."status" = 'verified'
          THEN "hub_discount_verifications"."basis" IS NOT NULL AND "hub_discount_verifications"."verified_at" IS NOT NULL
        ELSE "hub_discount_verifications"."basis" IS NULL
      END),
	CONSTRAINT "hub_discount_verifications_cohort_check" CHECK (("hub_discount_verifications"."basis" IS NOT DISTINCT FROM 'cohort_chat') = ("hub_discount_verifications"."cohort_id" IS NOT NULL)),
	CONSTRAINT "hub_discount_verifications_ids_check" CHECK (BTRIM("hub_discount_verifications"."checkout_session_id") <> ''
        AND BTRIM("hub_discount_verifications"."telegram_user_id") <> '')
);
--> statement-breakpoint
ALTER TABLE "product_offers" DROP CONSTRAINT "product_offers_code_check";--> statement-breakpoint
ALTER TABLE "hub_discount_verifications" ADD CONSTRAINT "hub_discount_verifications_cohort_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."online_group_cohorts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hub_discount_verifications_checkout_idx" ON "hub_discount_verifications" USING btree ("checkout_session_id");--> statement-breakpoint
ALTER TABLE "product_offers" ADD CONSTRAINT "product_offers_code_check" CHECK ("product_offers"."code" IN (
        'standard',
        'library-access',
        'without-mentor',
        'with-mentor',
        'renewal-discount',
        'renewal-library-access',
        'hub-access',
        'hub-renewal'
      ));