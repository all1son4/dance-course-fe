-- migration-phase: expand
ALTER TABLE "purchases" ADD COLUMN "terminal_recorded_at" timestamp with time zone;
