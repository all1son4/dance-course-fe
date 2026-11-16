-- migration-phase: expand
ALTER TABLE "online_group_cohorts" ADD COLUMN "duration_weeks" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "online_group_cohorts" ADD CONSTRAINT "online_group_cohorts_duration_weeks_check" CHECK ("online_group_cohorts"."duration_weeks" BETWEEN 1 AND 26);
