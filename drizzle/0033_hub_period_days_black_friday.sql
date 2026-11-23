-- migration-phase: expand
-- Black Friday 2026: a full-price Hub period may last 112 days (16 weeks for the price of 8).
ALTER TABLE "access_entitlements" DROP CONSTRAINT "access_entitlements_paid_period_metadata_check";--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_paid_period_metadata_check" CHECK (
        CASE
          WHEN "access_entitlements"."period_start_mode" IS NULL
            THEN "access_entitlements"."paid_duration_days" IS NULL
              AND "access_entitlements"."starts_after_entitlement_id" IS NULL
          ELSE "access_entitlements"."source_kind" IS NOT NULL
            AND "access_entitlements"."source_kind" = 'standalone_hub'
            AND "access_entitlements"."paid_duration_days" IS NOT NULL
            AND "access_entitlements"."paid_duration_days" IN (56, 112)
        END
      );