-- migration-phase: expand
ALTER TABLE "purchase_side_effects"
ALTER COLUMN "purchase_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_side_effects"
ADD COLUMN "deduplication_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_side_effects"
ADD COLUMN "payload" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_side_effects"
ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_side_effects"
ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_side_effects"
ADD COLUMN "dead_lettered_at" timestamp with time zone;--> statement-breakpoint
UPDATE "purchase_side_effects"
SET "deduplication_key" = 'purchase:' || "purchase_id"::text || ':' || "kind"
WHERE btrim("deduplication_key") = '';--> statement-breakpoint
CREATE FUNCTION "populate_purchase_side_effect_deduplication_key"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(btrim(NEW."deduplication_key"), '') IS NULL THEN
    IF NEW."purchase_id" IS NULL THEN
      RAISE EXCEPTION 'purchase_side_effect_deduplication_key_required'
        USING ERRCODE = '23502';
    END IF;

    NEW."deduplication_key" :=
      'purchase:' || NEW."purchase_id"::text || ':' || NEW."kind";
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "purchase_side_effects_populate_deduplication_key"
BEFORE INSERT OR UPDATE OF "deduplication_key", "purchase_id", "kind"
ON "purchase_side_effects"
FOR EACH ROW
EXECUTE FUNCTION "populate_purchase_side_effect_deduplication_key"();--> statement-breakpoint
ALTER TABLE "purchase_side_effects"
ADD CONSTRAINT "purchase_side_effects_lifecycle_check"
CHECK (
  btrim("deduplication_key") <> ''
  AND jsonb_typeof("payload") = 'object'
  AND "status" IN (
    'pending',
    'sending',
    'sent',
    'skipped',
    'failed',
    'dead_letter'
  )
  AND (
    "status" <> 'dead_letter'
    OR "dead_lettered_at" IS NOT NULL
  )
) NOT VALID;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_side_effects_deduplication_key_idx"
ON "purchase_side_effects" USING btree ("deduplication_key");--> statement-breakpoint
CREATE INDEX "purchase_side_effects_claim_idx"
ON "purchase_side_effects" USING btree (
  "status",
  "next_attempt_at",
  "lease_expires_at",
  "created_at"
)
WHERE "status" IN ('pending', 'sending', 'failed');--> statement-breakpoint
CREATE TABLE "invoice_sequences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sequence_year" integer NOT NULL,
  "sequence_month" integer NOT NULL,
  "last_sequence" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "invoice_sequences_ranges_check" CHECK (
    "sequence_year" BETWEEN 2000 AND 9999
    AND "sequence_month" BETWEEN 1 AND 12
    AND "last_sequence" > 0
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_sequences_year_month_idx"
ON "invoice_sequences" USING btree ("sequence_year", "sequence_month");--> statement-breakpoint
INSERT INTO "invoice_sequences" (
  "sequence_year",
  "sequence_month",
  "last_sequence"
)
SELECT
  "sequence_year",
  "sequence_month",
  max("sequence_number")
FROM "invoices"
GROUP BY "sequence_year", "sequence_month"
ON CONFLICT ("sequence_year", "sequence_month") DO UPDATE
SET
  "last_sequence" = GREATEST(
    "invoice_sequences"."last_sequence",
    EXCLUDED."last_sequence"
  ),
  "updated_at" = now();--> statement-breakpoint
ALTER TABLE "purchase_side_effects"
VALIDATE CONSTRAINT "purchase_side_effects_lifecycle_check";
