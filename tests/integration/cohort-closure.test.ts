import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import {
  type CloseOnlineGroupCohortCommand,
  closeOnlineGroupCohortInDatabase,
  closeOnlineGroupCohortInTransaction,
} from "@/db/cohort-closure";
import { ensureHubPurchasePeriodInDatabase } from "@/db/hub-purchase-period-service";
import * as schema from "@/db/schema";
import {
  accessEntitlements,
  onlineGroupCohorts,
  purchases,
  telegramChats,
} from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";
import { getStandaloneHubPeriodEnd } from "@/lib/inspiration-hub/period-end";

import { createTestTelegramUserId } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const applicationClient = getDatabaseClient();
const client = postgres(databaseUrl, { max: 4, prepare: false });
const db = drizzle(client, { schema });

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const STARTS_AT = new Date("2026-10-05T16:00:00.000Z");
const PAID_AT = new Date("2026-12-10T08:30:00.000Z");
// 14 December 14:00 in Warsaw; access ends at 00:00 on 15 December (23:00 UTC).
const CLOSED_AT = new Date("2026-12-14T13:00:00.000Z");
const ACCESS_ENDS_AT = new Date("2026-12-14T23:00:00.000Z");
const PREVIOUS_END = new Date("2026-09-30T22:00:00.000Z");
const ROLLBACK = new Error("rollback_cohort_closure_fixture");
const TITLE = "Autumn 2026";

type Cohort = { cohortId: string; chatId: string };

async function insertCohort(
  tx: DatabaseTransaction,
  values: { previousCohortId?: string | null; title?: string } = {},
): Promise<Cohort> {
  const chatId = `cohort_closure_${randomUUID()}`;
  await tx.insert(telegramChats).values({ chatId, title: chatId, type: "supergroup" });
  const [cohort] = await tx
    .insert(onlineGroupCohorts)
    .values({
      title: values.title ?? TITLE,
      mainChatId: chatId,
      startsAt: STARTS_AT,
      salesEnabled: true,
      previousCohortId: values.previousCohortId ?? null,
    })
    .returning({ id: onlineGroupCohorts.id });
  assert.ok(cohort);
  return { cohortId: cohort.id, chatId };
}

async function insertOnlinePurchase(
  tx: DatabaseTransaction,
  cohortId: string,
  telegramUserId: string | null,
  rights: { accessKey: string; sourceKind: "online_group" | null }[],
) {
  const [purchase] = await tx
    .insert(purchases)
    .values({
      paymentIntentId: `pi_cohort_closure_${randomUUID()}`,
      amountMinor: 5000,
      currency: "eur",
      stripeStatus: "succeeded",
      outcome: "succeeded",
      succeededAt: STARTS_AT,
      telegramUserId,
      onlineGroupCohortId: cohortId,
    })
    .returning({ id: purchases.id });
  assert.ok(purchase);
  const inserted = await tx
    .insert(accessEntitlements)
    .values(
      rights.map((right) => ({
        ...right,
        purchaseId: purchase.id,
        status: "activated" as const,
      })),
    )
    .returning();
  return { purchaseId: purchase.id, rights: inserted };
}

function command(
  cohortId: string,
  overrides: Partial<CloseOnlineGroupCohortCommand> = {},
): CloseOnlineGroupCohortCommand {
  return {
    cohortId,
    confirmationTitle: TITLE,
    lessonsCleared: true,
    openNextCohortSales: false,
    closedAt: CLOSED_AT,
    ...overrides,
  };
}

async function withTransaction(run: (tx: DatabaseTransaction) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await run(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

async function readExpiry(tx: DatabaseTransaction, ids: string[]) {
  const rows = await tx
    .select({ id: accessEntitlements.id, expiresAt: accessEntitlements.expiresAt })
    .from(accessEntitlements)
    .where(inArray(accessEntitlements.id, ids));
  return new Map(rows.map((row) => [row.id, row.expiresAt]));
}

test("closing fixes the next Warsaw midnight and stamps only period-model rights", async () => {
  await withTransaction(async (tx) => {
    const { cohortId } = await insertCohort(tx);
    const classified = await insertOnlinePurchase(
      tx,
      cohortId,
      createTestTelegramUserId(),
      [
        { accessKey: "primary", sourceKind: "online_group" },
        { accessKey: "inspiration-hub", sourceKind: "online_group" },
      ],
    );
    const legacy = await insertOnlinePurchase(tx, cohortId, null, [
      { accessKey: "primary", sourceKind: null },
      { accessKey: "inspiration-hub", sourceKind: null },
    ]);

    const closure = await closeOnlineGroupCohortInTransaction(tx, command(cohortId));

    assert.equal(closure.alreadyClosed, false);
    assert.deepEqual(
      {
        closedAt: closure.cohort.closedAt,
        accessEndsAt: closure.cohort.accessEndsAt,
        lessonsClearedAt: closure.cohort.lessonsClearedAt,
        salesEnabled: closure.cohort.salesEnabled,
      },
      {
        closedAt: CLOSED_AT,
        accessEndsAt: ACCESS_ENDS_AT,
        lessonsClearedAt: CLOSED_AT,
        salesEnabled: false,
      },
    );
    const expiry = await readExpiry(
      tx,
      [...classified.rights, ...legacy.rights].map((right) => right.id),
    );
    for (const right of classified.rights) {
      assert.deepEqual(expiry.get(right.id), ACCESS_ENDS_AT);
    }
    for (const right of legacy.rights) {
      assert.equal(expiry.get(right.id), null);
    }
  });
});

for (const invalid of [
  {
    name: "a wrong confirmation title",
    overrides: { confirmationTitle: "Winter 2027" },
    message: "cohort_closure_title_mismatch",
  },
  {
    name: "unconfirmed lesson cleanup",
    overrides: { lessonsCleared: false },
    message: "cohort_closure_lessons_not_cleared",
  },
  {
    name: "a closure before the start",
    overrides: { closedAt: new Date("2026-10-01T10:00:00.000Z") },
    message: "cohort_closure_before_start",
  },
]) {
  test(`closing is refused for ${invalid.name}`, async () => {
    await withTransaction(async (tx) => {
      const { cohortId } = await insertCohort(tx);

      await assert.rejects(
        closeOnlineGroupCohortInTransaction(tx, command(cohortId, invalid.overrides)),
        { message: invalid.message },
      );
      const [cohort] = await tx
        .select({ closedAt: onlineGroupCohorts.closedAt })
        .from(onlineGroupCohorts)
        .where(eq(onlineGroupCohorts.id, cohortId));
      assert.equal(cohort?.closedAt, null);
    });
  });
}

test("a closed cohort is never closed again (HUB-D20)", async () => {
  await withTransaction(async (tx) => {
    const { cohortId } = await insertCohort(tx);
    await closeOnlineGroupCohortInTransaction(tx, command(cohortId));

    const repeat = await closeOnlineGroupCohortInTransaction(
      tx,
      command(cohortId, { closedAt: new Date("2026-12-20T10:00:00.000Z") }),
    );

    assert.equal(repeat.alreadyClosed, true);
    assert.deepEqual(repeat.cohort.accessEndsAt, ACCESS_ENDS_AT);
  });
});

test("closing can open sales of the following cohort at once (HUB-D27)", async () => {
  await withTransaction(async (tx) => {
    const { cohortId } = await insertCohort(tx);
    const next = await insertCohort(tx, {
      previousCohortId: cohortId,
      title: "Winter 2027",
    });
    await tx
      .update(onlineGroupCohorts)
      .set({ salesEnabled: false })
      .where(eq(onlineGroupCohorts.id, next.cohortId));

    const closure = await closeOnlineGroupCohortInTransaction(
      tx,
      command(cohortId, { openNextCohortSales: true }),
    );

    assert.equal(closure.nextCohortSalesOpened, true);
    const [nextCohort] = await tx
      .select({ salesEnabled: onlineGroupCohorts.salesEnabled })
      .from(onlineGroupCohorts)
      .where(eq(onlineGroupCohorts.id, next.cohortId));
    assert.equal(nextCohort?.salesEnabled, true);
  });
});

test("opening the next cohort's sales without one refuses the whole closure", async () => {
  await withTransaction(async (tx) => {
    const { cohortId } = await insertCohort(tx);

    await assert.rejects(
      closeOnlineGroupCohortInTransaction(
        tx,
        command(cohortId, { openNextCohortSales: true }),
      ),
      { message: "cohort_closure_next_cohort_missing" },
    );
  });
});

test(
  "closing resolves paid continuations and reports a broken chain without blocking",
  { timeout: 20000 },
  async () => {
    const ownerId = createTestTelegramUserId();
    const purchaseIds: string[] = [];
    const cohortIds: string[] = [];
    const chatIds: string[] = [];

    try {
      const setup = await db.transaction(async (tx) => {
        const previous = await insertCohort(tx, { title: "Summer 2026" });
        await tx
          .update(onlineGroupCohorts)
          .set({
            startsAt: new Date("2026-06-01T10:00:00.000Z"),
            closedAt: new Date("2026-09-30T10:00:00.000Z"),
            lessonsClearedAt: new Date("2026-09-30T10:00:00.000Z"),
            accessEndsAt: PREVIOUS_END,
            salesEnabled: false,
          })
          .where(eq(onlineGroupCohorts.id, previous.cohortId));
        const cohort = await insertCohort(tx, { previousCohortId: previous.cohortId });
        cohortIds.push(cohort.cohortId, previous.cohortId);
        chatIds.push(cohort.chatId, previous.chatId);

        const owned = await insertOnlinePurchase(tx, cohort.cohortId, ownerId, [
          { accessKey: "primary", sourceKind: "online_group" },
        ]);
        // A reconciled purchase whose Telegram owner is still unknown.
        const ownerless = await insertOnlinePurchase(tx, cohort.cohortId, null, [
          { accessKey: "primary", sourceKind: "online_group" },
        ]);
        const [hubPurchase] = await tx
          .insert(purchases)
          .values({
            paymentIntentId: `pi_cohort_closure_hub_${randomUUID()}`,
            amountMinor: 3500,
            currency: "eur",
            stripeStatus: "succeeded",
            outcome: "succeeded",
            succeededAt: PAID_AT,
            telegramUserId: ownerId,
          })
          .returning({ id: purchases.id });
        assert.ok(hubPurchase);
        const [stalled] = await tx
          .insert(purchases)
          .values({
            paymentIntentId: `pi_cohort_closure_stalled_${randomUUID()}`,
            amountMinor: 3500,
            currency: "eur",
            stripeStatus: "succeeded",
            outcome: "succeeded",
            succeededAt: PAID_AT,
            telegramUserId: createTestTelegramUserId(),
          })
          .returning({ id: purchases.id });
        assert.ok(stalled);
        await tx.insert(accessEntitlements).values({
          purchaseId: stalled.id,
          accessKey: "inspiration-hub",
          sourceKind: "standalone_hub",
          periodStartMode: "after_entitlement",
          paidDurationDays: 56,
          startsAfterEntitlementId: ownerless.rights[0].id,
        });
        purchaseIds.push(
          owned.purchaseId,
          ownerless.purchaseId,
          hubPurchase.id,
          stalled.id,
        );
        return {
          cohortId: cohort.cohortId,
          hubPurchaseId: hubPurchase.id,
          ownedPrimaryId: owned.rights[0].id,
          ownerlessPrimaryId: ownerless.rights[0].id,
        };
      });

      const waiting = await ensureHubPurchasePeriodInDatabase({
        purchaseId: setup.hubPurchaseId,
        continuationCohortId: setup.cohortId,
        processedAt: PAID_AT,
      });
      assert.equal(waiting.startsAt, null);

      const closure = await closeOnlineGroupCohortInDatabase(command(setup.cohortId));

      assert.deepEqual(closure.continuations.resolvedEntitlementIds, [
        setup.ownedPrimaryId,
      ]);
      assert.deepEqual(closure.continuations.failures, [
        { entitlementId: setup.ownerlessPrimaryId, reason: "owner_missing" },
      ]);
      const [resolved] = await db
        .select({
          startsAt: accessEntitlements.startsAt,
          expiresAt: accessEntitlements.expiresAt,
        })
        .from(accessEntitlements)
        .where(eq(accessEntitlements.id, waiting.id));
      assert.deepEqual(resolved, {
        startsAt: ACCESS_ENDS_AT,
        expiresAt: getStandaloneHubPeriodEnd({ startsAt: ACCESS_ENDS_AT }),
      });
    } finally {
      await db.transaction(async (tx) => {
        await tx
          .update(accessEntitlements)
          .set({
            startsAfterEntitlementId: null,
            periodStartMode: null,
            paidDurationDays: null,
          })
          .where(inArray(accessEntitlements.purchaseId, purchaseIds));
        await tx
          .delete(accessEntitlements)
          .where(inArray(accessEntitlements.purchaseId, purchaseIds));
        await tx.delete(purchases).where(inArray(purchases.id, purchaseIds));
        if (cohortIds.length > 0) {
          await tx
            .delete(onlineGroupCohorts)
            .where(eq(onlineGroupCohorts.id, cohortIds[0]));
          await tx
            .delete(onlineGroupCohorts)
            .where(inArray(onlineGroupCohorts.id, cohortIds));
        }
        await tx.delete(telegramChats).where(inArray(telegramChats.chatId, chatIds));
      });
    }
  },
);
