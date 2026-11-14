import { sql } from "drizzle-orm";

import type { getDatabase } from "./client";
import {
  type OnlineGroupConfigurationSnapshot,
  readOnlineGroupConfigurationSnapshotInTransaction,
} from "./online-group-configuration-snapshot";
import {
  type OnlineGroupPurchaseSnapshot,
  readOnlineGroupPurchaseSnapshotInTransaction,
} from "./online-group-purchase-snapshot";
import type { DatabaseTransaction } from "./transaction";

export type OnlineGroupReconciliationSnapshot = {
  configuration: OnlineGroupConfigurationSnapshot;
  purchases: OnlineGroupPurchaseSnapshot;
};

/** Both readers must use the supplied transaction rather than opening their own. */
export async function readOnlineGroupReconciliationSnapshotInTransaction(
  tx: Pick<DatabaseTransaction, "select">,
): Promise<OnlineGroupReconciliationSnapshot> {
  const configuration = await readOnlineGroupConfigurationSnapshotInTransaction(tx);
  const purchases = await readOnlineGroupPurchaseSnapshotInTransaction(tx);

  return {
    configuration,
    purchases,
  };
}

/** Configuration and purchase facts are captured in one bounded read-only snapshot. */
export function readOnlineGroupReconciliationSnapshot(
  db: Pick<ReturnType<typeof getDatabase>, "transaction">,
): Promise<OnlineGroupReconciliationSnapshot> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '15s'`);
      await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
      return readOnlineGroupReconciliationSnapshotInTransaction(tx);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
