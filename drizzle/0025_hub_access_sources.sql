-- migration-phase: expand
ALTER TABLE "access_entitlements" ADD COLUMN "source_kind" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "online_group_cohort_id" uuid;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "telegram_user_id" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_online_group_cohort_fk" FOREIGN KEY ("online_group_cohort_id") REFERENCES "public"."online_group_cohorts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchases_online_group_cohort_idx" ON "purchases" USING btree ("online_group_cohort_id");--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_source_kind_check" CHECK ("access_entitlements"."source_kind" IS NULL OR "access_entitlements"."source_kind" IN ('online_group', 'standalone_hub', 'hub_bridge'));--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_source_key_check" CHECK (
        CASE
          WHEN "access_entitlements"."source_kind" = 'online_group'
            THEN "access_entitlements"."access_key" IN ('primary', 'inspiration-hub')
          WHEN "access_entitlements"."source_kind" = 'standalone_hub'
            THEN "access_entitlements"."access_key" = 'inspiration-hub'
          WHEN "access_entitlements"."source_kind" = 'hub_bridge'
            THEN "access_entitlements"."access_key" = 'inspiration-hub-bridge'
          ELSE TRUE
        END
      );--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_telegram_user_id_check" CHECK ("purchases"."telegram_user_id" IS NULL OR BTRIM("purchases"."telegram_user_id") <> '');
