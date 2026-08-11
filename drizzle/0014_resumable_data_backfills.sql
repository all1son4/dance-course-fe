-- migration-phase: expand
CREATE TABLE "data_backfill_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "backfill_key" text NOT NULL,
  "target_environment" text NOT NULL,
  "source_capture_id" text NOT NULL,
  "source_fingerprint" text NOT NULL,
  "source_cut_off_at" timestamp with time zone NOT NULL,
  "source_row_counts" jsonb NOT NULL,
  "batch_size" integer NOT NULL,
  "stage" text NOT NULL,
  "next_row_index" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "stats" jsonb NOT NULL,
  "last_error_code" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "data_backfill_runs_identity_check" CHECK (
    BTRIM("backfill_key") <> ''
    AND BTRIM("source_capture_id") <> ''
    AND "source_fingerprint" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "data_backfill_runs_state_check" CHECK (
    "target_environment" IN ('development', 'production')
    AND "status" IN ('running', 'failed', 'completed')
    AND "stage" IN (
      'payments',
      'stripeEvents',
      'telegramAccessTokens',
      'telegramUserBindings',
      'monthlyReportRuns',
      'emailCampaignLeads'
    )
    AND "batch_size" BETWEEN 1 AND 500
    AND "next_row_index" >= 0
    AND JSONB_TYPEOF("source_row_counts") = 'object'
    AND JSONB_TYPEOF("stats") = 'object'
    AND (
      "status" <> 'completed'
      OR "completed_at" IS NOT NULL
    )
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX "data_backfill_runs_source_idx"
ON "data_backfill_runs" USING btree (
  "backfill_key",
  "target_environment",
  "source_fingerprint"
);--> statement-breakpoint
CREATE INDEX "data_backfill_runs_status_idx"
ON "data_backfill_runs" USING btree (
  "target_environment",
  "status",
  "updated_at"
);
