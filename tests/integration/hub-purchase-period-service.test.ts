import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import {
  ensureHubPurchasePeriodInDatabase,
  ensureHubPurchasePeriodInTransaction,
} from "@/db/hub-purchase-period-service";
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

const COHORT_START = new Date("2026-10-05T16:00:00.000Z");
const EARLIER_PAID_AT = new Date("2026-08-01T10:00:00.000Z");
const ACTIVE_PAID_AT = new Date("2026-11-20T09:00:00.000Z");
const NEW_PAID_AT = new Date("2026-12-10T08:30:15.123Z");
const PROCESSED_AT = new Date("2026-12-10T08:31:00.000Z");
const COHORT_END = new Date("2026-12-14T23:00:00.000Z");
const ROLLBACK = new Error("rollback_hub_purchase_period_fixture");

type Entitlement = typeof accessEntitlements.$inferSelect;
type Fixture = { tx: DatabaseTransaction; ownerId: string };

const end56 = (startsAt: Date) => getStandaloneHubPeriodEnd({ startsAt });

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await run({ tx, ownerId: createTestTelegramUserId() });
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

async function insertPurchase(
  tx: DatabaseTransaction,
  values: {
    telegramUserId: string | null;
    succeededAt?: Date | null;
    outcome?: "succeeded" | "failed";
    onlineGroupCohortId?: string | null;
  },
) {
  const [purchase] = await tx
    .insert(purchases)
    .values({
      paymentIntentId: `pi_hub_service_${randomUUID()}`,
      amountMinor: 3500,
      currency: "eur",
      stripeStatus: values.outcome ?? "succeeded",
      outcome: values.outcome ?? "succeeded",
      succeededAt: values.succeededAt === undefined ? NEW_PAID_AT : values.succeededAt,
      telegramUserId: values.telegramUserId,
      onlineGroupCohortId: values.onlineGroupCohortId ?? null,
    })
    .returning({ id: purchases.id });
  assert.ok(purchase);
  return purchase.id;
}

/** A resolved payment-mode period: starts at payment, ends 56 Warsaw days later. */
async function insertPaymentPeriod(fixture: Fixture, paidAt: Date) {
  const purchaseId = await insertPurchase(fixture.tx, {
    telegramUserId: fixture.ownerId,
    succeededAt: paidAt,
  });
  const [right] = await fixture.tx
    .insert(accessEntitlements)
    .values({
      purchaseId,
      accessKey: "inspiration-hub",
      sourceKind: "standalone_hub",
      periodStartMode: "payment",
      paidDurationDays: 56,
      startsAt: paidAt,
      expiresAt: end56(paidAt),
      status: "activated",
    })
    .returning();
  assert.ok(right);
  return right;
}

async function insertCohortPrimary(fixture: Fixture, accessEndsAt: Date | null) {
  const mainChatId = `hub_service_main_${randomUUID()}`;
  await fixture.tx
    .insert(telegramChats)
    .values({ chatId: mainChatId, title: "Hub service cohort", type: "supergroup" });
  const closedAt =
    accessEndsAt === null ? null : new Date(accessEndsAt.getTime() - 10 * 3600_000);
  const [cohort] = await fixture.tx
    .insert(onlineGroupCohorts)
    .values({
      title: "Hub service cohort",
      mainChatId,
      startsAt: COHORT_START,
      closedAt,
      accessEndsAt,
      lessonsClearedAt: closedAt,
    })
    .returning({ id: onlineGroupCohorts.id });
  assert.ok(cohort);
  const purchaseId = await insertPurchase(fixture.tx, {
    telegramUserId: fixture.ownerId,
    succeededAt: COHORT_START,
    onlineGroupCohortId: cohort.id,
  });
  const [primary] = await fixture.tx
    .insert(accessEntitlements)
    .values({
      purchaseId,
      accessKey: "primary",
      sourceKind: "online_group",
      status: "activated",
    })
    .returning();
  assert.ok(primary);
  return { cohortId: cohort.id, primary };
}

function ensure(
  fixture: Fixture,
  purchaseId: string,
  continuationCohortId: string | null = null,
): Promise<Entitlement> {
  return ensureHubPurchasePeriodInTransaction(fixture.tx, {
    purchaseId,
    continuationCohortId,
    processedAt: PROCESSED_AT,
  });
}

const periodOf = (right: Entitlement) => ({
  sourceKind: right.sourceKind,
  accessKey: right.accessKey,
  periodStartMode: right.periodStartMode,
  paidDurationDays: right.paidDurationDays,
  startsAfterEntitlementId: right.startsAfterEntitlementId,
  startsAt: right.startsAt,
  expiresAt: right.expiresAt,
});

const paymentPeriod = (paidAt: Date) => ({
  sourceKind: "standalone_hub",
  accessKey: "inspiration-hub",
  periodStartMode: "payment",
  paidDurationDays: 56,
  startsAfterEntitlementId: null,
  startsAt: paidAt,
  expiresAt: end56(paidAt),
});

const dependentPeriod = (predecessorId: string, startsAt: Date | null) => ({
  sourceKind: "standalone_hub",
  accessKey: "inspiration-hub",
  periodStartMode: "after_entitlement",
  paidDurationDays: 56,
  startsAfterEntitlementId: predecessorId,
  startsAt,
  expiresAt: startsAt === null ? null : end56(startsAt),
});

test("a purchase without a confirmed Telegram owner counts from payment", async () => {
  await withFixture(async (fixture) => {
    const purchaseId = await insertPurchase(fixture.tx, { telegramUserId: null });

    assert.deepEqual(
      periodOf(await ensure(fixture, purchaseId)),
      paymentPeriod(NEW_PAID_AT),
    );
  });
});

test("an owner without other Hub access gets a period from payment", async () => {
  await withFixture(async (fixture) => {
    const purchaseId = await insertPurchase(fixture.tx, {
      telegramUserId: fixture.ownerId,
    });

    assert.deepEqual(
      periodOf(await ensure(fixture, purchaseId)),
      paymentPeriod(NEW_PAID_AT),
    );
  });
});

test("an early renewal follows the active period and keeps its remaining days", async () => {
  await withFixture(async (fixture) => {
    const active = await insertPaymentPeriod(fixture, ACTIVE_PAID_AT);
    const purchaseId = await insertPurchase(fixture.tx, {
      telegramUserId: fixture.ownerId,
    });

    const right = await ensure(fixture, purchaseId);

    assert.deepEqual(periodOf(right), dependentPeriod(active.id, active.expiresAt));
    assert.equal(right.status, "pending");
    assert.equal(right.telegramUserId, fixture.ownerId);
  });
});

test("a return after an expired period starts a new chain from payment", async () => {
  await withFixture(async (fixture) => {
    await insertPaymentPeriod(fixture, EARLIER_PAID_AT);
    const purchaseId = await insertPurchase(fixture.tx, {
      telegramUserId: fixture.ownerId,
    });

    assert.deepEqual(
      periodOf(await ensure(fixture, purchaseId)),
      paymentPeriod(NEW_PAID_AT),
    );
  });
});

test("a continuation bought during an open cohort waits for its end", async () => {
  await withFixture(async (fixture) => {
    await insertPaymentPeriod(fixture, EARLIER_PAID_AT);
    const { cohortId, primary } = await insertCohortPrimary(fixture, null);
    const purchaseId = await insertPurchase(fixture.tx, {
      telegramUserId: fixture.ownerId,
    });

    const right = await ensure(fixture, purchaseId, cohortId);

    assert.deepEqual(periodOf(right), dependentPeriod(primary.id, null));
  });
});

test("a continuation after a closed cohort starts at the Standard/Plus end", async () => {
  await withFixture(async (fixture) => {
    const { cohortId, primary } = await insertCohortPrimary(fixture, COHORT_END);
    const purchaseId = await insertPurchase(fixture.tx, {
      telegramUserId: fixture.ownerId,
    });

    const right = await ensure(fixture, purchaseId, cohortId);

    assert.deepEqual(periodOf(right), dependentPeriod(primary.id, COHORT_END));
  });
});

test("an active standalone chain wins over the continuation cohort (HUB-D15)", async () => {
  await withFixture(async (fixture) => {
    const active = await insertPaymentPeriod(fixture, ACTIVE_PAID_AT);
    const { cohortId } = await insertCohortPrimary(fixture, COHORT_END);
    const purchaseId = await insertPurchase(fixture.tx, {
      telegramUserId: fixture.ownerId,
    });

    const right = await ensure(fixture, purchaseId, cohortId);

    assert.deepEqual(periodOf(right), dependentPeriod(active.id, active.expiresAt));
  });
});

test("a second continuation waits behind the first awaiting one", async () => {
  await withFixture(async (fixture) => {
    const { cohortId } = await insertCohortPrimary(fixture, null);
    const first = await ensure(
      fixture,
      await insertPurchase(fixture.tx, { telegramUserId: fixture.ownerId }),
      cohortId,
    );

    const second = await ensure(
      fixture,
      await insertPurchase(fixture.tx, { telegramUserId: fixture.ownerId }),
      cohortId,
    );

    assert.deepEqual(periodOf(second), dependentPeriod(first.id, null));
  });
});

test("a continuation cohort the owner never bought falls back to payment", async () => {
  await withFixture(async (fixture) => {
    const otherOwner: Fixture = { tx: fixture.tx, ownerId: createTestTelegramUserId() };
    const { cohortId } = await insertCohortPrimary(otherOwner, COHORT_END);
    const purchaseId = await insertPurchase(fixture.tx, {
      telegramUserId: fixture.ownerId,
    });

    assert.deepEqual(
      periodOf(await ensure(fixture, purchaseId, cohortId)),
      paymentPeriod(NEW_PAID_AT),
    );
  });
});

test("processing the same payment again returns the stored right", async () => {
  await withFixture(async (fixture) => {
    const active = await insertPaymentPeriod(fixture, ACTIVE_PAID_AT);
    const purchaseId = await insertPurchase(fixture.tx, {
      telegramUserId: fixture.ownerId,
    });

    const first = await ensure(fixture, purchaseId);
    const replay = await ensure(fixture, purchaseId);

    assert.deepEqual(replay, first);
    assert.equal(replay.startsAfterEntitlementId, active.id);
    const rights = await fixture.tx
      .select({ id: accessEntitlements.id })
      .from(accessEntitlements)
      .where(eq(accessEntitlements.purchaseId, purchaseId));
    assert.equal(rights.length, 1);
  });
});

test("a replay resolves a waiting continuation once its cohort has closed", async () => {
  await withFixture(async (fixture) => {
    const { cohortId, primary } = await insertCohortPrimary(fixture, null);
    const purchaseId = await insertPurchase(fixture.tx, {
      telegramUserId: fixture.ownerId,
    });
    await ensure(fixture, purchaseId, cohortId);
    await fixture.tx
      .update(onlineGroupCohorts)
      .set({
        closedAt: new Date(COHORT_END.getTime() - 10 * 3600_000),
        lessonsClearedAt: new Date(COHORT_END.getTime() - 10 * 3600_000),
        accessEndsAt: COHORT_END,
      })
      .where(eq(onlineGroupCohorts.id, cohortId));

    const resolved = await ensure(fixture, purchaseId, cohortId);

    assert.deepEqual(periodOf(resolved), dependentPeriod(primary.id, COHORT_END));
  });
});

test("an unsuccessful purchase gets no period", async () => {
  await withFixture(async (fixture) => {
    const purchaseId = await insertPurchase(fixture.tx, {
      telegramUserId: fixture.ownerId,
      outcome: "failed",
      succeededAt: null,
    });

    await assert.rejects(ensure(fixture, purchaseId), {
      message: "hub_purchase_period_invalid",
    });
  });
});

test("two independent awaiting chains are reported instead of guessed", async () => {
  await withFixture(async (fixture) => {
    const firstCohort = await insertCohortPrimary(fixture, null);
    const secondCohort = await insertCohortPrimary(fixture, null);
    await ensure(
      fixture,
      await insertPurchase(fixture.tx, { telegramUserId: fixture.ownerId }),
      firstCohort.cohortId,
    );
    // Written directly: the service itself never creates a second awaiting chain.
    await fixture.tx.insert(accessEntitlements).values({
      purchaseId: await insertPurchase(fixture.tx, { telegramUserId: fixture.ownerId }),
      accessKey: "inspiration-hub",
      sourceKind: "standalone_hub",
      periodStartMode: "after_entitlement",
      paidDurationDays: 56,
      startsAfterEntitlementId: secondCohort.primary.id,
    });
    const purchaseId = await insertPurchase(fixture.tx, {
      telegramUserId: fixture.ownerId,
    });

    await assert.rejects(ensure(fixture, purchaseId), {
      message: "hub_period_selection_ambiguous",
    });
  });
});

test(
  "concurrent renewals of one owner form one chain instead of branching",
  { timeout: 20000 },
  async () => {
    const ownerId = createTestTelegramUserId();
    const purchaseIds: string[] = [];

    try {
      const activeId = await db.transaction(async (tx) => {
        const fixture = { tx, ownerId };
        const active = await insertPaymentPeriod(fixture, ACTIVE_PAID_AT);
        purchaseIds.push(active.purchaseId);
        for (let index = 0; index < 3; index += 1) {
          purchaseIds.push(await insertPurchase(tx, { telegramUserId: ownerId }));
        }
        return active.id;
      });

      const renewals = await Promise.all(
        purchaseIds.slice(1).map((purchaseId) =>
          ensureHubPurchasePeriodInDatabase({
            purchaseId,
            continuationCohortId: null,
            processedAt: PROCESSED_AT,
          }),
        ),
      );

      // Each renewal follows a distinct predecessor, and together they form one chain.
      const predecessorIds = renewals.map((right) => right.startsAfterEntitlementId);
      assert.equal(new Set(predecessorIds).size, renewals.length);
      const ids = new Set([activeId, ...renewals.map((right) => right.id)]);
      assert.ok(predecessorIds.every((id) => id !== null && ids.has(id)));
      assert.ok(predecessorIds.includes(activeId));

      const ordered = [...renewals].sort(
        (left, right) =>
          (left.startsAt?.getTime() ?? 0) - (right.startsAt?.getTime() ?? 0),
      );
      for (let index = 1; index < ordered.length; index += 1) {
        assert.deepEqual(ordered[index].startsAt, ordered[index - 1].expiresAt);
      }
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
          .where(
            and(
              inArray(accessEntitlements.purchaseId, purchaseIds),
              eq(accessEntitlements.accessKey, "inspiration-hub"),
            ),
          );
        await tx.delete(purchases).where(inArray(purchases.id, purchaseIds));
      });
    }
  },
);
