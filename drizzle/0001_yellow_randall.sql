CREATE TABLE "email_campaign_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" text NOT NULL,
	"campaign_key" text NOT NULL,
	"email_send_status" text DEFAULT 'pending' NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"social_contact" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"locale" text DEFAULT '' NOT NULL,
	"email_sent_at" timestamp with time zone,
	"email_send_attempts" integer DEFAULT 0 NOT NULL,
	"last_email_error" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "customer_email_snapshot" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "customer_full_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "customer_telegram_username_snapshot" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "customer_country_snapshot" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "customer_address_line_snapshot" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "customer_city_snapshot" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "customer_postal_code_snapshot" text;--> statement-breakpoint
CREATE UNIQUE INDEX "email_campaign_leads_lead_id_idx" ON "email_campaign_leads" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_campaign_leads_campaign_email_idx" ON "email_campaign_leads" USING btree ("campaign_key","normalized_email");--> statement-breakpoint
CREATE INDEX "email_campaign_leads_campaign_key_idx" ON "email_campaign_leads" USING btree ("campaign_key");--> statement-breakpoint
CREATE INDEX "email_campaign_leads_email_send_status_idx" ON "email_campaign_leads" USING btree ("email_send_status");--> statement-breakpoint
CREATE INDEX "email_campaign_leads_created_at_idx" ON "email_campaign_leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "purchases_customer_email_snapshot_idx" ON "purchases" USING btree ("customer_email_snapshot");--> statement-breakpoint
CREATE INDEX "purchases_product_external_id_idx" ON "purchases" USING btree ("product_external_id");--> statement-breakpoint
CREATE INDEX "purchases_offer_external_id_idx" ON "purchases" USING btree ("offer_external_id");--> statement-breakpoint
CREATE INDEX "purchases_succeeded_at_idx" ON "purchases" USING btree ("succeeded_at");