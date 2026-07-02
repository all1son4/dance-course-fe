CREATE TABLE "access_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"customer_id" uuid,
	"product_id" uuid,
	"offer_id" uuid,
	"delivery_channel" text,
	"access_workflow" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"external_target_type" text,
	"telegram_chat_id" text,
	"telegram_user_id" text,
	"telegram_username" text,
	"current_token_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"normalized_email" text,
	"full_name" text,
	"telegram_username" text,
	"country" text,
	"address_line" text,
	"city" text,
	"postal_code" text,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"sequence_year" integer NOT NULL,
	"sequence_month" integer NOT NULL,
	"sequence_number" integer NOT NULL,
	"buyer_name_snapshot" text,
	"buyer_email_snapshot" text,
	"buyer_address_snapshot" text,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"pdf_storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_report_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_key" text NOT NULL,
	"report_family" text NOT NULL,
	"period_start_utc" timestamp with time zone NOT NULL,
	"period_end_utc" timestamp with time zone NOT NULL,
	"generated_at_utc" timestamp with time zone NOT NULL,
	"delivery_status" text NOT NULL,
	"delivered_at_utc" timestamp with time zone,
	"delivered_to" text,
	"row_count" integer DEFAULT 0 NOT NULL,
	"csv_sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_offer_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"label_key" text,
	"delivery_channel" text,
	"access_workflow" text,
	"telegram_access_duration_days" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"external_product_id" text NOT NULL,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"title_key" text,
	"description" jsonb NOT NULL,
	"description_keys" jsonb NOT NULL,
	"access_note" text,
	"access_note_key" text,
	"default_offer_external_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_side_effects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"provider" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"recipient" text,
	"external_message_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"last_error_message" text,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_intent_id" text NOT NULL,
	"checkout_session_id" text,
	"customer_id" uuid,
	"product_id" uuid,
	"offer_id" uuid,
	"product_external_id" text,
	"offer_external_id" text,
	"product_title_snapshot" text,
	"offer_label_snapshot" text,
	"purchase_item_snapshot" text,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"checkout_currency" text,
	"checkout_locale" text,
	"lesson_language" text,
	"stripe_status" text NOT NULL,
	"outcome" text NOT NULL,
	"latest_event_id" text,
	"latest_event_type" text,
	"last_payment_error_code" text,
	"last_payment_error_message" text,
	"source" text DEFAULT 'stripe' NOT NULL,
	"livemode" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"succeeded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payment_intent_id" text,
	"purchase_id" uuid,
	"stripe_created_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"processing_status" text NOT NULL,
	"payment_status_snapshot" text,
	"outcome_snapshot" text,
	"livemode" boolean DEFAULT false NOT NULL,
	"api_version" text,
	"payload" jsonb NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_value" text,
	"purchase_id" uuid NOT NULL,
	"entitlement_id" uuid,
	"product_id" uuid,
	"offer_id" uuid,
	"customer_email_snapshot" text,
	"link_kind" text NOT NULL,
	"chat_id" text,
	"access_expires_at" timestamp with time zone,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"telegram_user_id" text,
	"telegram_username" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_user_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"entitlement_id" uuid,
	"telegram_user_id" text NOT NULL,
	"telegram_username" text,
	"customer_email_snapshot" text,
	"product_id" uuid,
	"offer_id" uuid,
	"chat_id" text,
	"invite_link" text,
	"bound_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"access_expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_offer_id_product_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."product_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_prices" ADD CONSTRAINT "offer_prices_offer_id_product_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."product_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_offers" ADD CONSTRAINT "product_offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_side_effects" ADD CONSTRAINT "purchase_side_effects_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_offer_id_product_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."product_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_access_tokens" ADD CONSTRAINT "telegram_access_tokens_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_access_tokens" ADD CONSTRAINT "telegram_access_tokens_entitlement_id_access_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."access_entitlements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_access_tokens" ADD CONSTRAINT "telegram_access_tokens_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_access_tokens" ADD CONSTRAINT "telegram_access_tokens_offer_id_product_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."product_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_user_bindings" ADD CONSTRAINT "telegram_user_bindings_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_user_bindings" ADD CONSTRAINT "telegram_user_bindings_entitlement_id_access_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."access_entitlements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_user_bindings" ADD CONSTRAINT "telegram_user_bindings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_user_bindings" ADD CONSTRAINT "telegram_user_bindings_offer_id_product_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."product_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_entitlements_purchase_id_idx" ON "access_entitlements" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "access_entitlements_status_idx" ON "access_entitlements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "access_entitlements_telegram_user_idx" ON "access_entitlements" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE INDEX "access_entitlements_expires_at_idx" ON "access_entitlements" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "customers_normalized_email_idx" ON "customers" USING btree ("normalized_email");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_stripe_customer_id_idx" ON "customers" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_purchase_id_idx" ON "invoices" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_invoice_number_idx" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_sequence_idx" ON "invoices" USING btree ("sequence_year","sequence_month","sequence_number");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_report_runs_report_key_idx" ON "monthly_report_runs" USING btree ("report_key");--> statement-breakpoint
CREATE INDEX "monthly_report_runs_period_idx" ON "monthly_report_runs" USING btree ("period_start_utc","period_end_utc");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_prices_offer_currency_idx" ON "offer_prices" USING btree ("offer_id","currency");--> statement-breakpoint
CREATE INDEX "offer_prices_currency_idx" ON "offer_prices" USING btree ("currency");--> statement-breakpoint
CREATE UNIQUE INDEX "product_offers_external_offer_id_idx" ON "product_offers" USING btree ("external_offer_id");--> statement-breakpoint
CREATE INDEX "product_offers_product_id_idx" ON "product_offers" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_offers_product_code_idx" ON "product_offers" USING btree ("product_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "products_code_idx" ON "products" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "products_external_product_id_idx" ON "products" USING btree ("external_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_idx" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_side_effects_purchase_kind_idx" ON "purchase_side_effects" USING btree ("purchase_id","kind");--> statement-breakpoint
CREATE INDEX "purchase_side_effects_status_idx" ON "purchase_side_effects" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_payment_intent_id_idx" ON "purchases" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "purchases_checkout_session_id_idx" ON "purchases" USING btree ("checkout_session_id");--> statement-breakpoint
CREATE INDEX "purchases_customer_id_idx" ON "purchases" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "purchases_product_offer_idx" ON "purchases" USING btree ("product_id","offer_id");--> statement-breakpoint
CREATE INDEX "purchases_outcome_succeeded_at_idx" ON "purchases" USING btree ("outcome","succeeded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_events_stripe_event_id_idx" ON "stripe_events" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX "stripe_events_payment_intent_id_idx" ON "stripe_events" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "stripe_events_purchase_id_idx" ON "stripe_events" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "stripe_events_processed_at_idx" ON "stripe_events" USING btree ("processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_access_tokens_token_id_idx" ON "telegram_access_tokens" USING btree ("token_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_access_tokens_token_hash_idx" ON "telegram_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "telegram_access_tokens_purchase_id_idx" ON "telegram_access_tokens" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "telegram_access_tokens_status_expires_at_idx" ON "telegram_access_tokens" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_user_bindings_purchase_chat_idx" ON "telegram_user_bindings" USING btree ("purchase_id","chat_id");--> statement-breakpoint
CREATE INDEX "telegram_user_bindings_telegram_user_chat_idx" ON "telegram_user_bindings" USING btree ("telegram_user_id","chat_id");--> statement-breakpoint
CREATE INDEX "telegram_user_bindings_status_idx" ON "telegram_user_bindings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "telegram_user_bindings_customer_email_idx" ON "telegram_user_bindings" USING btree ("customer_email_snapshot");