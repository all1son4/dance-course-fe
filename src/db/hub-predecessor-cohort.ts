import { and, eq, isNull, ne } from "drizzle-orm";

import type { HubPredecessorCohort } from "./hub-period-predecessor";
import { accessEntitlements, onlineGroupCohorts } from "./schema";
import type { DatabaseTransaction } from "./transaction";

type CohortRow = Pick<
  typeof onlineGroupCohorts.$inferSelect,
  "id" | "mainChatId" | "accessEndsAt"
>;

/**
 * Adds what HUB-D26 needs to an Online predecessor's cohort: the next cohort's start
 * and whether the predecessor purchase still holds an unrevoked legacy Plus Hub right.
 * Every place that builds an Online predecessor must use it, because each new period
 * revalidates the whole chain with the same end.
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
        isNull(accessEntitlements.revokedAt),
        ne(accessEntitlements.status, "revoked"),
      ),
    );

  return {
    id: cohort.id,
    mainChatId: cohort.mainChatId,
    accessEndsAt: cohort.accessEndsAt,
    nextCohortStartsAt: next?.startsAt ?? null,
    holdsLegacyPlusHub: legacyPlusHub !== undefined,
  };
}
