import { and, eq, inArray, isNull } from "drizzle-orm";

import type { getDatabase } from "./client";
import {
  closeOnlineGroupCohortInTransaction,
  type CohortClosure,
  resolveCohortContinuations,
} from "./cohort-closure";
import { lockHubPeriodOwner } from "./hub-period-chain-resolution";
import { buildPurchaseTelegramIdentityEvidence } from "./purchase-telegram-identity-evidence";
import {
  type PurchaseTelegramIdentitySummary,
  summarizePurchaseTelegramIdentity,
} from "./purchase-telegram-identity-summary";
import {
  accessEntitlements,
  inspirationHubSettings,
  onlineGroupCohorts,
  purchases,
  telegramAccessTokens,
  telegramChats,
  telegramUserBindings,
} from "./schema";
import type { DatabaseTransaction } from "./transaction";

type CohortInput = { title: string; mainChatId: string; startsAt: string };

/** Values the owner reads off the production report (handoff, step А12). */
export type HubLaunchTransferInput = {
  cohort2: CohortInput;
  cohort3: CohortInput;
  hubChatId: string;
  closeCohort2: { closedAt: string; lessonsCleared: boolean };
};

type CohortLabel = "cohort2" | "cohort3";

export type HubLaunchTransferReport = {
  written: boolean;
  cohorts: Record<CohortLabel, { id: string; created: boolean }>;
  hubSettings: "created" | "unchanged";
  purchases: {
    linked: number;
    alreadyLinked: number;
    ownersWritten: number;
    withoutOwner: { cohort: CohortLabel; paymentIntentId: string }[];
    ownerConflicts: {
      cohort: CohortLabel;
      paymentIntentId: string;
      candidates: string[];
    }[];
    /** Already tied to another cohort or classified otherwise: left untouched. */
    skipped: { cohort: CohortLabel; paymentIntentId: string; reason: string }[];
  };
  closure: {
    alreadyClosed: boolean;
    closedAt: string;
    /** Check by eye (К14): access ends at the next Warsaw midnight after closure. */
    accessEndsAt: string;
    nextCohortSalesOpened: boolean;
    continuationRoots: number;
  };
};

type Database = ReturnType<typeof getDatabase>;

const ROLLBACK = new Error("hub_launch_transfer_dry_run");

const parseDate = (value: string, field: string) => {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) {
    throw new Error(`hub_launch_transfer_invalid_date:${field}`);
  }
  return date;
};

/** Validates the input before anything touches the database. */
export function validateHubLaunchTransferInput(input: HubLaunchTransferInput) {
  for (const label of ["cohort2", "cohort3"] as const) {
    const cohort = input[label];
    if (!cohort?.title?.trim() || !cohort.mainChatId?.trim()) {
      throw new Error(`hub_launch_transfer_cohort_incomplete:${label}`);
    }
    parseDate(cohort.startsAt, `${label}.startsAt`);
  }
  if (input.cohort2.mainChatId.trim() === input.cohort3.mainChatId.trim()) {
    throw new Error("hub_launch_transfer_same_main_chat");
  }
  if (!input.hubChatId?.trim()) throw new Error("hub_launch_transfer_hub_chat_missing");
  if (input.closeCohort2?.lessonsCleared !== true) {
    // HUB-D19: the owner confirms the lessons were removed from chat #2 by hand.
    throw new Error("hub_launch_transfer_lessons_not_confirmed");
  }
  parseDate(input.closeCohort2.closedAt, "closeCohort2.closedAt");
}

async function requireChats(tx: DatabaseTransaction, chatIds: string[]) {
  const rows = await tx
    .select({ chatId: telegramChats.chatId })
    .from(telegramChats)
    .where(inArray(telegramChats.chatId, chatIds));
  const known = new Set(rows.map((row) => row.chatId));
  const missing = chatIds.filter((chatId) => !known.has(chatId));

  // The bot registers chats with /register_chat; the script never invents them.
  if (missing.length > 0) {
    throw new Error(`hub_launch_transfer_chats_not_registered:${missing.join(",")}`);
  }
}

/** Creates the cohort, or checks that the existing one says the same. */
async function ensureCohort(
  tx: DatabaseTransaction,
  label: CohortLabel,
  input: CohortInput,
  previousCohortId: string | null,
): Promise<{ id: string; created: boolean }> {
  const values = {
    title: input.title.trim(),
    mainChatId: input.mainChatId.trim(),
    startsAt: parseDate(input.startsAt, `${label}.startsAt`),
    previousCohortId,
  };
  const [existing] = await tx
    .select()
    .from(onlineGroupCohorts)
    .where(eq(onlineGroupCohorts.mainChatId, values.mainChatId));

  if (!existing) {
    const [created] = await tx
      .insert(onlineGroupCohorts)
      .values(values)
      .returning({ id: onlineGroupCohorts.id });
    if (!created) throw new Error(`hub_launch_transfer_cohort_not_created:${label}`);
    return { id: created.id, created: true };
  }

  if (
    existing.title !== values.title ||
    existing.startsAt.getTime() !== values.startsAt.getTime() ||
    existing.previousCohortId !== previousCohortId
  ) {
    throw new Error(`hub_launch_transfer_cohort_differs:${label}`);
  }
  return { id: existing.id, created: false };
}

async function ensureHubSettings(tx: DatabaseTransaction, hubChatId: string) {
  const [existing] = await tx.select().from(inspirationHubSettings);

  if (!existing) {
    await tx.insert(inspirationHubSettings).values({ telegramChatId: hubChatId });
    return "created" as const;
  }
  if (existing.telegramChatId !== hubChatId) {
    throw new Error("hub_launch_transfer_hub_chat_differs");
  }
  return "unchanged" as const;
}

/** Recorded Telegram IDs of these purchases, summarized as in the reconciliation audit. */
async function summarizeOwners(
  tx: DatabaseTransaction,
  purchaseIds: string[],
): Promise<Map<string, PurchaseTelegramIdentitySummary>> {
  if (purchaseIds.length === 0) return new Map();

  const [purchaseRows, entitlementRows, bindingRows, tokenRows] = await Promise.all([
    tx
      .select({ id: purchases.id, telegramUserId: purchases.telegramUserId })
      .from(purchases)
      .where(inArray(purchases.id, purchaseIds)),
    tx
      .select({
        id: accessEntitlements.id,
        purchaseId: accessEntitlements.purchaseId,
        telegramUserId: accessEntitlements.telegramUserId,
      })
      .from(accessEntitlements)
      .where(inArray(accessEntitlements.purchaseId, purchaseIds)),
    tx
      .select({
        id: telegramUserBindings.id,
        purchaseId: telegramUserBindings.purchaseId,
        telegramUserId: telegramUserBindings.telegramUserId,
      })
      .from(telegramUserBindings)
      .where(inArray(telegramUserBindings.purchaseId, purchaseIds)),
    tx
      .select({
        id: telegramAccessTokens.id,
        purchaseId: telegramAccessTokens.purchaseId,
        status: telegramAccessTokens.status,
        usedAt: telegramAccessTokens.usedAt,
        telegramUserId: telegramAccessTokens.telegramUserId,
      })
      .from(telegramAccessTokens)
      .where(inArray(telegramAccessTokens.purchaseId, purchaseIds)),
  ]);
  const { evidence } = buildPurchaseTelegramIdentityEvidence({
    purchases: purchaseRows,
    entitlements: entitlementRows,
    bindings: bindingRows,
    tokens: tokenRows,
  });

  return new Map(
    purchaseIds.map((id) => [id, summarizePurchaseTelegramIdentity(id, evidence)]),
  );
}

/**
 * Online purchases whose `primary` right points at the cohort's main chat join the
 * period model: the purchase names the cohort and the `primary` right becomes
 * `online_group`. The Plus Hub right stays in the old model. An owner is written only
 * when every recorded ID of the purchase agrees.
 */
async function linkCohortPurchases(
  tx: DatabaseTransaction,
  label: CohortLabel,
  cohort: { id: string; mainChatId: string },
  report: HubLaunchTransferReport["purchases"],
) {
  const rows = await tx
    .select({
      purchaseId: purchases.id,
      paymentIntentId: purchases.paymentIntentId,
      purchaseCohortId: purchases.onlineGroupCohortId,
      purchaseOwner: purchases.telegramUserId,
      primaryId: accessEntitlements.id,
      primarySourceKind: accessEntitlements.sourceKind,
    })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(purchases.id, accessEntitlements.purchaseId))
    .where(
      and(
        eq(accessEntitlements.accessKey, "primary"),
        eq(accessEntitlements.telegramChatId, cohort.mainChatId),
        eq(purchases.outcome, "succeeded"),
      ),
    )
    .orderBy(purchases.paymentIntentId);
  const owners = await summarizeOwners(
    tx,
    rows.map((row) => row.purchaseId),
  );

  for (const row of rows) {
    if (row.purchaseCohortId !== null && row.purchaseCohortId !== cohort.id) {
      report.skipped.push({
        cohort: label,
        paymentIntentId: row.paymentIntentId,
        reason: "tied_to_another_cohort",
      });
      continue;
    }
    if (row.primarySourceKind !== null && row.primarySourceKind !== "online_group") {
      report.skipped.push({
        cohort: label,
        paymentIntentId: row.paymentIntentId,
        reason: `primary_is_${row.primarySourceKind}`,
      });
      continue;
    }

    if (row.purchaseCohortId === null || row.primarySourceKind === null) {
      await tx
        .update(purchases)
        .set({ onlineGroupCohortId: cohort.id })
        .where(
          and(eq(purchases.id, row.purchaseId), isNull(purchases.onlineGroupCohortId)),
        );
      await tx
        .update(accessEntitlements)
        .set({ sourceKind: "online_group" })
        .where(
          and(
            eq(accessEntitlements.id, row.primaryId),
            isNull(accessEntitlements.sourceKind),
          ),
        );
      report.linked += 1;
    } else {
      report.alreadyLinked += 1;
    }

    const owner = owners.get(row.purchaseId);
    if (owner?.status === "conflict") {
      report.ownerConflicts.push({
        cohort: label,
        paymentIntentId: row.paymentIntentId,
        candidates: owner.candidateUserIds,
      });
    } else if (owner?.status !== "consistent" || !owner.telegramUserId) {
      report.withoutOwner.push({ cohort: label, paymentIntentId: row.paymentIntentId });
    } else if (row.purchaseOwner === null) {
      await lockHubPeriodOwner(tx, owner.telegramUserId);
      await tx
        .update(purchases)
        .set({ telegramUserId: owner.telegramUserId })
        .where(and(eq(purchases.id, row.purchaseId), isNull(purchases.telegramUserId)));
      report.ownersWritten += 1;
    }
  }
}

async function transferInTransaction(
  tx: DatabaseTransaction,
  input: HubLaunchTransferInput,
): Promise<{ report: HubLaunchTransferReport; closure: CohortClosure }> {
  const hubChatId = input.hubChatId.trim();
  await requireChats(tx, [
    input.cohort2.mainChatId.trim(),
    input.cohort3.mainChatId.trim(),
    hubChatId,
  ]);

  const cohort2 = await ensureCohort(tx, "cohort2", input.cohort2, null);
  const cohort3 = await ensureCohort(tx, "cohort3", input.cohort3, cohort2.id);
  const hubSettings = await ensureHubSettings(tx, hubChatId);
  const purchaseReport: HubLaunchTransferReport["purchases"] = {
    linked: 0,
    alreadyLinked: 0,
    ownersWritten: 0,
    withoutOwner: [],
    ownerConflicts: [],
    skipped: [],
  };

  // Purchases are linked before closure: closure stamps the end on period-model rights.
  await linkCohortPurchases(
    tx,
    "cohort2",
    { id: cohort2.id, mainChatId: input.cohort2.mainChatId.trim() },
    purchaseReport,
  );
  await linkCohortPurchases(
    tx,
    "cohort3",
    { id: cohort3.id, mainChatId: input.cohort3.mainChatId.trim() },
    purchaseReport,
  );

  const closure = await closeOnlineGroupCohortInTransaction(tx, {
    cohortId: cohort2.id,
    confirmationTitle: input.cohort2.title,
    lessonsCleared: input.closeCohort2.lessonsCleared,
    openNextCohortSales: true,
    closedAt: parseDate(input.closeCohort2.closedAt, "closeCohort2.closedAt"),
  });

  return {
    closure,
    report: {
      written: false,
      cohorts: { cohort2, cohort3 },
      hubSettings,
      purchases: purchaseReport,
      closure: {
        alreadyClosed: closure.alreadyClosed,
        closedAt: closure.cohort.closedAt?.toISOString() ?? "",
        accessEndsAt: closure.cohort.accessEndsAt?.toISOString() ?? "",
        nextCohortSalesOpened: closure.nextCohortSalesOpened,
        continuationRoots: closure.continuationRoots.length,
      },
    },
  };
}

/**
 * Step А12: prepares production for the Hub launch in one transaction. Without
 * `write` the transaction is rolled back, so the report shows exactly what a real run
 * would do and nothing is kept. A repeated run creates nothing twice.
 */
export async function runHubLaunchTransfer(
  db: Database,
  { input, write }: { input: HubLaunchTransferInput; write: boolean },
): Promise<HubLaunchTransferReport> {
  validateHubLaunchTransferInput(input);
  let result: Awaited<ReturnType<typeof transferInTransaction>> | null = null;

  try {
    await db.transaction(
      async (tx) => {
        result = await transferInTransaction(tx, input);
        if (!write) throw ROLLBACK;
      },
      { isolationLevel: "read committed" },
    );
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }

  const outcome = result as Awaited<ReturnType<typeof transferInTransaction>> | null;
  if (!outcome) throw new Error("hub_launch_transfer_no_result");
  if (write && outcome.closure.continuationRoots.length > 0) {
    await resolveCohortContinuations(
      outcome.closure.continuationRoots,
      outcome.closure.cohort.closedAt ?? new Date(),
    );
  }

  return { ...outcome.report, written: write };
}
