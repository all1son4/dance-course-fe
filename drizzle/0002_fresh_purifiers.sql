ALTER TABLE "purchases" ADD COLUMN "settlement_amount_minor" integer;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "settlement_currency" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "stripe_balance_transaction_id" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "stripe_exchange_rate" text;--> statement-breakpoint
CREATE INDEX "purchases_stripe_balance_transaction_id_idx" ON "purchases" USING btree ("stripe_balance_transaction_id");