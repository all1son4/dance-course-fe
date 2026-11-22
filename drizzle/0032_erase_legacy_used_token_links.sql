-- migration-phase: expand
-- HARD-03 repair. Rows marked used before the claim check existed (0009, NOT VALID)
-- have no owner, and Postgres rejects any UPDATE of them, so the nightly sweep cannot
-- erase their clear links. Erase them with the check lifted inside this transaction,
-- then restore it exactly as it was: still enforced on every write, still NOT VALID.
ALTER TABLE "telegram_access_tokens"
DROP CONSTRAINT "telegram_access_tokens_used_claim_check";--> statement-breakpoint
UPDATE "telegram_access_tokens"
SET "token_value" = NULL
WHERE "token_value" IS NOT NULL
  AND "status" = 'used'
  AND NULLIF(BTRIM("telegram_user_id"), '') IS NULL;--> statement-breakpoint
ALTER TABLE "telegram_access_tokens"
ADD CONSTRAINT "telegram_access_tokens_used_claim_check"
CHECK (
  "status" <> 'used'
  OR NULLIF(BTRIM("telegram_user_id"), '') IS NOT NULL
) NOT VALID;
