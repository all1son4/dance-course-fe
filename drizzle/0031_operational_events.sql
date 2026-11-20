-- migration-phase: expand
CREATE TABLE "operational_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" text NOT NULL,
	"area" text NOT NULL,
	"event" text NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"severity" text DEFAULT 'error' NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reference" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operational_events_area_check" CHECK ("operational_events"."area" IN ('telegram', 'stripe', 'email', 'database', 'app')),
	CONSTRAINT "operational_events_severity_check" CHECK ("operational_events"."severity" IN ('error', 'warning')),
	CONSTRAINT "operational_events_occurrences_check" CHECK ("operational_events"."occurrences" > 0)
);
--> statement-breakpoint
ALTER TABLE "purchase_side_effects" ADD COLUMN "dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "admin_archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD COLUMN "dismissed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "operational_events_group_idx" ON "operational_events" USING btree ("day","area","event","code");--> statement-breakpoint
CREATE INDEX "operational_events_last_seen_idx" ON "operational_events" USING btree ("last_seen_at");