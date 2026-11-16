import { and, eq, inArray, isNull } from "drizzle-orm";

import { accessEntitlements, onlineGroupCohorts, purchases } from "./schema";
import type { DatabaseTransaction } from "./transaction";

export type PlusHubClassificationReport = {
  written: boolean;
  cohort: { id: string; title: string; startsAt: string };
  classified: number;
  alreadyClassified: number;
  /** Legacy deadlines cleared: the closure of this cohort records the real end. */
  clearedDeadlines: { paymentIntentId: string; expiresAt: string }[];
};

const ROLLBACK = new Error("plus_hub_classification_dry_run");

/**
 * Group В, step 27: moves the Hub rights of a cohort's Plus purchases into the period
 * model. From then on the Hub of these Plus purchases opens at the cohort start
 * (HUB-D33), ends where the closure of the cohort records it, and keeps its member
 * for the 7-day grace (HUB-D24). Runs before the cohort is closed; without `write`
 * the transaction is rolled back and the report shows what a real run would do.
 */
export async function classifyCohortPlusHubRights(
  db: Pick<DatabaseTransaction, "transaction">,
  { mainChatId, write }: { mainChatId: string; write: boolean },
): Promise<PlusHubClassificationReport> {
  let report: PlusHubClassificationReport | null = null;

  try {
    await db.transaction(async (tx) => {
      report = await classifyInTransaction(tx, mainChatId.trim());
      if (!write) throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }

  const outcome = report as PlusHubClassificationReport | null;
  if (!outcome) throw new Error("plus_hub_classification_no_result");
  return { ...outcome, written: write };
}

async function classifyInTransaction(
  tx: DatabaseTransaction,
  mainChatId: string,
): Promise<PlusHubClassificationReport> {
  const [cohort] = await tx
    .select()
    .from(onlineGroupCohorts)
    .where(eq(onlineGroupCohorts.mainChatId, mainChatId))
    .for("update");

  if (!cohort) throw new Error("plus_hub_classification_cohort_not_found");
  // A closed cohort has already recorded its ends; rights classified after it would
  // stay open-ended.
  if (cohort.closedAt) throw new Error("plus_hub_classification_cohort_closed");

  const rights = await tx
    .select({
      id: accessEntitlements.id,
      sourceKind: accessEntitlements.sourceKind,
      expiresAt: accessEntitlements.expiresAt,
      paymentIntentId: purchases.paymentIntentId,
    })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
    .where(
      and(
        eq(accessEntitlements.accessKey, "inspiration-hub"),
        eq(purchases.onlineGroupCohortId, cohort.id),
        eq(purchases.outcome, "succeeded"),
      ),
    )
    .orderBy(purchases.paymentIntentId);

  const legacy = rights.filter((right) => right.sourceKind === null);
  const report: PlusHubClassificationReport = {
    written: false,
    cohort: {
      id: cohort.id,
      title: cohort.title,
      startsAt: cohort.startsAt.toISOString(),
    },
    classified: legacy.length,
    alreadyClassified: rights.filter((right) => right.sourceKind === "online_group")
      .length,
    clearedDeadlines: legacy.flatMap((right) =>
      right.expiresAt
        ? [
            {
              paymentIntentId: right.paymentIntentId,
              expiresAt: right.expiresAt.toISOString(),
            },
          ]
        : [],
    ),
  };

  if (
    rights.some(
      (right) => right.sourceKind !== null && right.sourceKind !== "online_group",
    )
  ) {
    throw new Error("plus_hub_classification_unexpected_source");
  }

  if (legacy.length > 0) {
    await tx
      .update(accessEntitlements)
      .set({
        sourceKind: "online_group",
        startsAt: null,
        expiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(
            accessEntitlements.id,
            legacy.map((right) => right.id),
          ),
          isNull(accessEntitlements.sourceKind),
        ),
      );
  }

  return report;
}
