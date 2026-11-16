import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { ensureHubPaymentPeriodInTransaction } from "@/db/hub-payment-period-persistence";
import { lockHubPeriodOwner } from "@/db/hub-period-chain-resolution";
import { buildHubPeriodPredecessor } from "@/db/hub-period-predecessor";
import * as schema from "@/db/schema";
import {
  accessEntitlements,
  customers,
  onlineGroupCohorts,
  productOffers,
  products,
  purchases,
  telegramChats,
} from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";

import { waitForPostgresBlock } from "../helpers/postgres-locks";
import { createTestTelegramUserIdPair } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), {
  connect_timeout: 5,
  max: 5,
  prepare: false,
  connection: { statement_timeout: 8000, lock_timeout: 6000 },
});
const db = drizzle(client, { schema });
after(async () => client.end());

const [OWNER_ID, OTHER_OWNER_ID] = createTestTelegramUserIdPair();
const CREATED_AT = new Date("2026-11-01T09:00:00Z");
const PAID_AT = new Date("2026-11-10T12:20:15.123Z");
const EXPIRES_AT = new Date("2027-01-05T12:20:15.123Z");
const WRITTEN_AT = new Date("2026-11-10T12:25:00Z");
const REPLAYED_AT = new Date("2026-11-12T10:00:00Z");
const CONFLICT = "hub_payment_period_conflict";
const CONCURRENT_TEST = { timeout: 15000 };

type Entitlement = typeof accessEntitlements.$inferSelect;
type Fixture = {
  purchaseId: string;
  otherPurchaseId: string;
  predecessorId: string;
  customerId: string;
  productId: string;
  offerId: string;
  cohortId: string;
  chatId: string;
};

async function withFixture(
  run: (fixture: Fixture) => Promise<void>,
  telegramUserId: string | null = OWNER_ID,
): Promise<void> {
  const fixture = await db.transaction(async (tx): Promise<Fixture> => {
    const suffix = randomUUID();
    const ids = {
      purchaseId: randomUUID(),
      otherPurchaseId: randomUUID(),
      predecessorId: randomUUID(),
      customerId: randomUUID(),
      productId: randomUUID(),
      offerId: randomUUID(),
      cohortId: randomUUID(),
      chatId: `payment_period_${suffix}`,
    };
    await tx
      .insert(customers)
      .values({ id: ids.customerId, email: `${suffix}@example.test` });
    // Test catalogue only; product selection is the caller's separate responsibility.
    await tx.insert(products).values({
      id: ids.productId,
      code: `period_${suffix}`,
      externalProductId: `prod_${suffix}`,
      slug: `period-${suffix}`,
      type: "course",
      title: "Payment period fixture",
      description: [],
      descriptionKeys: [],
    });
    await tx.insert(productOffers).values({
      id: ids.offerId,
      productId: ids.productId,
      externalOfferId: `off_${suffix}`,
      code: "standard",
      label: "Payment period fixture",
    });
    await tx
      .insert(telegramChats)
      .values({ chatId: ids.chatId, title: "Fixture chat", type: "supergroup" });
    await tx.insert(onlineGroupCohorts).values({
      id: ids.cohortId,
      mainChatId: ids.chatId,
      title: "Fixture cohort",
      startsAt: CREATED_AT,
    });
    await tx.insert(purchases).values(
      [ids.purchaseId, ids.otherPurchaseId].map((id) => ({
        id,
        paymentIntentId: `pi_payment_period_${id}`,
        amountMinor: 4000,
        currency: "eur",
        stripeStatus: "succeeded",
        outcome: "succeeded" as const,
        succeededAt: PAID_AT,
        telegramUserId,
        customerId: ids.customerId,
        productId: ids.productId,
        offerId: ids.offerId,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      })),
    );
    // A different key on this purchase and a different purchase must stay untouched.
    await tx.insert(accessEntitlements).values([
      { purchaseId: ids.purchaseId, accessKey: "primary", status: "pending" },
      {
        id: ids.predecessorId,
        purchaseId: ids.otherPurchaseId,
        accessKey: "primary",
        status: "pending",
      },
    ]);
    return ids;
  });
  try {
    await run(fixture);
  } finally {
    await db.transaction(async (tx) => {
      const purchaseIds = [fixture.purchaseId, fixture.otherPurchaseId];
      await tx
        .update(accessEntitlements)
        .set({
          periodStartMode: null,
          paidDurationDays: null,
          startsAfterEntitlementId: null,
        })
        .where(inArray(accessEntitlements.purchaseId, purchaseIds));
      await tx
        .delete(accessEntitlements)
        .where(inArray(accessEntitlements.purchaseId, purchaseIds));
      await tx.delete(purchases).where(inArray(purchases.id, purchaseIds));
      await tx
        .delete(onlineGroupCohorts)
        .where(eq(onlineGroupCohorts.id, fixture.cohortId));
      await tx.delete(telegramChats).where(eq(telegramChats.chatId, fixture.chatId));
      await tx.delete(productOffers).where(eq(productOffers.id, fixture.offerId));
      await tx.delete(products).where(eq(products.id, fixture.productId));
      await tx.delete(customers).where(eq(customers.id, fixture.customerId));
    });
  }
}

async function lockPurchase(tx: DatabaseTransaction, purchaseId: string) {
  const [reference] = await tx
    .select({ telegramUserId: purchases.telegramUserId })
    .from(purchases)
    .where(eq(purchases.id, purchaseId));
  assert.ok(reference);
  if (reference.telegramUserId !== null)
    await lockHubPeriodOwner(tx, reference.telegramUserId);
  const [purchase] = await tx
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .for("update");
  assert.ok(purchase);
  assert.equal(purchase.telegramUserId, reference.telegramUserId);
  return purchase;
}

async function ensure(
  tx: DatabaseTransaction,
  purchaseId: string,
  updatedAt = WRITTEN_AT,
): Promise<Entitlement> {
  const purchase = Object.freeze(await lockPurchase(tx, purchaseId));
  const before = JSON.stringify(purchase);
  const result = await ensureHubPaymentPeriodInTransaction(tx, { purchase, updatedAt });
  assert.equal(JSON.stringify(purchase), before);
  return result;
}

function persist(purchaseId: string, updatedAt = WRITTEN_AT, database = db) {
  return database.transaction((tx) => ensure(tx, purchaseId, updatedAt), {
    isolationLevel: "read committed",
  });
}

async function snapshot(fixture: Fixture) {
  const ids = [fixture.purchaseId, fixture.otherPurchaseId];
  return {
    purchases: await db
      .select()
      .from(purchases)
      .where(inArray(purchases.id, ids))
      .orderBy(asc(purchases.id)),
    entitlements: await db
      .select()
      .from(accessEntitlements)
      .where(inArray(accessEntitlements.purchaseId, ids))
      .orderBy(asc(accessEntitlements.id)),
  };
}

async function updateEntitlement(
  id: string,
  values: Partial<typeof accessEntitlements.$inferInsert>,
) {
  const [result] = await db
    .update(accessEntitlements)
    .set(values)
    .where(eq(accessEntitlements.id, id))
    .returning();
  assert.ok(result);
  return result;
}

const hasPostgresCode =
  (code: string) =>
  (error: unknown): boolean =>
    error instanceof Error &&
    error.cause instanceof postgres.PostgresError &&
    error.cause.code === code;

test("a new payment right copies purchase metadata, returns DB defaults and preserves other rows", async () => {
  await withFixture(async (fixture) => {
    const before = await snapshot(fixture);
    const result = await persist(fixture.purchaseId);
    assert.ok(Number.isFinite(result.createdAt.getTime()));
    assert.match(result.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(result, {
      id: result.id,
      purchaseId: fixture.purchaseId,
      customerId: fixture.customerId,
      productId: fixture.productId,
      offerId: fixture.offerId,
      accessKey: "inspiration-hub",
      accessWorkflow: null,
      deliveryChannel: "telegram",
      status: "pending",
      startsAt: PAID_AT,
      expiresAt: EXPIRES_AT,
      periodStartMode: "payment",
      paidDurationDays: 56,
      startsAfterEntitlementId: null,
      revokedAt: null,
      revokedReason: null,
      externalTargetType: "telegram_chat",
      telegramChatId: null,
      telegramUserId: OWNER_ID,
      telegramUsername: null,
      currentTokenId: null,
      sourceKind: "standalone_hub",
      createdAt: result.createdAt,
      updatedAt: WRITTEN_AT,
    });
    const after = await snapshot(fixture);
    assert.deepEqual(after.purchases, before.purchases);
    assert.deepEqual(
      after.entitlements.filter((row) => row.id !== result.id),
      before.entitlements,
    );
    assert.deepEqual(
      after.entitlements.find((row) => row.id === result.id),
      result,
    );
    const purchase = after.purchases.find((row) => row.id === fixture.purchaseId);
    assert.ok(purchase);
    assert.deepEqual(
      buildHubPeriodPredecessor({
        telegramUserId: OWNER_ID,
        node: { purchase, entitlement: result },
        cohort: null,
      }),
      { entitlementId: result.id, purchaseId: fixture.purchaseId, expiresAt: EXPIRES_AT },
    );
  });
});

for (const identity of [
  { name: "both identities unknown", purchase: null, entitlement: null, valid: true },
  {
    name: "unbound entitlement and known buyer",
    purchase: OWNER_ID,
    entitlement: null,
    valid: true,
  },
  { name: "matching identities", purchase: OWNER_ID, entitlement: OWNER_ID, valid: true },
  {
    name: "different identities",
    purchase: OWNER_ID,
    entitlement: OTHER_OWNER_ID,
    valid: false,
  },
  {
    name: "bound entitlement without a known buyer",
    purchase: null,
    entitlement: OWNER_ID,
    valid: false,
  },
]) {
  test(`payment replay handles ${identity.name}`, async () => {
    await withFixture(async (fixture) => {
      const created = await persist(fixture.purchaseId);
      const stored = await updateEntitlement(created.id, {
        telegramUserId: identity.entitlement,
      });
      const before = await snapshot(fixture);
      if (identity.valid)
        assert.deepEqual(await persist(fixture.purchaseId, REPLAYED_AT), stored);
      else
        await assert.rejects(persist(fixture.purchaseId, REPLAYED_AT), {
          message: CONFLICT,
        });
      assert.deepEqual(await snapshot(fixture), before);
    }, identity.purchase);
  });
}

for (const status of [
  "pending",
  "token_issued",
  "activated",
  "expired",
  "left_channel",
  "revoked",
] as const) {
  test(`payment replay preserves the complete ${status} right without UPDATE`, async () => {
    await withFixture(async (fixture) => {
      const created = await persist(fixture.purchaseId);
      const stored = await updateEntitlement(created.id, {
        status,
        currentTokenId: `existing_token_${created.id}`,
        telegramUsername: "existing_member",
        telegramChatId: fixture.chatId,
        accessWorkflow: "existing-workflow",
        customerId: null,
        productId: null,
        offerId: null,
        updatedAt: CREATED_AT,
        revokedAt: status === "revoked" ? REPLAYED_AT : null,
        revokedReason: status === "revoked" ? "manual_revoke" : null,
      });
      const before = await snapshot(fixture);
      const queries: string[] = [];
      const recorded = drizzle(client, {
        schema,
        logger: { logQuery: (query) => queries.push(query) },
      });
      assert.deepEqual(await persist(fixture.purchaseId, REPLAYED_AT, recorded), stored);
      assert.equal(
        queries.some((query) => /^update\s/i.test(query)),
        false,
      );
      assert.deepEqual(await snapshot(fixture), before);
    });
  });
}

const incompatiblePeriods: {
  name: string;
  values: (fixture: Fixture) => Partial<typeof accessEntitlements.$inferInsert>;
}[] = [
  {
    name: "legacy classification",
    values: () => ({ sourceKind: null, periodStartMode: null, paidDurationDays: null }),
  },
  {
    name: "Online classification",
    values: () => ({
      sourceKind: "online_group",
      periodStartMode: null,
      paidDurationDays: null,
    }),
  },
  {
    name: "missing paid-period metadata",
    values: () => ({ periodStartMode: null, paidDurationDays: null }),
  },
  {
    name: "a resolved dependent period",
    values: (fixture) => ({
      periodStartMode: "after_entitlement",
      startsAfterEntitlementId: fixture.predecessorId,
    }),
  },
  {
    name: "a waiting dependent period",
    values: (fixture) => ({
      periodStartMode: "after_entitlement",
      startsAfterEntitlementId: fixture.predecessorId,
      startsAt: null,
      expiresAt: null,
    }),
  },
  {
    name: "a changed start",
    values: () => ({ startsAt: new Date(PAID_AT.getTime() + 1) }),
  },
  {
    name: "a changed end",
    values: () => ({ expiresAt: new Date(EXPIRES_AT.getTime() + 1) }),
  },
];
for (const incompatible of incompatiblePeriods) {
  test(`payment replay rejects ${incompatible.name} without repairing it`, async () => {
    await withFixture(async (fixture) => {
      const created = await persist(fixture.purchaseId);
      await updateEntitlement(created.id, incompatible.values(fixture));
      const before = await snapshot(fixture);
      await assert.rejects(persist(fixture.purchaseId), { message: CONFLICT });
      assert.deepEqual(await snapshot(fixture), before);
    });
  });
}

for (const invalid of ["failed payment", "missing paidAt", "Online purchase"]) {
  test(`a ${invalid} is rejected by R before entitlement SQL`, async () => {
    await withFixture(async (fixture) => {
      await db
        .update(purchases)
        .set(
          invalid === "failed payment"
            ? { outcome: "failed" }
            : invalid === "missing paidAt"
              ? { succeededAt: null }
              : { onlineGroupCohortId: fixture.cohortId },
        )
        .where(eq(purchases.id, fixture.purchaseId));
      const before = await snapshot(fixture);
      const queries: string[] = [];
      const recorded = drizzle(client, {
        schema,
        logger: { logQuery: (query) => queries.push(query) },
      });
      await assert.rejects(persist(fixture.purchaseId, WRITTEN_AT, recorded), {
        message: "hub_payment_period_invalid",
      });
      assert.equal(
        queries.some((query) => query.includes('"access_entitlements"')),
        false,
      );
      assert.deepEqual(await snapshot(fixture), before);
    });
  });
}

test("distinct purchases get distinct rights while one purchase keeps one right", async () => {
  await withFixture(async (fixture) => {
    const first = await persist(fixture.purchaseId);
    const second = await persist(fixture.otherPurchaseId);
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await persist(fixture.purchaseId, REPLAYED_AT), first);
    assert.deepEqual(await persist(fixture.otherPurchaseId, REPLAYED_AT), second);
  });
});

test("a caller rollback removes the inserted right and preserves the purchase", async () => {
  await withFixture(async (fixture) => {
    const before = await snapshot(fixture);
    const rollback = new Error("rollback_payment_period_test");
    await assert.rejects(
      db.transaction(async (tx) => {
        const created = await ensure(tx, fixture.purchaseId);
        assert.deepEqual(created.startsAt, PAID_AT);
        throw rollback;
      }),
      (error: unknown) => error === rollback,
    );
    assert.deepEqual(await snapshot(fixture), before);
  });
});

test("a replay whose stored row disappears raises a write conflict and rolls back deletion", async () => {
  await withFixture(async (fixture) => {
    await persist(fixture.purchaseId);
    const before = await snapshot(fixture);
    await assert.rejects(
      db.transaction(async (tx) => {
        // Test DDL is rolled back even if the writer unexpectedly succeeds.
        await tx.execute(
          sql`SELECT set_config('dance_course_test.payment_purchase', ${fixture.purchaseId}, true)`,
        );
        await tx.execute(sql`
        CREATE FUNCTION pg_temp.hide_payment_period_replay() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          DELETE FROM access_entitlements
          WHERE purchase_id::text = current_setting('dance_course_test.payment_purchase')
            AND access_key = 'inspiration-hub';
          RETURN NULL;
        END;
        $$
      `);
        await tx.execute(sql`
        CREATE TRIGGER hide_payment_period_replay AFTER INSERT ON access_entitlements
        FOR EACH STATEMENT EXECUTE FUNCTION pg_temp.hide_payment_period_replay()
      `);
        await ensure(tx, fixture.purchaseId);
        throw new Error("payment_writer_unexpectedly_succeeded");
      }),
      { message: "hub_payment_period_write_conflict" },
    );
    assert.deepEqual(await snapshot(fixture), before);
  });
});

test("the explicit conflict target preserves an unrelated real unique-constraint cause", async () => {
  await withFixture(async (fixture) => {
    const before = await snapshot(fixture);
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('dance_course_test.taken_entitlement', ${fixture.predecessorId}, true)`,
        );
        await tx.execute(sql`
        CREATE FUNCTION pg_temp.collide_payment_period_id() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          NEW.id := current_setting('dance_course_test.taken_entitlement')::uuid;
          RETURN NEW;
        END;
        $$
      `);
        await tx.execute(sql`
        CREATE TRIGGER collide_payment_period_id BEFORE INSERT ON access_entitlements
        FOR EACH ROW EXECUTE FUNCTION pg_temp.collide_payment_period_id()
      `);
        await ensure(tx, fixture.purchaseId);
        throw new Error("payment_writer_unexpectedly_succeeded");
      }),
      (error: unknown) =>
        hasPostgresCode("23505")(error) &&
        error instanceof Error &&
        error.cause instanceof postgres.PostgresError &&
        error.cause.constraint_name === "access_entitlements_pkey",
    );
    assert.deepEqual(await snapshot(fixture), before);
  });
});

type BlockedOperation<T> = {
  hold: (tx: DatabaseTransaction) => Promise<unknown>;
  run: (tx: DatabaseTransaction) => Promise<T>;
  change?: (tx: DatabaseTransaction) => Promise<unknown>;
  rollbackHolder?: boolean;
};

async function runBlocked<T>(options: BlockedOperation<T>): Promise<T> {
  const holderReady = Promise.withResolvers<number>();
  const operationReady = Promise.withResolvers<number>();
  const releaseHolder = Promise.withResolvers<void>();
  const rollback = new Error("rollback_payment_period_holder");
  const getPid = async (tx: DatabaseTransaction) => {
    const [row] = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
    assert.ok(row);
    return row.pid;
  };
  const holder = db.transaction(async (tx) => {
    const pid = await getPid(tx);
    await options.hold(tx);
    holderReady.resolve(pid);
    await releaseHolder.promise;
    await options.change?.(tx);
    if (options.rollbackHolder) throw rollback;
  });
  const operation = db.transaction(async (tx) => {
    await holderReady.promise;
    operationReady.resolve(await getPid(tx));
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
  } finally {
    releaseHolder.resolve();
    await outcomes;
  }
  const [held, operated] = await outcomes;
  if (options.rollbackHolder) {
    assert.equal(held.status, "rejected");
    if (held.status === "rejected") assert.strictEqual(held.reason, rollback);
  } else if (held.status === "rejected") throw held.reason;
  if (operated.status === "rejected") throw operated.reason;
  return operated.value;
}

for (const owner of [null, OWNER_ID]) {
  for (const rollbackHolder of [false, true]) {
    test(
      `concurrent ${owner === null ? "unbound" : "known-owner"} creation waits for ${rollbackHolder ? "rollback" : "commit"}`,
      CONCURRENT_TEST,
      async () => {
        await withFixture(async (fixture) => {
          let firstId: string | undefined;
          const result = await runBlocked({
            hold: async (tx) => {
              firstId = (await ensure(tx, fixture.purchaseId)).id;
            },
            run: (tx) => ensure(tx, fixture.purchaseId, REPLAYED_AT),
            rollbackHolder,
          });
          assert.ok(firstId);
          if (rollbackHolder) assert.notEqual(result.id, firstId);
          else assert.equal(result.id, firstId);
          assert.deepEqual(result.updatedAt, rollbackHolder ? REPLAYED_AT : WRITTEN_AT);
          const rights = (await snapshot(fixture)).entitlements.filter(
            (row) => row.accessKey === "inspiration-hub",
          );
          assert.deepEqual(rights, [result]);
        }, owner);
      },
    );
  }
}

for (const rollbackHolder of [false, true]) {
  test(
    `a replay retains the entitlement row lock until outer ${rollbackHolder ? "rollback" : "commit"}`,
    CONCURRENT_TEST,
    async () => {
      await withFixture(async (fixture) => {
        const created = await persist(fixture.purchaseId);
        const rows = await runBlocked({
          hold: (tx) => ensure(tx, fixture.purchaseId, REPLAYED_AT),
          // Deliberately bypass the owner/purchase protocol to probe the row lock itself.
          run: (tx) =>
            tx
              .select()
              .from(accessEntitlements)
              .where(eq(accessEntitlements.id, created.id))
              .for("update"),
          rollbackHolder,
        });
        assert.deepEqual(rows, [created]);
      });
    },
  );
}

for (const changed of ["revocation", "expiry", "owner"]) {
  test(
    `a replay waiting on the entitlement observes committed ${changed}`,
    CONCURRENT_TEST,
    async () => {
      await withFixture(async (fixture) => {
        const created = await persist(fixture.purchaseId);
        const operation = () =>
          runBlocked({
            // Simulate an existing delivery writer that locks only the entitlement.
            hold: (tx) =>
              tx
                .select()
                .from(accessEntitlements)
                .where(eq(accessEntitlements.id, created.id))
                .for("update"),
            change: (tx) =>
              tx
                .update(accessEntitlements)
                .set(
                  changed === "revocation"
                    ? {
                        status: "revoked",
                        revokedAt: REPLAYED_AT,
                        revokedReason: "manual_revoke",
                        updatedAt: REPLAYED_AT,
                      }
                    : changed === "expiry"
                      ? { expiresAt: new Date(EXPIRES_AT.getTime() + 1) }
                      : { telegramUserId: OTHER_OWNER_ID },
                )
                .where(eq(accessEntitlements.id, created.id)),
            run: (tx) => ensure(tx, fixture.purchaseId, REPLAYED_AT),
          });
        if (changed === "revocation") {
          const result = await operation();
          assert.deepEqual(result, {
            ...created,
            status: "revoked",
            revokedAt: REPLAYED_AT,
            revokedReason: "manual_revoke",
            updatedAt: REPLAYED_AT,
          });
        } else {
          await assert.rejects(operation(), { message: CONFLICT });
        }
        const [stored] = await db
          .select()
          .from(accessEntitlements)
          .where(eq(accessEntitlements.id, created.id));
        assert.ok(stored);
        if (changed === "revocation") assert.equal(stored.status, "revoked");
        if (changed === "expiry")
          assert.deepEqual(stored.expiresAt, new Date(EXPIRES_AT.getTime() + 1));
        if (changed === "owner") assert.equal(stored.telegramUserId, OTHER_OWNER_ID);
      });
    },
  );
}
