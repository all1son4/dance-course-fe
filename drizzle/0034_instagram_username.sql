-- migration-phase: expand
-- Instagram handle asked at checkout, beside the Telegram fields it replaces there: old Telegram values stay untouched.
ALTER TABLE "customers" ADD COLUMN "instagram_username" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "customer_instagram_username_snapshot" text;
