-- migration-phase: expand
CREATE TABLE "online_group_cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"main_chat_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"previous_cohort_id" uuid,
	"closed_at" timestamp with time zone,
	"access_ends_at" timestamp with time zone,
	"lessons_cleared_at" timestamp with time zone,
	"sales_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "online_group_cohorts_title_check" CHECK (BTRIM("online_group_cohorts"."title") <> ''),
	CONSTRAINT "online_group_cohorts_previous_not_self_check" CHECK ("online_group_cohorts"."previous_cohort_id" IS NULL OR "online_group_cohorts"."previous_cohort_id" <> "online_group_cohorts"."id"),
	CONSTRAINT "online_group_cohorts_closure_pair_check" CHECK (("online_group_cohorts"."closed_at" IS NULL) = ("online_group_cohorts"."access_ends_at" IS NULL)),
	CONSTRAINT "online_group_cohorts_closure_time_check" CHECK ("online_group_cohorts"."closed_at" IS NULL OR (
        "online_group_cohorts"."closed_at" >= "online_group_cohorts"."starts_at"
        AND "online_group_cohorts"."access_ends_at" > "online_group_cohorts"."closed_at"
      )),
	CONSTRAINT "online_group_cohorts_lessons_cleared_check" CHECK ("online_group_cohorts"."closed_at" IS NULL OR (
        "online_group_cohorts"."lessons_cleared_at" IS NOT NULL
        AND "online_group_cohorts"."lessons_cleared_at" <= "online_group_cohorts"."closed_at"
      )),
	CONSTRAINT "online_group_cohorts_sales_open_check" CHECK ("online_group_cohorts"."closed_at" IS NULL OR "online_group_cohorts"."sales_enabled" = false)
);
--> statement-breakpoint
ALTER TABLE "online_group_cohorts" ADD CONSTRAINT "online_group_cohorts_main_chat_fk" FOREIGN KEY ("main_chat_id") REFERENCES "public"."telegram_chats"("chat_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_group_cohorts" ADD CONSTRAINT "online_group_cohorts_previous_fk" FOREIGN KEY ("previous_cohort_id") REFERENCES "public"."online_group_cohorts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "online_group_cohorts_main_chat_idx" ON "online_group_cohorts" USING btree ("main_chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "online_group_cohorts_previous_cohort_idx" ON "online_group_cohorts" USING btree ("previous_cohort_id") WHERE "online_group_cohorts"."previous_cohort_id" IS NOT NULL;
