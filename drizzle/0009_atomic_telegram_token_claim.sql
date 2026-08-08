-- migration-phase: expand
ALTER TABLE "telegram_access_tokens"
ADD CONSTRAINT "telegram_access_tokens_used_claim_check"
CHECK (
  "status" <> 'used'
  OR NULLIF(BTRIM("telegram_user_id"), '') IS NOT NULL
) NOT VALID;
