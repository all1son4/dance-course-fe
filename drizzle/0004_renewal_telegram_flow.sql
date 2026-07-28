CREATE TABLE "telegram_chats" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"registered_by_telegram_user_id" text,
	"registered_by_telegram_username" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renewal_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source_chat_id" text NOT NULL,
	"target_chat_id" text NOT NULL,
	"product_id" uuid,
	"offer_id" uuid,
	"product_external_id" text NOT NULL,
	"offer_external_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "renewal_campaigns_slug_idx" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "telegram_renewal_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"checkout_session_id" text NOT NULL,
	"telegram_user_id" text NOT NULL,
	"telegram_username" text,
	"telegram_name" text,
	"source_chat_id" text NOT NULL,
	"target_chat_id" text NOT NULL,
	"status" text NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_renewal_verifications_checkout_campaign_idx" UNIQUE("checkout_session_id","campaign_id")
);
--> statement-breakpoint
ALTER TABLE "renewal_campaigns" ADD CONSTRAINT "renewal_campaigns_source_chat_id_telegram_chats_chat_id_fk" FOREIGN KEY ("source_chat_id") REFERENCES "public"."telegram_chats"("chat_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_campaigns" ADD CONSTRAINT "renewal_campaigns_target_chat_id_telegram_chats_chat_id_fk" FOREIGN KEY ("target_chat_id") REFERENCES "public"."telegram_chats"("chat_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_campaigns" ADD CONSTRAINT "renewal_campaigns_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_campaigns" ADD CONSTRAINT "renewal_campaigns_offer_id_product_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."product_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_renewal_verifications" ADD CONSTRAINT "telegram_renewal_verifications_campaign_id_renewal_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."renewal_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_chats_is_active_idx" ON "telegram_chats" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "telegram_chats_title_idx" ON "telegram_chats" USING btree ("title");--> statement-breakpoint
CREATE INDEX "renewal_campaigns_status_idx" ON "renewal_campaigns" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "renewal_campaigns_active_pair_idx" ON "renewal_campaigns" USING btree ("source_chat_id","target_chat_id") WHERE "renewal_campaigns"."status" = 'active';--> statement-breakpoint
CREATE INDEX "renewal_campaigns_source_chat_idx" ON "renewal_campaigns" USING btree ("source_chat_id");--> statement-breakpoint
CREATE INDEX "renewal_campaigns_target_chat_idx" ON "renewal_campaigns" USING btree ("target_chat_id");--> statement-breakpoint
CREATE INDEX "telegram_renewal_verifications_user_idx" ON "telegram_renewal_verifications" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE INDEX "telegram_renewal_verifications_expires_idx" ON "telegram_renewal_verifications" USING btree ("expires_at");
