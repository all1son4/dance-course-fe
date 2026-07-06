ALTER TABLE "purchases" ADD COLUMN "stripe_fee_amount_minor" integer;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "stripe_net_amount_minor" integer;