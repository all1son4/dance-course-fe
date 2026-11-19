-- migration-phase: expand
ALTER TABLE "purchases" ADD COLUMN "admin_note" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "invitation_kind" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_invitation_kind_check" CHECK ("purchases"."invitation_kind" IS NULL
        OR ("purchases"."invitation_kind" IN ('join', 'renewal')
          AND "purchases"."source" = 'admin_offer_link'));