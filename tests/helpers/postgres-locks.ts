import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import type postgres from "postgres";

export const waitForPostgresBlock = async (
  client: postgres.Sql,
  waitingPid: number,
  blockingPid: number,
): Promise<void> => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [row] = await client<{ blocked: boolean }[]>`
      SELECT ${blockingPid} = ANY(pg_blocking_pids(${waitingPid})) AS blocked
    `;
    if (row?.blocked) return;
    await delay(10);
  }
  assert.fail(`PostgreSQL session ${waitingPid} never waited on ${blockingPid}.`);
};
