-- migration-phase: expand
ALTER TABLE "stripe_events"
ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stripe_events"
ADD COLUMN "provider_payload_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stripe_events"
ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stripe_events"
ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stripe_events"
ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stripe_events"
ADD COLUMN "lease_token" text;--> statement-breakpoint
ALTER TABLE "stripe_events"
ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stripe_events"
ADD COLUMN "dead_lettered_at" timestamp with time zone;--> statement-breakpoint
UPDATE "stripe_events"
SET "received_at" = COALESCE("stripe_created_at", "created_at", now())
WHERE "received_at" IS NULL;--> statement-breakpoint
ALTER TABLE "stripe_events"
ALTER COLUMN "received_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "stripe_events"
ALTER COLUMN "received_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stripe_events"
ADD CONSTRAINT "stripe_events_evidence_check"
CHECK (
  btrim("stripe_event_id") <> ''
  AND btrim("event_type") <> ''
  AND jsonb_typeof("payload") = 'object'
  AND (
    NOT "provider_payload_verified"
    OR "stripe_created_at" IS NOT NULL
  )
) NOT VALID;--> statement-breakpoint
ALTER TABLE "stripe_events"
ADD CONSTRAINT "stripe_events_lifecycle_check"
CHECK (
  "processing_status" IN (
    'pending',
    'processing',
    'processed',
    'skipped',
    'failed',
    'dead_letter'
  )
  AND "attempt_count" >= 0
  AND (
    "processing_status" <> 'processing'
    OR (
      NULLIF(btrim("lease_token"), '') IS NOT NULL
      AND "lease_expires_at" IS NOT NULL
    )
  )
  AND (
    "processing_status" <> 'dead_letter'
    OR "dead_lettered_at" IS NOT NULL
  )
  AND (
    "processing_status" NOT IN ('processed', 'skipped')
    OR "processed_at" IS NOT NULL
  )
) NOT VALID;--> statement-breakpoint
CREATE INDEX "stripe_events_inbox_claim_idx"
ON "stripe_events" USING btree (
  "processing_status",
  "next_attempt_at",
  "lease_expires_at",
  "received_at"
)
WHERE "processing_status" IN ('pending', 'processing', 'failed');--> statement-breakpoint
CREATE FUNCTION "reject_verified_stripe_event_evidence_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."provider_payload_verified" AND (
    NOT NEW."provider_payload_verified"
    OR NEW."stripe_event_id" IS DISTINCT FROM OLD."stripe_event_id"
    OR NEW."event_type" IS DISTINCT FROM OLD."event_type"
    OR NEW."stripe_created_at" IS DISTINCT FROM OLD."stripe_created_at"
    OR NEW."livemode" IS DISTINCT FROM OLD."livemode"
    OR NEW."api_version" IS DISTINCT FROM OLD."api_version"
    OR NEW."payload" IS DISTINCT FROM OLD."payload"
    OR NEW."received_at" IS DISTINCT FROM OLD."received_at"
  ) THEN
    RAISE EXCEPTION 'verified_stripe_event_evidence_is_immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "stripe_events_immutable_evidence_update"
BEFORE UPDATE ON "stripe_events"
FOR EACH ROW
EXECUTE FUNCTION "reject_verified_stripe_event_evidence_update"();--> statement-breakpoint
ALTER TABLE "stripe_events"
VALIDATE CONSTRAINT "stripe_events_evidence_check";--> statement-breakpoint
ALTER TABLE "stripe_events"
VALIDATE CONSTRAINT "stripe_events_lifecycle_check";
