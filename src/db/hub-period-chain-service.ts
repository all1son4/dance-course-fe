import type { HubPeriodChainPlan } from "@/lib/inspiration-hub/period-chain";

import { getDatabase } from "./client";
import {
  type ResolveHubPeriodChainCommand,
  resolveHubPeriodChainInTransaction,
} from "./hub-period-chain-resolution";
import { retryHubPeriodChainTransaction } from "./hub-period-chain-retry";

export async function resolveHubPeriodChainInDatabase(
  command: ResolveHubPeriodChainCommand,
): Promise<HubPeriodChainPlan> {
  const db = getDatabase();
  function runAttempt() {
    return db.transaction((tx) => resolveHubPeriodChainInTransaction(tx, command), {
      isolationLevel: "read committed",
    });
  }

  return retryHubPeriodChainTransaction(runAttempt);
}
