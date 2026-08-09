import { getDatabaseClient } from "./client";
import { getDatabaseEnvSelection } from "./env";
import { loadDatabaseEnvConfig } from "./load-env";

loadDatabaseEnvConfig();

type QueueStatusRow = {
  deadLetters: number;
  oldestReadyAgeSeconds: number | null;
  ready: number;
  retries: number;
  staleLeases: number;
  working: number;
};

const toQueueStatus = (row: QueueStatusRow | undefined) =>
  row ?? {
    deadLetters: 0,
    oldestReadyAgeSeconds: null,
    ready: 0,
    retries: 0,
    staleLeases: 0,
    working: 0,
  };

export const readOperationalDatabaseStatus = async () => {
  const client = getDatabaseClient();
  const [inboxRows, outboxRows, accessRows, projectionRows, reportRows] =
    await Promise.all([
      client<QueueStatusRow[]>`
        SELECT
          count(*) FILTER (
            WHERE processing_status IN ('pending', 'failed')
              AND (next_attempt_at IS NULL OR next_attempt_at <= now())
          )::int AS "ready",
          count(*) FILTER (WHERE processing_status = 'processing')::int AS "working",
          count(*) FILTER (
            WHERE processing_status = 'processing'
              AND lease_expires_at <= now()
          )::int AS "staleLeases",
          count(*) FILTER (WHERE processing_status = 'dead_letter')::int
            AS "deadLetters",
          count(*) FILTER (WHERE attempt_count > 1)::int AS "retries",
          extract(epoch FROM (
            now() - min(received_at) FILTER (
              WHERE processing_status IN ('pending', 'failed')
                AND (next_attempt_at IS NULL OR next_attempt_at <= now())
            )
          ))::int AS "oldestReadyAgeSeconds"
        FROM stripe_events
        WHERE provider_payload_verified
      `,
      client<QueueStatusRow[]>`
        SELECT
          count(*) FILTER (
            WHERE status IN ('pending', 'failed')
              AND (next_attempt_at IS NULL OR next_attempt_at <= now())
          )::int AS "ready",
          count(*) FILTER (WHERE status = 'sending')::int AS "working",
          count(*) FILTER (
            WHERE status = 'sending'
              AND lease_expires_at <= now()
          )::int AS "staleLeases",
          count(*) FILTER (WHERE status = 'dead_letter')::int AS "deadLetters",
          count(*) FILTER (WHERE attempt_count > 1)::int AS "retries",
          extract(epoch FROM (
            now() - min(created_at) FILTER (
              WHERE status IN ('pending', 'failed')
                AND (next_attempt_at IS NULL OR next_attempt_at <= now())
            )
          ))::int AS "oldestReadyAgeSeconds"
        FROM purchase_side_effects
        WHERE payload @> '{"_outboxVersion":1}'::jsonb
      `,
      client<
        {
          linkFailed: number;
          manualPending: number;
          pending: number;
        }[]
      >`
        SELECT
          count(*) FILTER (WHERE status = 'pending')::int AS "pending",
          count(*) FILTER (WHERE status = 'link_failed')::int AS "linkFailed",
          count(*) FILTER (WHERE status = 'manual_pending')::int AS "manualPending"
        FROM access_entitlements
      `,
      client<
        {
          unlinkedProcessedEvents: number;
          unverifiedEvents: number;
          waitingSheetsExports: number;
        }[]
      >`
        SELECT
          (
            SELECT count(*)::int
            FROM stripe_events
            WHERE processing_status = 'processed'
              AND purchase_id IS NULL
          ) AS "unlinkedProcessedEvents",
          (
            SELECT count(*)::int
            FROM stripe_events
            WHERE NOT provider_payload_verified
          ) AS "unverifiedEvents",
          (
            SELECT count(*)::int
            FROM purchase_side_effects
            WHERE kind IN ('successful_customer_export', 'google_sheets_export')
              AND status NOT IN ('sent', 'skipped')
          ) AS "waitingSheetsExports"
      `,
      client<{ count: number; status: string }[]>`
        SELECT delivery_status AS "status", count(*)::int AS "count"
        FROM monthly_report_runs
        GROUP BY delivery_status
        ORDER BY delivery_status
      `,
    ]);

  return {
    access: accessRows[0] ?? {
      linkFailed: 0,
      manualPending: 0,
      pending: 0,
    },
    capturedAt: new Date().toISOString(),
    inbox: toQueueStatus(inboxRows[0]),
    outbox: toQueueStatus(outboxRows[0]),
    projection: projectionRows[0] ?? {
      unlinkedProcessedEvents: 0,
      unverifiedEvents: 0,
      waitingSheetsExports: 0,
    },
    reports: Object.fromEntries(reportRows.map((row) => [row.status, row.count])),
  };
};

const main = async () => {
  const status = await readOperationalDatabaseStatus();

  console.warn(
    JSON.stringify(
      {
        database: getDatabaseEnvSelection("pooled"),
        status,
      },
      null,
      2,
    ),
  );
};

if (process.argv[1]?.endsWith("operational-status.ts")) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await getDatabaseClient().end();
    });
}
