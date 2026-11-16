-- migration-phase: expand
ALTER TABLE "access_entitlements" ADD COLUMN "period_start_mode" text;--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD COLUMN "paid_duration_days" integer;--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD COLUMN "starts_after_entitlement_id" uuid;--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_starts_after_fk" FOREIGN KEY ("starts_after_entitlement_id") REFERENCES "public"."access_entitlements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_entitlements_starts_after_idx" ON "access_entitlements" USING btree ("starts_after_entitlement_id") WHERE "access_entitlements"."starts_after_entitlement_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_period_start_mode_check" CHECK ("access_entitlements"."period_start_mode" IS NULL OR "access_entitlements"."period_start_mode" IN ('payment', 'after_entitlement'));--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_paid_period_metadata_check" CHECK (
        CASE
          WHEN "access_entitlements"."period_start_mode" IS NULL
            THEN "access_entitlements"."paid_duration_days" IS NULL
              AND "access_entitlements"."starts_after_entitlement_id" IS NULL
          ELSE "access_entitlements"."source_kind" IS NOT NULL
            AND "access_entitlements"."source_kind" = 'standalone_hub'
            AND "access_entitlements"."paid_duration_days" IS NOT NULL
            AND "access_entitlements"."paid_duration_days" = 56
        END
      );--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_period_dependency_check" CHECK (
        CASE
          WHEN "access_entitlements"."period_start_mode" = 'payment'
            THEN "access_entitlements"."starts_after_entitlement_id" IS NULL
          WHEN "access_entitlements"."period_start_mode" = 'after_entitlement'
            THEN "access_entitlements"."starts_after_entitlement_id" IS NOT NULL
          ELSE TRUE
        END
      );--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_period_dates_check" CHECK (
        CASE
          WHEN "access_entitlements"."period_start_mode" = 'payment'
            THEN "access_entitlements"."starts_at" IS NOT NULL
              AND "access_entitlements"."expires_at" IS NOT NULL
              AND "access_entitlements"."expires_at" > "access_entitlements"."starts_at"
          WHEN "access_entitlements"."period_start_mode" = 'after_entitlement'
            THEN ("access_entitlements"."starts_at" IS NULL AND "access_entitlements"."expires_at" IS NULL)
              OR (
                "access_entitlements"."starts_at" IS NOT NULL
                AND "access_entitlements"."expires_at" IS NOT NULL
                AND "access_entitlements"."expires_at" > "access_entitlements"."starts_at"
              )
          ELSE TRUE
        END
      );--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_period_not_self_check" CHECK ("access_entitlements"."starts_after_entitlement_id" IS NULL OR "access_entitlements"."starts_after_entitlement_id" <> "access_entitlements"."id");
