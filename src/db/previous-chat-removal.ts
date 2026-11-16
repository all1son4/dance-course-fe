import { and, eq, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { onlineGroupCohorts } from "./schema";
import type { DatabaseExecutor } from "./transaction";

/*
 * HUB-D44, plan section 6.5: after a confirmed join into a new cohort's main chat
 * the buyer leaves the previous cohort's chat. The previous chat comes from the
 * cohort link of the purchase, never from whatever old chats the person is in.
 */

export type PreviousChatRemoval = { cohortId: string; previousChatId: string };

/** The chat to leave, only when the cohort has the switch on and a predecessor. */
export async function findPreviousChatRemoval(
  executor: DatabaseExecutor,
  { cohortId, joinedChatId }: { cohortId: string; joinedChatId: string },
): Promise<PreviousChatRemoval | null> {
  const previous = alias(onlineGroupCohorts, "previous_cohort");
  const [row] = await executor
    .select({ previousChatId: previous.mainChatId })
    .from(onlineGroupCohorts)
    .innerJoin(previous, eq(previous.id, onlineGroupCohorts.previousCohortId))
    .where(
      and(
        eq(onlineGroupCohorts.id, cohortId),
        eq(onlineGroupCohorts.mainChatId, joinedChatId),
        eq(onlineGroupCohorts.removesPreviousChatMembers, true),
        isNotNull(onlineGroupCohorts.previousCohortId),
      ),
    )
    .limit(1);

  return row && row.previousChatId !== joinedChatId
    ? { cohortId, previousChatId: row.previousChatId }
    : null;
}

/** Re-read before acting: the owner may have switched it off since the join. */
export async function isPreviousChatRemovalEnabled(
  executor: DatabaseExecutor,
  cohortId: string,
): Promise<boolean> {
  const [row] = await executor
    .select({ enabled: onlineGroupCohorts.removesPreviousChatMembers })
    .from(onlineGroupCohorts)
    .where(eq(onlineGroupCohorts.id, cohortId))
    .limit(1);

  return row?.enabled === true;
}
