import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import {
  lockHubPeriodOwner,
  type ResolveHubPeriodChainCommand,
  resolveHubPeriodChainInTransaction,
} from "@/db/hub-period-chain-resolution";
import { resolveHubPeriodChainInDatabase } from "@/db/hub-period-chain-service";
import * as schema from "@/db/schema";
import {
  accessEntitlements,
  onlineGroupCohorts,
  purchases,
  telegramChats,
} from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";
import type { HubPeriodChainPlan } from "@/lib/inspiration-hub/period-chain";

import { waitForPostgresBlock } from "../helpers/postgres-locks";
import { createTestTelegramUserIdPair } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
const serviceApplicationName = `hub-period-service-test-${randomUUID()}`;
const serviceDatabaseUrl = new URL(databaseUrl);
serviceDatabaseUrl.searchParams.set("application_name", serviceApplicationName);
serviceDatabaseUrl.searchParams.set("statement_timeout", "8000");
// The service must explicitly select Read Committed, regardless of the pool default.
serviceDatabaseUrl.searchParams.set("default_transaction_isolation", "repeatable read");
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = serviceDatabaseUrl.toString();

const applicationClient = getDatabaseClient();
const client = postgres(databaseUrl, {
  connect_timeout: 5,
  max: 5,
  prepare: false,
});
const db = drizzle(client, { schema });

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const [OWNER_ID, OTHER_OWNER_ID] = createTestTelegramUserIdPair();
const CREATED_AT = new Date("2026-11-10T09:00:00.000Z");
const ONLINE_START = new Date("2026-10-01T08:00:00.000Z");
const CLOSED_AT = new Date("2026-11-15T12:00:00.000Z");
const ONLINE_END = new Date("2026-11-15T23:00:00.000Z");
const FIRST_END = new Date("2027-01-10T23:00:00.000Z");
const SECOND_END = new Date("2027-03-07T23:00:00.000Z");
const THIRD_END = new Date("2027-05-02T22:00:00.000Z");
const WRITTEN_AT = new Date("2026-11-16T10:00:00.000Z");
const READ_CONFLICT = "hub_period_chain_read_conflict";
const INVALID_CHAIN = "hub_period_chain_invalid";
const INVALID_PREDECESSOR = "hub_period_predecessor_invalid";
const CONCURRENT_TEST = { timeout: 15000 };

type Fixture = {
  cohortId: string;
  spareCohortId: string;
  mainChatId: string;
  spareChatId: string;
  rootId: string;
  firstId: string;
  secondId: string;
  spareId: string;
  rootPurchaseId: string;
  firstPurchaseId: string;
  secondPurchaseId: string;
  sparePurchaseId: string;
  extraIds: string[];
};

function entitlementIds(fixture: Fixture): string[] {
  return [
    fixture.rootId,
    fixture.firstId,
    fixture.secondId,
    fixture.spareId,
    ...fixture.extraIds,
  ];
}

function purchaseIds(fixture: Fixture): string[] {
  return [
    fixture.rootPurchaseId,
    fixture.firstPurchaseId,
    fixture.secondPurchaseId,
    fixture.sparePurchaseId,
  ];
}

async function seedFixture(tx: DatabaseTransaction): Promise<Fixture> {
  const [firstId, rootId, secondId] = [randomUUID(), randomUUID(), randomUUID()].sort();
  const [rootPurchaseId, firstPurchaseId, secondPurchaseId, sparePurchaseId] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ].sort();
  const [spareCohortId, cohortId] = [randomUUID(), randomUUID()].sort();
  const fixture: Fixture = {
    cohortId,
    spareCohortId,
    rootId,
    firstId,
    secondId,
    rootPurchaseId,
    firstPurchaseId,
    secondPurchaseId,
    sparePurchaseId,
    spareId: randomUUID(),
    mainChatId: `resolution_main_${randomUUID()}`,
    spareChatId: `resolution_spare_${randomUUID()}`,
    extraIds: [],
  };
  await tx.insert(telegramChats).values([
    { chatId: fixture.mainChatId, title: "Resolution cohort", type: "supergroup" },
    { chatId: fixture.spareChatId, title: "Unrelated cohort", type: "supergroup" },
  ]);
  await tx.insert(onlineGroupCohorts).values([
    {
      id: cohortId,
      title: "Closed resolution cohort",
      mainChatId: fixture.mainChatId,
      startsAt: ONLINE_START,
      closedAt: CLOSED_AT,
      accessEndsAt: ONLINE_END,
      lessonsClearedAt: CLOSED_AT,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    {
      id: spareCohortId,
      title: "Other cohort",
      mainChatId: fixture.spareChatId,
      startsAt: ONLINE_START,
    },
  ]);
  await tx.insert(purchases).values(
    purchaseIds(fixture).map((id) => ({
      id,
      paymentIntentId: `pi_resolution_${id}`,
      amountMinor: 4000,
      currency: "eur",
      stripeStatus: "succeeded",
      outcome: "succeeded" as const,
      telegramUserId: OWNER_ID,
      succeededAt: CREATED_AT,
      onlineGroupCohortId: id === rootPurchaseId ? cohortId : null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    })),
  );
  await tx.insert(accessEntitlements).values({
    id: rootId,
    purchaseId: rootPurchaseId,
    sourceKind: "online_group",
    accessKey: "primary",
    startsAt: ONLINE_START,
    expiresAt: ONLINE_END,
    telegramChatId: fixture.mainChatId,
    telegramUserId: OWNER_ID,
    status: "activated",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  const pending = {
    sourceKind: "standalone_hub" as const,
    accessKey: "inspiration-hub",
    periodStartMode: "after_entitlement" as const,
    paidDurationDays: 56,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
  await tx.insert(accessEntitlements).values({
    ...pending,
    id: firstId,
    purchaseId: firstPurchaseId,
    startsAfterEntitlementId: rootId,
  });
  await tx.insert(accessEntitlements).values({
    ...pending,
    id: secondId,
    purchaseId: secondPurchaseId,
    startsAfterEntitlementId: firstId,
  });
  await tx.insert(accessEntitlements).values({
    id: fixture.spareId,
    purchaseId: sparePurchaseId,
    sourceKind: "standalone_hub",
    accessKey: "inspiration-hub",
    periodStartMode: "payment",
    paidDurationDays: 56,
    startsAt: CREATED_AT,
    expiresAt: new Date("2027-01-05T09:00:00.000Z"),
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  return fixture;
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const fixture = await db.transaction(seedFixture);
  try {
    await run(fixture);
  } finally {
    await db.transaction(async (tx) => {
      await tx
        .update(accessEntitlements)
        .set({
          periodStartMode: null,
          paidDurationDays: null,
          startsAfterEntitlementId: null,
        })
        .where(inArray(accessEntitlements.id, entitlementIds(fixture)));
      await tx
        .delete(accessEntitlements)
        .where(inArray(accessEntitlements.id, entitlementIds(fixture)));
      await tx.delete(purchases).where(inArray(purchases.id, purchaseIds(fixture)));
      await tx
        .delete(onlineGroupCohorts)
        .where(inArray(onlineGroupCohorts.id, [fixture.cohortId, fixture.spareCohortId]));
      await tx
        .delete(telegramChats)
        .where(inArray(telegramChats.chatId, [fixture.mainChatId, fixture.spareChatId]));
    });
  }
}

function command(
  fixture: Fixture,
  entitlementId = fixture.rootId,
): ResolveHubPeriodChainCommand {
  return { telegramUserId: OWNER_ID, entitlementId, updatedAt: WRITTEN_AT };
}

function expectedPlan(fixture: Fixture): HubPeriodChainPlan {
  return {
    updates: [
      { entitlementId: fixture.firstId, startsAt: ONLINE_END, expiresAt: FIRST_END },
      { entitlementId: fixture.secondId, startsAt: FIRST_END, expiresAt: SECOND_END },
    ],
    waitingEntitlementIds: [],
  };
}

async function prepareTransaction(tx: DatabaseTransaction): Promise<number> {
  await tx.execute(sql`SET LOCAL statement_timeout = '8s'`);
  await tx.execute(sql`SET LOCAL lock_timeout = '6s'`);
  const [row] = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
  assert.ok(row);
  return row.pid;
}

async function resolve(input: ResolveHubPeriodChainCommand): Promise<HubPeriodChainPlan> {
  return db.transaction(async (tx) => {
    await prepareTransaction(tx);
    return resolveHubPeriodChainInTransaction(tx, input);
  });
}

async function readSnapshot(fixture: Fixture) {
  return {
    entitlements: await db
      .select()
      .from(accessEntitlements)
      .where(inArray(accessEntitlements.id, entitlementIds(fixture)))
      .orderBy(asc(accessEntitlements.id)),
    purchases: await db
      .select()
      .from(purchases)
      .where(inArray(purchases.id, purchaseIds(fixture)))
      .orderBy(asc(purchases.id)),
    cohorts: await db
      .select()
      .from(onlineGroupCohorts)
      .where(inArray(onlineGroupCohorts.id, [fixture.cohortId, fixture.spareCohortId]))
      .orderBy(asc(onlineGroupCohorts.id)),
  };
}

function assertOnlyPlanChanged(
  before: Awaited<ReturnType<typeof readSnapshot>>,
  after: Awaited<ReturnType<typeof readSnapshot>>,
  plan: HubPeriodChainPlan,
  updatedAt = WRITTEN_AT,
): void {
  assert.deepEqual(after, {
    ...before,
    entitlements: before.entitlements.map((row) => {
      const update = plan.updates.find((item) => item.entitlementId === row.id);
      return update
        ? { ...row, startsAt: update.startsAt, expiresAt: update.expiresAt, updatedAt }
        : row;
    }),
  });
}

const hasPostgresCode =
  (code: string) =>
  (error: unknown): boolean =>
    error instanceof Error &&
    error.cause instanceof postgres.PostgresError &&
    error.cause.code === code;

async function lockRow(
  tx: DatabaseTransaction,
  kind: "cohort" | "purchase" | "entitlement",
  id: string,
): Promise<void> {
  if (kind === "cohort") {
    await tx
      .select()
      .from(onlineGroupCohorts)
      .where(eq(onlineGroupCohorts.id, id))
      .for("update");
  } else if (kind === "purchase") {
    await tx.select().from(purchases).where(eq(purchases.id, id)).for("update");
  } else {
    await tx
      .select()
      .from(accessEntitlements)
      .where(eq(accessEntitlements.id, id))
      .for("update");
  }
}

type BlockedOperation<T> = {
  hold: (tx: DatabaseTransaction) => Promise<unknown>;
  run: (tx: DatabaseTransaction) => Promise<T>;
  change?: (tx: DatabaseTransaction) => Promise<unknown>;
  observe?: () => Promise<void>;
  rollbackHolder?: boolean;
};

async function runBlocked<T>(options: BlockedOperation<T>): Promise<T> {
  const holderReady = Promise.withResolvers<number>();
  const operationReady = Promise.withResolvers<number>();
  const releaseHolder = Promise.withResolvers<void>();
  const rollback = new Error("rollback_resolution_test_holder");
  const holder = db.transaction(async (tx) => {
    const pid = await prepareTransaction(tx);
    await options.hold(tx);
    holderReady.resolve(pid);
    await releaseHolder.promise;
    await options.change?.(tx);
    if (options.rollbackHolder) throw rollback;
  });
  const operation = db.transaction(async (tx) => {
    await holderReady.promise;
    operationReady.resolve(await prepareTransaction(tx));
    return options.run(tx);
  });
  const outcomes = Promise.allSettled([holder, operation]);
  void holder.catch(holderReady.reject);
  void operation.catch(operationReady.reject);
  try {
    const [holderPid, operationPid] = await Promise.all([
      holderReady.promise,
      operationReady.promise,
    ]);
    await waitForPostgresBlock(client, operationPid, holderPid);
    await options.observe?.();
  } finally {
    releaseHolder.resolve();
    await outcomes;
  }
  const [holderOutcome, operationOutcome] = await outcomes;
  if (options.rollbackHolder) {
    assert.equal(holderOutcome.status, "rejected");
    if (holderOutcome.status === "rejected")
      assert.strictEqual(holderOutcome.reason, rollback);
  } else if (holderOutcome.status === "rejected") {
    throw holderOutcome.reason;
  }
  if (operationOutcome.status === "rejected") throw operationOutcome.reason;
  return operationOutcome.value;
}

async function makeOpen(tx: DatabaseTransaction, fixture: Fixture): Promise<void> {
  await tx
    .update(onlineGroupCohorts)
    .set({ closedAt: null, accessEndsAt: null })
    .where(eq(onlineGroupCohorts.id, fixture.cohortId));
  await tx
    .update(accessEntitlements)
    .set({ expiresAt: null })
    .where(eq(accessEntitlements.id, fixture.rootId));
}

async function attachSpare(tx: DatabaseTransaction, fixture: Fixture): Promise<void> {
  await tx
    .update(accessEntitlements)
    .set({
      periodStartMode: "after_entitlement",
      startsAfterEntitlementId: fixture.secondId,
      startsAt: null,
      expiresAt: null,
    })
    .where(eq(accessEntitlements.id, fixture.spareId));
}

for (const entry of ["rootId", "firstId", "secondId"] as const) {
  test(`entry at ${entry} commits the complete plan and changes only period dates`, async () => {
    await withFixture(async (fixture) => {
      const before = await readSnapshot(fixture);
      const input = Object.freeze(command(fixture, fixture[entry]));
      assert.deepEqual(await resolve(input), expectedPlan(fixture));
      assertOnlyPlanChanged(before, await readSnapshot(fixture), expectedPlan(fixture));
      assert.deepEqual(input, command(fixture, fixture[entry]));
    });
  });
}

test("a repeated operation leaves resolved dates and updatedAt unchanged", async () => {
  await withFixture(async (fixture) => {
    await resolve(command(fixture));
    const before = await readSnapshot(fixture);
    const result = await resolve({
      ...command(fixture, fixture.secondId),
      updatedAt: new Date("2027-01-01T12:00:00Z"),
    });
    assert.deepEqual(result, { updates: [], waitingEntitlementIds: [] });
    assert.deepEqual(await readSnapshot(fixture), before);
  });
});

test("an open cohort returns the full waiting suffix without changes", async () => {
  await withFixture(async (fixture) => {
    await db.transaction((tx) => makeOpen(tx, fixture));
    const before = await readSnapshot(fixture);
    assert.deepEqual(await resolve(command(fixture)), {
      updates: [],
      waitingEntitlementIds: [fixture.firstId, fixture.secondId],
    });
    assert.deepEqual(await readSnapshot(fixture), before);
  });
});

for (const pending of [false, true]) {
  test(`a payment-root chain ${pending ? "with a renewal" : "alone"} works without cohort queries`, async () => {
    await withFixture(async (fixture) => {
      if (pending) {
        await db
          .update(accessEntitlements)
          .set({ startsAfterEntitlementId: fixture.spareId })
          .where(eq(accessEntitlements.id, fixture.firstId));
      }
      const queries: string[] = [];
      const recorded = drizzle(client, {
        schema,
        logger: { logQuery: (query) => queries.push(query) },
      });
      const result = await recorded.transaction((tx) =>
        resolveHubPeriodChainInTransaction(tx, command(fixture, fixture.spareId)),
      );
      assert.equal(
        queries.some((query) => /from "online_group_cohorts"/i.test(query)),
        false,
      );
      assert.deepEqual(
        result,
        pending
          ? {
              updates: [
                {
                  entitlementId: fixture.firstId,
                  startsAt: new Date("2027-01-05T09:00:00Z"),
                  expiresAt: new Date("2027-03-02T09:00:00Z"),
                },
                {
                  entitlementId: fixture.secondId,
                  startsAt: new Date("2027-03-02T09:00:00Z"),
                  expiresAt: new Date("2027-04-27T08:00:00Z"),
                },
              ],
              waitingEntitlementIds: [],
            }
          : { updates: [], waitingEntitlementIds: [] },
      );
    });
  });
}

test("a resolved prefix is validated and only its pending tail is written", async () => {
  await withFixture(async (fixture) => {
    await db
      .update(accessEntitlements)
      .set({ startsAt: ONLINE_END, expiresAt: FIRST_END })
      .where(eq(accessEntitlements.id, fixture.firstId));
    const before = await readSnapshot(fixture);
    const plan: HubPeriodChainPlan = {
      updates: [expectedPlan(fixture).updates[1]],
      waitingEntitlementIds: [],
    };
    assert.deepEqual(await resolve(command(fixture)), plan);
    assertOnlyPlanChanged(before, await readSnapshot(fixture), plan);
  });
});

test("late payment after an Online break starts the paid chain at payment", async () => {
  await withFixture(async (fixture) => {
    await db
      .update(purchases)
      .set({ succeededAt: new Date("2026-11-20T11:00:00Z") })
      .where(eq(purchases.id, fixture.firstPurchaseId));
    assert.deepEqual(await resolve(command(fixture)), {
      updates: [
        {
          entitlementId: fixture.firstId,
          startsAt: new Date("2026-11-20T11:00:00Z"),
          expiresAt: new Date("2027-01-15T11:00:00Z"),
        },
        {
          entitlementId: fixture.secondId,
          startsAt: new Date("2027-01-15T11:00:00Z"),
          expiresAt: new Date("2027-03-12T11:00:00Z"),
        },
      ],
      waitingEntitlementIds: [],
    });
  });
});

test("an unlinked Plus Hub right sharing the root purchase remains untouched", async () => {
  await withFixture(async (fixture) => {
    const id = randomUUID();
    fixture.extraIds.push(id);
    await db.insert(accessEntitlements).values({
      id,
      purchaseId: fixture.rootPurchaseId,
      sourceKind: "online_group",
      accessKey: "inspiration-hub",
      expiresAt: ONLINE_END,
    });
    const before = await readSnapshot(fixture);
    await resolve(command(fixture));
    assertOnlyPlanChanged(before, await readSnapshot(fixture), expectedPlan(fixture));
  });
});

test("a caller rollback undoes every successful period update", async () => {
  await withFixture(async (fixture) => {
    const before = await readSnapshot(fixture);
    const rollback = new Error("caller_cancelled_resolution");
    await assert.rejects(
      db.transaction(async (tx) => {
        assert.deepEqual(
          await resolveHubPeriodChainInTransaction(tx, command(fixture)),
          expectedPlan(fixture),
        );
        throw rollback;
      }),
      (error: unknown) => error === rollback,
    );
    assert.deepEqual(await readSnapshot(fixture), before);
  });
});

test("a database failure on the second update preserves its cause and rolls back the first", async () => {
  await withFixture(async (fixture) => {
    const before = await readSnapshot(fixture);
    await assert.rejects(
      db.transaction(async (tx) => {
        // Transaction-local fault injection; DDL and trigger disappear on rollback.
        await tx.execute(
          sql`SELECT set_config('dance_course_test.fail_entitlement', ${fixture.secondId}, true)`,
        );
        await tx.execute(
          sql`SELECT set_config('dance_course_test.first_entitlement', ${fixture.firstId}, true)`,
        );
        await tx.execute(sql`
        CREATE FUNCTION pg_temp.reject_hub_resolution_write() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.id::text = current_setting('dance_course_test.fail_entitlement', true) THEN
            IF NOT EXISTS (
              SELECT 1 FROM access_entitlements
              WHERE id::text = current_setting('dance_course_test.first_entitlement', true)
                AND starts_at IS NOT NULL
            ) THEN
              RAISE EXCEPTION 'first_update_not_applied' USING ERRCODE = 'P0002';
            END IF;
            RAISE EXCEPTION 'resolution_second_update_failed' USING ERRCODE = 'P0001';
          END IF;
          RETURN NEW;
        END;
        $$
      `);
        await tx.execute(sql`
        CREATE TRIGGER hub_resolution_test_failure BEFORE UPDATE ON access_entitlements
        FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_hub_resolution_write()
      `);
        return resolveHubPeriodChainInTransaction(tx, command(fixture));
      }),
      (error: unknown) =>
        hasPostgresCode("P0001")(error) &&
        error instanceof Error &&
        error.cause instanceof postgres.PostgresError &&
        error.cause.message === "resolution_second_update_failed",
    );
    assert.deepEqual(await readSnapshot(fixture), before);
  });
});

for (const invalid of [
  "wrong owner",
  "root without cohort",
  "revoked root",
  "failed tail",
  "wrong tail owner",
  "ready tail after pending",
]) {
  test(`${invalid} rejects before changing period dates`, async () => {
    await withFixture(async (fixture) => {
      const input = command(fixture);
      let message = INVALID_PREDECESSOR;
      if (invalid === "wrong owner") input.telegramUserId = OTHER_OWNER_ID;
      if (invalid === "root without cohort")
        await db
          .update(purchases)
          .set({ onlineGroupCohortId: null })
          .where(eq(purchases.id, fixture.rootPurchaseId));
      if (invalid === "revoked root")
        await db
          .update(accessEntitlements)
          .set({ revokedAt: CREATED_AT, status: "revoked" })
          .where(eq(accessEntitlements.id, fixture.rootId));
      if (invalid === "failed tail") {
        await db
          .update(purchases)
          .set({ outcome: "failed" })
          .where(eq(purchases.id, fixture.secondPurchaseId));
        message = INVALID_CHAIN;
      }
      if (invalid === "wrong tail owner") {
        await db
          .update(purchases)
          .set({ telegramUserId: OTHER_OWNER_ID })
          .where(eq(purchases.id, fixture.secondPurchaseId));
        message = INVALID_CHAIN;
      }
      if (invalid === "ready tail after pending") {
        await db
          .update(accessEntitlements)
          .set({ startsAt: FIRST_END, expiresAt: SECOND_END })
          .where(eq(accessEntitlements.id, fixture.secondId));
        message = INVALID_CHAIN;
      }
      const before = await readSnapshot(fixture);
      await assert.rejects(resolve(input), { message });
      assert.deepEqual(await readSnapshot(fixture), before);
    });
  });
}

test("missing input is a read conflict and malformed input preserves PostgreSQL cause", async () => {
  await assert.rejects(
    resolve({
      telegramUserId: OWNER_ID,
      entitlementId: randomUUID(),
      updatedAt: WRITTEN_AT,
    }),
    { message: READ_CONFLICT },
  );
  await assert.rejects(
    resolve({
      telegramUserId: OWNER_ID,
      entitlementId: "invalid-uuid",
      updatedAt: WRITTEN_AT,
    }),
    hasPostgresCode("22P02"),
  );
});

for (const rollbackHolder of [false, true]) {
  test(
    `owner lock is held after helper return until ${rollbackHolder ? "rollback" : "commit"}`,
    CONCURRENT_TEST,
    async () => {
      await runBlocked({
        hold: (tx) => lockHubPeriodOwner(tx, OWNER_ID),
        // Independent SQL verifies the exact shared key, not just two identical helpers.
        run: (tx) =>
          tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${`hub-period-owner:${OWNER_ID}`}, 0))`,
          ),
        rollbackHolder,
      });
    },
  );
}

test("different owners do not share a lock and a transaction can reacquire its own", async () => {
  await db.transaction(async (holder) => {
    await prepareTransaction(holder);
    await lockHubPeriodOwner(holder, OWNER_ID);
    await lockHubPeriodOwner(holder, OWNER_ID);
    await db.transaction(async (other) => {
      await other.execute(sql`SET LOCAL lock_timeout = '500ms'`);
      await lockHubPeriodOwner(other, OTHER_OWNER_ID);
    });
  });
});

for (const rollbackHolder of [false, true]) {
  test(
    `a second resolver waits for the first and resumes after ${rollbackHolder ? "rollback" : "commit"}`,
    CONCURRENT_TEST,
    async () => {
      await withFixture(async (fixture) => {
        const result = await runBlocked({
          hold: async (tx) => {
            assert.deepEqual(
              await resolveHubPeriodChainInTransaction(tx, command(fixture)),
              expectedPlan(fixture),
            );
          },
          run: (tx) =>
            resolveHubPeriodChainInTransaction(tx, {
              ...command(fixture),
              updatedAt: new Date("2026-12-01T12:00:00Z"),
            }),
          rollbackHolder,
        });
        assert.deepEqual(
          result,
          rollbackHolder
            ? expectedPlan(fixture)
            : { updates: [], waitingEntitlementIds: [] },
        );
        const snapshot = await readSnapshot(fixture);
        for (const id of [fixture.firstId, fixture.secondId]) {
          assert.deepEqual(
            snapshot.entitlements.find((row) => row.id === id)?.updatedAt,
            rollbackHolder ? new Date("2026-12-01T12:00:00Z") : WRITTEN_AT,
          );
        }
      });
    },
  );
}

test(
  "initial discovery runs after the owner lock and sees a committed new tail",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      const plan = await runBlocked({
        hold: (tx) => lockHubPeriodOwner(tx, OWNER_ID),
        change: (tx) => attachSpare(tx, fixture),
        run: (tx) => resolveHubPeriodChainInTransaction(tx, command(fixture)),
      });
      assert.deepEqual(plan, {
        updates: [
          ...expectedPlan(fixture).updates,
          { entitlementId: fixture.spareId, startsAt: SECOND_END, expiresAt: THIRD_END },
        ],
        waitingEntitlementIds: [],
      });
    });
  },
);

test(
  "waiting on cohort reads its committed end and the matching Online entitlement end",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      await db.transaction((tx) => makeOpen(tx, fixture));
      const plan = await runBlocked({
        hold: (tx) => lockRow(tx, "cohort", fixture.cohortId),
        change: async (tx) => {
          await tx
            .update(onlineGroupCohorts)
            .set({ closedAt: CLOSED_AT, accessEndsAt: ONLINE_END })
            .where(eq(onlineGroupCohorts.id, fixture.cohortId));
          await tx
            .update(accessEntitlements)
            .set({ expiresAt: ONLINE_END })
            .where(eq(accessEntitlements.id, fixture.rootId));
        },
        run: (tx) => resolveHubPeriodChainInTransaction(tx, command(fixture)),
      });
      assert.deepEqual(plan, expectedPlan(fixture));
    });
  },
);

type ReferenceChange = {
  name: string;
  apply: (tx: DatabaseTransaction, fixture: Fixture) => Promise<unknown>;
};
const referenceChanges: ReferenceChange[] = [
  { name: "a newly attached tail", apply: attachSpare },
  {
    name: "a cohort deleted after its purchase moved elsewhere",
    apply: async (tx, fixture) => {
      await tx
        .update(purchases)
        .set({ onlineGroupCohortId: fixture.spareCohortId })
        .where(eq(purchases.id, fixture.rootPurchaseId));
      await tx
        .delete(onlineGroupCohorts)
        .where(eq(onlineGroupCohorts.id, fixture.cohortId));
    },
  },
  {
    name: "a changed purchase on a nonfirst reference",
    apply: (tx, fixture) =>
      tx
        .update(accessEntitlements)
        .set({ purchaseId: fixture.rootPurchaseId })
        .where(eq(accessEntitlements.id, fixture.secondId)),
  },
  {
    name: "a changed cohort with the same entitlement IDs",
    apply: (tx, fixture) =>
      tx
        .update(purchases)
        .set({ onlineGroupCohortId: fixture.spareCohortId })
        .where(eq(purchases.id, fixture.rootPurchaseId)),
  },
  {
    name: "rewired links with the same nodes and purchases",
    apply: async (tx, fixture) => {
      await tx
        .update(accessEntitlements)
        .set({ startsAfterEntitlementId: fixture.spareId })
        .where(eq(accessEntitlements.id, fixture.firstId));
      await tx
        .update(accessEntitlements)
        .set({ startsAfterEntitlementId: fixture.rootId })
        .where(eq(accessEntitlements.id, fixture.secondId));
      await tx
        .update(accessEntitlements)
        .set({ startsAfterEntitlementId: fixture.secondId })
        .where(eq(accessEntitlements.id, fixture.firstId));
    },
  },
  {
    name: "a removed tail",
    apply: (tx, fixture) =>
      tx.delete(accessEntitlements).where(eq(accessEntitlements.id, fixture.secondId)),
  },
];

for (const change of referenceChanges) {
  test(
    `${change.name} while waiting conflicts instead of using an incomplete snapshot`,
    CONCURRENT_TEST,
    async () => {
      await withFixture(async (fixture) => {
        await assert.rejects(
          runBlocked({
            hold: (tx) => lockRow(tx, "cohort", fixture.cohortId),
            change: (tx) => change.apply(tx, fixture),
            run: (tx) => resolveHubPeriodChainInTransaction(tx, command(fixture)),
          }),
          { message: READ_CONFLICT },
        );
        const snapshot = await readSnapshot(fixture);
        for (const id of [fixture.firstId, fixture.secondId]) {
          const row = snapshot.entitlements.find((item) => item.id === id);
          if (row) {
            assert.equal(row.startsAt, null);
            assert.equal(row.expiresAt, null);
            assert.deepEqual(row.updatedAt, CREATED_AT);
          }
        }
      });
    },
  );
}

for (const target of ["cohort", "purchase", "entitlement"] as const) {
  test(
    `${target} rows stay locked after resolver returns until caller rollback`,
    CONCURRENT_TEST,
    async () => {
      await withFixture(async (fixture) => {
        const before = await readSnapshot(fixture);
        const id =
          target === "cohort"
            ? fixture.cohortId
            : target === "purchase"
              ? fixture.firstPurchaseId
              : fixture.firstId;
        await runBlocked({
          hold: async (tx) => {
            await resolveHubPeriodChainInTransaction(tx, command(fixture));
          },
          run: (tx) => lockRow(tx, target, id),
          rollbackHolder: true,
        });
        assert.deepEqual(await readSnapshot(fixture), before);
      });
    },
  );
}

test(
  "cohorts are locked by ID before purchases even when discovery lists the higher first",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      await db.transaction(async (tx) => {
        await tx
          .update(purchases)
          .set({ onlineGroupCohortId: fixture.spareCohortId })
          .where(eq(purchases.id, fixture.rootPurchaseId));
        await tx
          .update(purchases)
          .set({ onlineGroupCohortId: fixture.cohortId })
          .where(eq(purchases.id, fixture.firstPurchaseId));
      });
      await assert.rejects(
        runBlocked({
          hold: (tx) => lockRow(tx, "cohort", fixture.cohortId),
          observe: async () => {
            await assert.rejects(
              db.transaction((tx) =>
                tx
                  .select()
                  .from(onlineGroupCohorts)
                  .where(eq(onlineGroupCohorts.id, fixture.spareCohortId))
                  .for("update", { noWait: true }),
              ),
              hasPostgresCode("55P03"),
            );
            // No purchase has been locked yet: probing one with NOWAIT still succeeds.
            await db.transaction((tx) =>
              tx
                .select()
                .from(purchases)
                .where(eq(purchases.id, fixture.rootPurchaseId))
                .for("update", { noWait: true }),
            );
          },
          run: (tx) => resolveHubPeriodChainInTransaction(tx, command(fixture)),
        }),
        { message: INVALID_PREDECESSOR },
      );
    });
  },
);

test(
  "all purchases are locked before entitlement locks begin",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      await runBlocked({
        hold: (tx) => lockRow(tx, "entitlement", fixture.firstId),
        observe: async () => {
          await assert.rejects(
            db.transaction((tx) =>
              tx
                .select()
                .from(purchases)
                .where(eq(purchases.id, fixture.secondPurchaseId))
                .for("update", { noWait: true }),
            ),
            hasPostgresCode("55P03"),
          );
        },
        run: (tx) => resolveHubPeriodChainInTransaction(tx, command(fixture)),
      });
    });
  },
);

test(
  "attaching a new dependency waits for the resolver's locked predecessor",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      await runBlocked({
        hold: async (tx) => {
          assert.deepEqual(
            await resolveHubPeriodChainInTransaction(tx, command(fixture)),
            expectedPlan(fixture),
          );
        },
        // Deliberately bypass owner coordination to exercise the immediate FK lock.
        run: (tx) => attachSpare(tx, fixture),
      });
      const snapshot = await readSnapshot(fixture);
      const tail = snapshot.entitlements.find((row) => row.id === fixture.spareId);
      assert.ok(tail);
      assert.equal(tail.startsAfterEntitlementId, fixture.secondId);
      assert.equal(tail.startsAt, null);
      assert.equal(tail.expiresAt, null);
      assert.deepEqual(
        snapshot.entitlements.find((row) => row.id === fixture.secondId)?.expiresAt,
        SECOND_END,
      );
    });
  },
);

// These tests exercise the production entry point against the same committed
// fixtures. Driver tracing observes real SQL; transactions are not mocked.
async function withServiceStatements(
  run: (statements: readonly string[]) => Promise<void>,
): Promise<void> {
  const previousDebug = applicationClient.options.debug;
  const statements: string[] = [];
  applicationClient.options.debug = (_connection, query) => {
    statements.push(query.trim().replace(/\s+/g, " ").toLowerCase());
  };
  try {
    await run(statements);
  } finally {
    applicationClient.options.debug = previousDebug;
  }
}

function transactionStatements(statements: readonly string[]): string[] {
  return statements.filter((query) => ["begin", "commit", "rollback"].includes(query));
}

async function waitForServiceBlockedOn(blockingPid: number): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [row] = await client<{ blocked: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE application_name = ${serviceApplicationName}
          AND ${blockingPid} = ANY(pg_blocking_pids(pid))
          AND query LIKE '%online_group_cohorts%'
      ) AS blocked
    `;
    if (row?.blocked) return;
    await delay(10);
  }
  assert.fail("The database service never waited on the held cohort row.");
}

async function withServiceWriteFault(
  fixture: Fixture,
  code: "P0001" | "40001" | "40P01",
  failures: number,
  run: () => Promise<void>,
): Promise<void> {
  // A sequence survives rollback, so each failed whole-transaction attempt can
  // be counted independently. The trigger affects only this fixture's tail.
  await client.begin(async (tx) => {
    await tx`
      CREATE TABLE hub_service_test_write_fault (
        entitlement_id uuid PRIMARY KEY,
        first_entitlement_id uuid NOT NULL,
        error_code text NOT NULL,
        failures integer NOT NULL
      )
    `;
    await tx`CREATE SEQUENCE hub_service_test_write_attempt`;
    await tx`
      INSERT INTO hub_service_test_write_fault
        (entitlement_id, first_entitlement_id, error_code, failures)
      VALUES (${fixture.secondId}, ${fixture.firstId}, ${code}, ${failures})
    `;
    await tx`
      CREATE FUNCTION hub_service_test_reject_write() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        fault hub_service_test_write_fault%ROWTYPE;
      BEGIN
        SELECT * INTO fault FROM hub_service_test_write_fault
        WHERE entitlement_id = NEW.id;
        IF NOT FOUND THEN
          RETURN NEW;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM access_entitlements
          WHERE id = fault.first_entitlement_id AND starts_at IS NOT NULL
        ) THEN
          RAISE EXCEPTION 'service_first_update_not_applied' USING ERRCODE = 'P0002';
        END IF;
        IF nextval('hub_service_test_write_attempt') <= fault.failures THEN
          RAISE EXCEPTION 'service_second_update_failed' USING ERRCODE = fault.error_code;
        END IF;
        RETURN NEW;
      END;
      $$
    `;
    await tx`
      CREATE TRIGGER hub_service_test_write_failure
      BEFORE UPDATE ON access_entitlements
      FOR EACH ROW EXECUTE FUNCTION hub_service_test_reject_write()
    `;
  });
  try {
    await run();
  } finally {
    await client.begin(async (tx) => {
      await tx`DROP TRIGGER hub_service_test_write_failure ON access_entitlements`;
      await tx`DROP FUNCTION hub_service_test_reject_write()`;
      await tx`DROP TABLE hub_service_test_write_fault`;
      await tx`DROP SEQUENCE hub_service_test_write_attempt`;
    });
  }
}

test("database service commits the plan with explicit Read Committed and preserves its command", async () => {
  await withFixture(async (fixture) => {
    const before = await readSnapshot(fixture);
    const input = Object.freeze(command(fixture));
    const [defaults] = await applicationClient<
      { default_transaction_isolation: string }[]
    >`
      SHOW default_transaction_isolation
    `;
    assert.equal(defaults?.default_transaction_isolation, "repeatable read");
    await withServiceStatements(async (statements) => {
      assert.deepEqual(
        await resolveHubPeriodChainInDatabase(input),
        expectedPlan(fixture),
      );
      assert.deepEqual(transactionStatements(statements), ["begin", "commit"]);
      assert.ok(statements.includes("set transaction isolation level read committed"));
    });
    // An independent client sees the changes as soon as the service resolves.
    assertOnlyPlanChanged(before, await readSnapshot(fixture), expectedPlan(fixture));
    assert.deepEqual(input, command(fixture));
  });
});

test("database service repeating a resolved chain preserves dates and updatedAt", async () => {
  await withFixture(async (fixture) => {
    await resolveHubPeriodChainInDatabase(command(fixture));
    const before = await readSnapshot(fixture);
    assert.deepEqual(
      await resolveHubPeriodChainInDatabase({
        ...command(fixture, fixture.secondId),
        updatedAt: new Date("2027-01-01T12:00:00Z"),
      }),
      { updates: [], waitingEntitlementIds: [] },
    );
    assert.deepEqual(await readSnapshot(fixture), before);
  });
});

test("database service commits a waiting result without changing unresolved dates", async () => {
  await withFixture(async (fixture) => {
    await db.transaction((tx) => makeOpen(tx, fixture));
    const before = await readSnapshot(fixture);
    await withServiceStatements(async (statements) => {
      assert.deepEqual(await resolveHubPeriodChainInDatabase(command(fixture)), {
        updates: [],
        waitingEntitlementIds: [fixture.firstId, fixture.secondId],
      });
      assert.deepEqual(transactionStatements(statements), ["begin", "commit"]);
    });
    assert.deepEqual(await readSnapshot(fixture), before);
  });
});

test(
  "concurrent database service calls serialize and persist the chain once",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      const results = await Promise.all([
        resolveHubPeriodChainInDatabase(command(fixture)),
        resolveHubPeriodChainInDatabase(command(fixture, fixture.secondId)),
      ]);
      const written = results.filter((result) => result.updates.length !== 0);
      const unchanged = results.filter((result) => result.updates.length === 0);
      assert.deepEqual(written, [expectedPlan(fixture)]);
      assert.deepEqual(unchanged, [{ updates: [], waitingEntitlementIds: [] }]);
      const snapshot = await readSnapshot(fixture);
      for (const update of expectedPlan(fixture).updates) {
        const entitlement = snapshot.entitlements.find(
          (row) => row.id === update.entitlementId,
        );
        assert.ok(entitlement);
        assert.deepEqual(entitlement.startsAt, update.startsAt);
        assert.deepEqual(entitlement.expiresAt, update.expiresAt);
        assert.deepEqual(entitlement.updatedAt, WRITTEN_AT);
      }
    });
  },
);

test("database service rejects a different owner after one rolled-back attempt", async () => {
  await withFixture(async (fixture) => {
    const before = await readSnapshot(fixture);
    await withServiceStatements(async (statements) => {
      await assert.rejects(
        resolveHubPeriodChainInDatabase({
          ...command(fixture),
          telegramUserId: OTHER_OWNER_ID,
        }),
        { message: INVALID_PREDECESSOR },
      );
      assert.deepEqual(transactionStatements(statements), ["begin", "rollback"]);
    });
    assert.deepEqual(await readSnapshot(fixture), before);
    await db.transaction(async (tx) => {
      const [row] = await tx.execute<{ acquired: boolean }>(
        sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`hub-period-owner:${OTHER_OWNER_ID}`}, 0)) AS acquired`,
      );
      assert.equal(row?.acquired, true);
    });
  });
});

test("database service preserves a permanent PostgreSQL cause without retry", async () => {
  await withServiceStatements(async (statements) => {
    await assert.rejects(
      resolveHubPeriodChainInDatabase({
        telegramUserId: OWNER_ID,
        entitlementId: "invalid-uuid",
        updatedAt: WRITTEN_AT,
      }),
      hasPostgresCode("22P02"),
    );
    assert.deepEqual(transactionStatements(statements), ["begin", "rollback"]);
  });
});

test("database service exhausts a persistent read conflict after exactly three transactions", async () => {
  await withServiceStatements(async (statements) => {
    await assert.rejects(
      resolveHubPeriodChainInDatabase({
        telegramUserId: OWNER_ID,
        entitlementId: randomUUID(),
        updatedAt: WRITTEN_AT,
      }),
      { message: READ_CONFLICT },
    );
    assert.deepEqual(transactionStatements(statements), [
      "begin",
      "rollback",
      "begin",
      "rollback",
      "begin",
      "rollback",
    ]);
  });
});

test(
  "database service retries a changed graph in a fresh transaction and resolves the new tail",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      const before = await readSnapshot(fixture);
      const input = Object.freeze(command(fixture));
      const holderReady = Promise.withResolvers<number>();
      const releaseHolder = Promise.withResolvers<void>();
      const holder = db.transaction(async (tx) => {
        const pid = await prepareTransaction(tx);
        await lockRow(tx, "cohort", fixture.cohortId);
        holderReady.resolve(pid);
        await releaseHolder.promise;
        await attachSpare(tx, fixture);
      });
      void holder.catch(holderReady.reject);
      await withServiceStatements(async (statements) => {
        const operation = holderReady.promise.then(() =>
          resolveHubPeriodChainInDatabase(input),
        );
        const outcomes = Promise.allSettled([holder, operation]);
        try {
          await waitForServiceBlockedOn(await holderReady.promise);
        } finally {
          releaseHolder.resolve();
          await outcomes;
        }
        const [held, resolved] = await outcomes;
        if (held.status === "rejected") throw held.reason;
        if (resolved.status === "rejected") throw resolved.reason;
        assert.deepEqual(resolved.value, {
          updates: [
            ...expectedPlan(fixture).updates,
            {
              entitlementId: fixture.spareId,
              startsAt: SECOND_END,
              expiresAt: THIRD_END,
            },
          ],
          waitingEntitlementIds: [],
        });
        assert.deepEqual(transactionStatements(statements), [
          "begin",
          "rollback",
          "begin",
          "commit",
        ]);
        assert.equal(
          statements.filter(
            (query) => query === "set transaction isolation level read committed",
          ).length,
          2,
        );
      });
      const snapshot = await readSnapshot(fixture);
      assert.deepEqual(snapshot.purchases, before.purchases);
      assert.deepEqual(snapshot.cohorts, before.cohorts);
      assert.deepEqual(input, command(fixture));
      for (const id of [fixture.firstId, fixture.secondId, fixture.spareId]) {
        assert.deepEqual(
          snapshot.entitlements.find((row) => row.id === id)?.updatedAt,
          WRITTEN_AT,
        );
      }
    });
  },
);

test("database service rolls back an earlier write when the next SQL update fails permanently", async () => {
  await withFixture(async (fixture) => {
    const before = await readSnapshot(fixture);
    await withServiceWriteFault(fixture, "P0001", 3, async () => {
      await withServiceStatements(async (statements) => {
        await assert.rejects(
          resolveHubPeriodChainInDatabase(command(fixture)),
          hasPostgresCode("P0001"),
        );
        assert.deepEqual(transactionStatements(statements), ["begin", "rollback"]);
      });
      const [attempts] = await client<{ count: number }[]>`
        SELECT last_value::int AS count FROM hub_service_test_write_attempt
      `;
      assert.equal(attempts?.count, 1);
      assert.deepEqual(await readSnapshot(fixture), before);
    });
  });
});

for (const code of ["40001", "40P01"] as const) {
  for (const failures of [1, 2, 3]) {
    test(`database service handles ${failures} injected ${code} failures with whole-transaction rollback`, async () => {
      await withFixture(async (fixture) => {
        const before = await readSnapshot(fixture);
        const input = Object.freeze(command(fixture));
        await withServiceWriteFault(fixture, code, failures, async () => {
          await withServiceStatements(async (statements) => {
            if (failures === 3) {
              await assert.rejects(
                resolveHubPeriodChainInDatabase(input),
                hasPostgresCode(code),
              );
            } else {
              assert.deepEqual(
                await resolveHubPeriodChainInDatabase(input),
                expectedPlan(fixture),
              );
            }
            const expectedTransactions = Array.from(
              { length: Math.min(failures, 2) },
              () => ["begin", "rollback"],
            ).flat();
            expectedTransactions.push("begin", failures === 3 ? "rollback" : "commit");
            assert.deepEqual(transactionStatements(statements), expectedTransactions);
          });
          const [attempts] = await client<{ count: number }[]>`
            SELECT last_value::int AS count FROM hub_service_test_write_attempt
          `;
          assert.equal(attempts?.count, Math.min(failures + 1, 3));
          const snapshot = await readSnapshot(fixture);
          if (failures === 3) assert.deepEqual(snapshot, before);
          else assertOnlyPlanChanged(before, snapshot, expectedPlan(fixture));
          assert.deepEqual(input, command(fixture));
        });
      });
    });
  }
}
