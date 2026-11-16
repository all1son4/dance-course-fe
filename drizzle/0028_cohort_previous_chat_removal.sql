-- migration-phase: expand
ALTER TABLE "online_group_cohorts" ADD COLUMN "removes_previous_chat_members" boolean DEFAULT false NOT NULL;
