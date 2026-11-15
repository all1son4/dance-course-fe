import { and, eq, isNull } from "drizzle-orm";

import type { HubPredecessorCohort } from "./hub-period-predecessor";
import { accessEntitlements, onlineGroupCohorts } from "./schema";
import type { DatabaseTransaction } from "./transaction";

type CohortRow = Pick<
  typeof onlineGroupCohorts.$inferSelect,
  "id" | "mainChatId" | "accessEndsAt"
>;

/**
 * Adds what HUB-D26 needs to an Online predecessor's cohort: the next cohort's start
 * and whether the predecessor purchase came with a legacy Plus Hub right. That is a
 * fact of the purchase, not of the right's current state: the cron later revokes the
 * right ("expired", "left_channel"), and every new period revalidates the whole chain
 * with the same end — a state-based answer would break an early renewal months later.
 * Every place that builds an Online predecessor must use it.
 */
export async function loadHubPredecessorCohort(
  tx: DatabaseTransaction,
  { cohort, purchaseId }: { cohort: CohortRow; purchaseId: string },
): Promise<HubPredecessorCohort> {
  const [next] = await tx
    .select({ startsAt: onlineGroupCohorts.startsAt })
    .from(onlineGroupCohorts)
    .where(eq(onlineGroupCohorts.previousCohortId, cohort.id));
  const [legacyPlusHub] = await tx
    .select({ id: accessEntitlements.id })
    .from(accessEntitlements)
    .where(
      and(
        eq(accessEntitlements.purchaseId, purchaseId),
        eq(accessEntitlements.accessKey, "inspiration-hub"),
        isNull(accessEntitlements.sourceKind),
      ),
    )
    .limit(1);

  return {
    id: cohort.id,
    mainChatId: cohort.mainChatId,
    accessEndsAt: cohort.accessEndsAt,
    nextCohortStartsAt: next?.startsAt ?? null,
    holdsLegacyPlusHub: legacyPlusHub !== undefined,
  };
}
