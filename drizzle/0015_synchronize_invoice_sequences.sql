-- migration-phase: expand
CREATE FUNCTION "synchronize_invoice_sequence_from_invoice"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'invoice-sequence:' || NEW."sequence_year" || ':' || NEW."sequence_month",
      0
    )
  );

  INSERT INTO "invoice_sequences" (
    "sequence_year",
    "sequence_month",
    "last_sequence"
  )
  VALUES (
    NEW."sequence_year",
    NEW."sequence_month",
    NEW."sequence_number"
  )
  ON CONFLICT ("sequence_year", "sequence_month") DO UPDATE
  SET
    "last_sequence" = EXCLUDED."last_sequence",
    "updated_at" = now()
  WHERE "invoice_sequences"."last_sequence" < EXCLUDED."last_sequence";

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "invoices_synchronize_sequence"
BEFORE INSERT OR UPDATE OF "sequence_year", "sequence_month", "sequence_number"
ON "invoices"
FOR EACH ROW
EXECUTE FUNCTION "synchronize_invoice_sequence_from_invoice"();--> statement-breakpoint
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
  "last_sequence" = EXCLUDED."last_sequence",
  "updated_at" = now()
WHERE "invoice_sequences"."last_sequence" < EXCLUDED."last_sequence";
