-- Read-only, aggregate queue health. This query intentionally returns no PII,
-- provider payloads, recipients, tokens, or error messages.
WITH inbox AS (
  SELECT
    count(*) FILTER (
      WHERE processing_status IN ('pending', 'failed')
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    ) AS ready,
    count(*) FILTER (
      WHERE processing_status = 'processing'
        AND lease_expires_at <= now()
    ) AS stale_leases,
    count(*) FILTER (WHERE processing_status = 'dead_letter') AS dead_letters,
    min(received_at) FILTER (
      WHERE processing_status IN ('pending', 'failed')
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    ) AS oldest_ready_at
  FROM stripe_events
  WHERE provider_payload_verified
), outbox AS (
  SELECT
    count(*) FILTER (
      WHERE status IN ('pending', 'failed')
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    ) AS ready,
    count(*) FILTER (
      WHERE status = 'sending'
        AND lease_expires_at <= now()
    ) AS stale_leases,
    count(*) FILTER (WHERE status = 'dead_letter') AS dead_letters,
    min(created_at) FILTER (
      WHERE status IN ('pending', 'failed')
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    ) AS oldest_ready_at
  FROM purchase_side_effects
  WHERE payload @> '{"_outboxVersion":1}'::jsonb
)
SELECT
  'inbox' AS queue,
  ready,
  stale_leases,
  dead_letters,
  extract(epoch FROM (now() - oldest_ready_at))::int AS oldest_ready_age_seconds
FROM inbox
UNION ALL
SELECT
  'outbox',
  ready,
  stale_leases,
  dead_letters,
  extract(epoch FROM (now() - oldest_ready_at))::int
FROM outbox;
