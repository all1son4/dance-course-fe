import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { onlineGroupCohorts } from "./schema";
import type { DatabaseExecutor } from "./transaction";

export type OnlineGroupCohortSaleRefusal =
  "cohort_not_found" | "cohort_closed" | "cohort_sales_disabled" | "previous_cohort_open";

export type OnlineGroupCohortSale =
  | { open: true; cohortId: string }
  | { open: false; reason: OnlineGroupCohortSaleRefusal };

/**
 * The cohort an Online Group payment is sold into: the one whose main chat is the
 * main chat of the active campaign. HUB-D13: a cohort is sold only after its
 * predecessor is closed, so continuation periods always know where they start.
 * A cohort without a predecessor has nothing to wait for.
 */
export async function getOnlineGroupCohortSale(
  executor: DatabaseExecutor,
  mainChatId: string,
): Promise<OnlineGroupCohortSale> {
  const previous = alias(onlineGroupCohorts, "previous_cohort");
  const [cohort] = await executor
    .select({
      id: onlineGroupCohorts.id,
      closedAt: onlineGroupCohorts.closedAt,
      salesEnabled: onlineGroupCohorts.salesEnabled,
      previousCohortId: onlineGroupCohorts.previousCohortId,
      previousClosedAt: previous.closedAt,
    })
    .from(onlineGroupCohorts)
    .leftJoin(previous, eq(previous.id, onlineGroupCohorts.previousCohortId))
    .where(eq(onlineGroupCohorts.mainChatId, mainChatId));

  if (!cohort) return { open: false, reason: "cohort_not_found" };
  if (cohort.closedAt) return { open: false, reason: "cohort_closed" };
  if (!cohort.salesEnabled) return { open: false, reason: "cohort_sales_disabled" };
  if (cohort.previousCohortId && !cohort.previousClosedAt) {
    return { open: false, reason: "previous_cohort_open" };
  }

  return { open: true, cohortId: cohort.id };
}
