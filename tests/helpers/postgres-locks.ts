import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import type postgres from "postgres";

/**
 * Waits until `waitingPid` is stuck behind `blockingPid`, directly or through a
 * chain. Files run in parallel, and another file's `CREATE TRIGGER` on the same
 * table queues for a lock the blocking session holds; the waiter then queues behind
 * that request, so its direct blocker is the other file's session.
 */
export const waitForPostgresBlock = async (
  client: postgres.Sql,
  waitingPid: number,
  blockingPid: number,
): Promise<void> => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [row] = await client<{ blocked: boolean }[]>`
      WITH RECURSIVE blockers (pid) AS (
        SELECT unnest(pg_blocking_pids(${waitingPid}))
        UNION
        SELECT next.pid
        FROM blockers, unnest(pg_blocking_pids(blockers.pid)) AS next (pid)
      )
      SELECT ${blockingPid} IN (SELECT pid FROM blockers) AS blocked
    `;
    if (row?.blocked) return;
    await delay(10);
  }
  assert.fail(`PostgreSQL session ${waitingPid} never waited on ${blockingPid}.`);
};
