-- migration-phase: expand
CREATE TABLE "inspiration_hub_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspiration_hub_settings_singleton_check" CHECK ("inspiration_hub_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "inspiration_hub_settings" ADD CONSTRAINT "inspiration_hub_settings_chat_fk" FOREIGN KEY ("telegram_chat_id") REFERENCES "public"."telegram_chats"("chat_id") ON DELETE restrict ON UPDATE no action;
