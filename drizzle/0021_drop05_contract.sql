-- migration-phase: contract
-- Drizzle applies this migration and its journal entry in one transaction.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '30s';--> statement-breakpoint
LOCK TABLE "purchase_side_effects", "invoices", "data_backfill_runs"
  IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'purchases'::regclass
      AND attname = 'invite_history_created_at'
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'contract_invite_history_column_missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "purchase_side_effects"
    WHERE "kind" = 'google_sheets_export'
       OR ("provider" = 'google_sheets'
           AND "kind" <> 'successful_customer_export')
  ) THEN
    RAISE EXCEPTION 'contract_unexpected_legacy_export';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "purchase_side_effects"
    WHERE "kind" = 'successful_customer_export'
      AND "payload" @> '{"_outboxVersion":1}'::jsonb
      AND "status" NOT IN ('sent', 'skipped')
  ) OR EXISTS (
    SELECT 1 FROM "purchase_side_effects"
    WHERE "kind" = 'successful_customer_export'
      AND ("lease_token" IS NOT NULL OR "lease_expires_at" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'contract_retired_export_still_active';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "purchases" AS purchase
    INNER JOIN "purchase_side_effects" AS effect
      ON effect."purchase_id" = purchase."id"
      AND effect."kind" = 'successful_customer_export'
    WHERE effect."sent_at" IS NOT NULL
      AND effect."sent_at" IS DISTINCT FROM COALESCE(
        purchase."invite_history_created_at",
        purchase."first_seen_at",
        purchase."updated_at"
      )
  ) THEN
    RAISE EXCEPTION 'contract_invite_history_date_mismatch';
  END IF;

  IF EXISTS (SELECT 1 FROM "invoices" WHERE "pdf_storage_key" IS NOT NULL) THEN
    RAISE EXCEPTION 'contract_invoice_pdf_key_present';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "data_backfill_runs"
    WHERE "status" <> 'completed' OR "completed_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'contract_backfill_incomplete';
  END IF;
END
$$;--> statement-breakpoint
DELETE FROM "purchase_side_effects"
WHERE "kind" IN ('successful_customer_export', 'google_sheets_export');--> statement-breakpoint
ALTER TABLE "purchase_side_effects"
  ADD CONSTRAINT "purchase_side_effects_retired_values_check"
  CHECK (
    "kind" NOT IN ('successful_customer_export', 'google_sheets_export')
    AND "provider" IS DISTINCT FROM 'google_sheets'
  );--> statement-breakpoint
DROP TABLE "data_backfill_runs";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "pdf_storage_key";
