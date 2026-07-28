CREATE TABLE "online_group_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"regular_chat_id" text NOT NULL,
	"library_chat_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "online_group_payment_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"offer_id" uuid,
	"offer_external_id" text NOT NULL,
	"currency" text NOT NULL,
	"stripe_payment_link_id" text NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"livemode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renewal_campaign_source_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"chat_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "online_group_campaigns" ADD CONSTRAINT "online_group_campaigns_regular_chat_id_telegram_chats_chat_id_fk" FOREIGN KEY ("regular_chat_id") REFERENCES "public"."telegram_chats"("chat_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_group_campaigns" ADD CONSTRAINT "online_group_campaigns_library_chat_id_telegram_chats_chat_id_fk" FOREIGN KEY ("library_chat_id") REFERENCES "public"."telegram_chats"("chat_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_group_payment_links" ADD CONSTRAINT "online_group_payment_links_campaign_id_online_group_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."online_group_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_group_payment_links" ADD CONSTRAINT "online_group_payment_links_offer_id_product_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."product_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_campaign_source_chats" ADD CONSTRAINT "renewal_campaign_source_chats_campaign_id_renewal_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."renewal_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_campaign_source_chats" ADD CONSTRAINT "renewal_campaign_source_chats_chat_id_telegram_chats_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."telegram_chats"("chat_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "renewal_campaign_source_chats" ("campaign_id", "chat_id")
SELECT "id", "source_chat_id" FROM "renewal_campaigns"
ON CONFLICT DO NOTHING;--> statement-breakpoint
DROP INDEX IF EXISTS "renewal_campaigns_active_pair_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "renewal_campaigns_active_target_offer_idx" ON "renewal_campaigns" USING btree ("target_chat_id", "offer_external_id") WHERE "renewal_campaigns"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "online_group_campaigns_single_active_idx" ON "online_group_campaigns" USING btree ("status") WHERE "online_group_campaigns"."status" = 'active';--> statement-breakpoint
CREATE INDEX "online_group_campaigns_created_at_idx" ON "online_group_campaigns" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "online_group_payment_links_stripe_id_idx" ON "online_group_payment_links" USING btree ("stripe_payment_link_id");--> statement-breakpoint
CREATE UNIQUE INDEX "online_group_payment_links_campaign_offer_currency_idx" ON "online_group_payment_links" USING btree ("campaign_id", "offer_external_id", "currency");--> statement-breakpoint
CREATE INDEX "online_group_payment_links_status_idx" ON "online_group_payment_links" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "renewal_campaign_source_chats_campaign_chat_idx" ON "renewal_campaign_source_chats" USING btree ("campaign_id", "chat_id");--> statement-breakpoint
CREATE INDEX "renewal_campaign_source_chats_chat_idx" ON "renewal_campaign_source_chats" USING btree ("chat_id");
