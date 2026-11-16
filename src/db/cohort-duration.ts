import { desc } from "drizzle-orm";

import { logSafeError } from "@/lib/safe-error-log";

import { getDatabase } from "./client";
import { onlineGroupCohorts } from "./schema";

/** What the page says when no cohort is recorded yet (the cohorts before HUB-D50). */
export const DEFAULT_COHORT_DURATION_WEEKS = 6;

/**
 * HUB-D50: the length of the newest cohort, the one the group page sells. The page
 * still renders with the default when the database is out of reach.
 */
export async function readNewestCohortDurationWeeks(): Promise<number> {
  try {
    const [cohort] = await getDatabase()
      .select({ durationWeeks: onlineGroupCohorts.durationWeeks })
      .from(onlineGroupCohorts)
      .orderBy(desc(onlineGroupCohorts.startsAt))
      .limit(1);

    return cohort?.durationWeeks ?? DEFAULT_COHORT_DURATION_WEEKS;
  } catch (error) {
    logSafeError("Failed to read the cohort length", error);
    return DEFAULT_COHORT_DURATION_WEEKS;
  }
}
