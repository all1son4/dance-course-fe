-- migration-phase: expand
ALTER TABLE "purchases" ADD COLUMN "invite_history_created_at" timestamp with time zone;
--> statement-breakpoint
-- Preserve exact PostgreSQL timestamps, including purchases with no current link.
-- Never replace an already preserved value or touch payment/accounting timestamps.
-- The backfill is repeatable; the migration runner applies the ADD COLUMN only once.
UPDATE "purchases" AS purchase
SET "invite_history_created_at" = effect."sent_at"
FROM "purchase_side_effects" AS effect
WHERE effect."purchase_id" = purchase."id"
  AND effect."kind" = 'successful_customer_export'
  AND effect."sent_at" IS NOT NULL
  AND purchase."invite_history_created_at" IS NULL;
--> statement-breakpoint
-- Fail the whole migration instead of silently accepting a conflicting date.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "purchases" AS purchase
    INNER JOIN "purchase_side_effects" AS effect
      ON effect."purchase_id" = purchase."id"
      AND effect."kind" = 'successful_customer_export'
    WHERE effect."sent_at" IS NOT NULL
      AND purchase."invite_history_created_at" IS DISTINCT FROM effect."sent_at"
  ) THEN
    RAISE EXCEPTION 'invite_history_timestamp_preservation_mismatch';
  END IF;
END
$$;
