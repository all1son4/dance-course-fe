-- migration-phase: expand
ALTER TABLE "email_campaign_leads"
  DROP CONSTRAINT "email_campaign_leads_status_attempts_check";
--> statement-breakpoint
ALTER TABLE "email_campaign_leads"
  ADD CONSTRAINT "email_campaign_leads_status_attempts_check"
  CHECK (
    "email_campaign_leads"."email_send_status" IN (
      'blocked',
      'excluded',
      'failed',
      'pending',
      'sending',
      'sent'
    )
    AND "email_campaign_leads"."email_send_attempts" >= 0
  );
