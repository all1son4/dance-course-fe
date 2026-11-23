import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { sql } from "drizzle-orm";
import type postgres from "postgres";

import type { DatabaseTransaction } from "@/db/transaction";

const SHARED_TABLE_DDL_LOCK = "test:shared-table-ddl";

const pollUntil = async (check: () => Promise<boolean>, failure: string) => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(10);
  }
  assert.fail(failure);
};

/**
 * Waits until `waitingPid` is stuck behind `blockingPid`, directly or through a
 * chain. Files run in parallel, and another file's `CREATE TRIGGER` on the same
 * table queues for a lock the blocking session holds; the waiter then queues behind
 * that request, so its direct blocker is the other file's session.
 */
export const waitForPostgresBlock = (
  client: postgres.Sql,
  waitingPid: number,
  blockingPid: number,
): Promise<void> =>
  pollUntil(async () => {
    const [row] = await client<{ blocked: boolean }[]>`
      WITH RECURSIVE blockers (pid) AS (
        SELECT unnest(pg_blocking_pids(${waitingPid}))
        UNION
        SELECT next.pid
        FROM blockers, unnest(pg_blocking_pids(blockers.pid)) AS next (pid)
      )
      SELECT ${blockingPid} IN (SELECT pid FROM blockers) AS blocked
    `;
    return row?.blocked === true;
  }, `PostgreSQL session ${waitingPid} never waited on ${blockingPid}.`);

/**
 * Waits until `waitingPid` waits for a row that `holderPid`'s transaction has
 * locked. Unlike `waitForPostgresBlock`, a session still queued for a table lock
 * does not count: it has not reached that row yet.
 */
export const waitForPostgresRowLock = (
  client: postgres.Sql,
  waitingPid: number,
  holderPid: number,
): Promise<void> =>
  pollUntil(async () => {
    const [row] = await client<{ waiting: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_locks AS waiting
        JOIN pg_locks AS held
          ON held.locktype = 'transactionid'
         AND held.transactionid = waiting.transactionid
        WHERE waiting.pid = ${waitingPid}
          AND waiting.locktype = 'transactionid'
          AND NOT waiting.granted
          AND held.pid = ${holderPid}
          AND held.granted
      ) AS waiting
    `;
    return row?.waiting === true;
  }, `PostgreSQL session ${waitingPid} never waited for a row locked by ${holderPid}.`);

/**
 * A statement that needs ACCESS EXCLUSIVE on a shared table, such as DROP TRIGGER,
 * queues behind every open transaction on that table, and every later statement
 * on the table queues behind it. A test whose session holds row locks while a
 * second session is meant to wait for them calls this first in that session's
 * transaction, before any lock, so the second session never lines up behind such
 * a statement. Later sessions of the same test must not call it: a DDL
 * transaction already waiting here would queue them behind the first one.
 */
export const pauseSharedTableDdl = async (tx: DatabaseTransaction): Promise<void> => {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${SHARED_TABLE_DDL_LOCK}, 0))`,
  );
};

/** Taken first by a transaction that runs such a statement on a shared table. */
export const lockSharedTableDdl = async (tx: postgres.TransactionSql): Promise<void> => {
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${SHARED_TABLE_DDL_LOCK}, 0))`;
};
