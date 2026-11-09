import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  type HubPeriodNodeSnapshot,
  loadHubPeriodNodesForUpdate,
} from "@/db/hub-period-nodes";
import * as schema from "@/db/schema";
import { accessEntitlements, purchases } from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";

import { waitForPostgresBlock } from "../helpers/postgres-locks";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), {
  connect_timeout: 5,
  max: 4,
  prepare: false,
});
const db = drizzle(client, { schema });

after(async () => {
  await client.end();
});

const CREATED_AT = new Date("2026-10-01T08:00:00.000Z");
const CHANGED_AT = new Date("2026-11-01T12:00:00.000Z");
const ENDS_AT = new Date("2026-11-15T23:00:00.000Z");
const CONFLICT = "hub_period_chain_read_conflict";
const CONCURRENT_TEST = { timeout: 15000 };

type NodeFixture = {
  lowPurchaseId: string;
  highPurchaseId: string;
  sparePurchaseId: string;
  mainId: string;
  standaloneId: string;
  hubId: string;
};

const seedFixture = async (tx: DatabaseTransaction): Promise<NodeFixture> => {
  const [lowPurchaseId, highPurchaseId, sparePurchaseId] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ].sort();
  const [mainId, standaloneId, hubId] = [randomUUID(), randomUUID(), randomUUID()].sort();
  const fixture = {
    lowPurchaseId,
    highPurchaseId,
    sparePurchaseId,
    mainId,
    standaloneId,
    hubId,
  };

  await tx.insert(purchases).values([
    {
      id: lowPurchaseId,
      paymentIntentId: `pi_hub_nodes_pending_${lowPurchaseId}`,
      amountMinor: 4000,
      currency: "eur",
      stripeStatus: "processing",
      outcome: "processing",
      customerEmailSnapshot: "pending@example.test",
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    {
      id: highPurchaseId,
      paymentIntentId: `pi_hub_nodes_online_${highPurchaseId}`,
      amountMinor: 9000,
      currency: "eur",
      stripeStatus: "succeeded",
      outcome: "succeeded",
      telegramUserId: "123456789",
      succeededAt: CREATED_AT,
      customerEmailSnapshot: "online@example.test",
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    {
      id: sparePurchaseId,
      paymentIntentId: `pi_hub_nodes_spare_${sparePurchaseId}`,
      amountMinor: 4000,
      currency: "eur",
      stripeStatus: "succeeded",
      outcome: "succeeded",
      telegramUserId: "987654321",
      succeededAt: CREATED_AT,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  ]);
  // Entitlement order deliberately differs from purchase order.
  await tx.insert(accessEntitlements).values({
    id: mainId,
    purchaseId: highPurchaseId,
    accessKey: "primary",
    sourceKind: "online_group",
    status: "activated",
    telegramUserId: "123456789",
    startsAt: CREATED_AT,
    expiresAt: ENDS_AT,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await tx.insert(accessEntitlements).values([
    {
      id: standaloneId,
      purchaseId: lowPurchaseId,
      accessKey: "inspiration-hub",
      sourceKind: "standalone_hub",
      periodStartMode: "after_entitlement",
      paidDurationDays: 56,
      startsAfterEntitlementId: mainId,
      status: "pending",
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    {
      id: hubId,
      purchaseId: highPurchaseId,
      accessKey: "inspiration-hub",
      sourceKind: "online_group",
      status: "revoked",
      revokedAt: CREATED_AT,
      revokedReason: "Existing revoked Hub grant",
      expiresAt: ENDS_AT,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  ]);
  return fixture;
};

const withFixture = async (
  run: (fixture: NodeFixture) => Promise<void>,
): Promise<void> => {
  // Real committed rows are necessary for independent sessions and deletions.
  const fixture = await db.transaction(seedFixture);
  try {
    await run(fixture);
  } finally {
    await db.transaction(async (tx) => {
      for (const id of [fixture.hubId, fixture.standaloneId, fixture.mainId]) {
        await tx.delete(accessEntitlements).where(eq(accessEntitlements.id, id));
      }
      await tx
        .delete(purchases)
        .where(
          inArray(purchases.id, [
            fixture.lowPurchaseId,
            fixture.highPurchaseId,
            fixture.sparePurchaseId,
          ]),
        );
    });
  }
};

const readSnapshot = async (fixture: NodeFixture) => ({
  entitlements: await db
    .select()
    .from(accessEntitlements)
    .where(
      inArray(accessEntitlements.id, [
        fixture.mainId,
        fixture.standaloneId,
        fixture.hubId,
      ]),
    )
    .orderBy(asc(accessEntitlements.id)),
  purchases: await db
    .select()
    .from(purchases)
    .where(
      inArray(purchases.id, [
        fixture.lowPurchaseId,
        fixture.highPurchaseId,
        fixture.sparePurchaseId,
      ]),
    )
    .orderBy(asc(purchases.id)),
});

const loadNodes = (ids: readonly string[]) =>
  db.transaction((tx) => loadHubPeriodNodesForUpdate(tx, ids));

const fulfilledValue = <T>(outcome: PromiseSettledResult<T>): T => {
  if (outcome.status === "rejected") throw outcome.reason;
  return outcome.value;
};

const assertReadConflict = (outcome: PromiseSettledResult<HubPeriodNodeSnapshot[]>) => {
  if (outcome.status === "fulfilled")
    assert.fail("Expected a read conflict, received a snapshot.");
  assert.ok(outcome.reason instanceof Error);
  assert.equal(outcome.reason.message, CONFLICT);
};

const hasPostgresCode =
  (code: string) =>
  (error: unknown): boolean =>
    error instanceof Error &&
    error.cause instanceof postgres.PostgresError &&
    error.cause.code === code;

const prepareObservedTransaction = async (tx: DatabaseTransaction): Promise<number> => {
  await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
  const [row] = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
  assert.ok(row);
  return row.pid;
};

const lockPurchase = async (tx: DatabaseTransaction, id: string) => {
  const rows = await tx
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.id, id))
    .for("update");
  assert.equal(rows.length, 1);
};

const lockEntitlement = async (tx: DatabaseTransaction, id: string) => {
  const rows = await tx
    .select({ id: accessEntitlements.id })
    .from(accessEntitlements)
    .where(eq(accessEntitlements.id, id))
    .for("update");
  assert.equal(rows.length, 1);
};

const runBlockedLoad = async (
  ids: readonly string[],
  acquireLock: (tx: DatabaseTransaction) => Promise<void>,
  whileBlocked: (tx: DatabaseTransaction) => Promise<void>,
): Promise<PromiseSettledResult<HubPeriodNodeSnapshot[]>> => {
  const holderReady = Promise.withResolvers<number>();
  const loaderReady = Promise.withResolvers<number>();
  const releaseHolder = Promise.withResolvers<void>();

  const holder = db.transaction(async (tx) => {
    const pid = await prepareObservedTransaction(tx);
    await acquireLock(tx);
    holderReady.resolve(pid);
    await releaseHolder.promise;
    await whileBlocked(tx);
  });
  const loader = db.transaction(async (tx) => {
    await holderReady.promise;
    loaderReady.resolve(await prepareObservedTransaction(tx));
    return loadHubPeriodNodesForUpdate(tx, ids);
  });
  const outcomes = Promise.allSettled([holder, loader]);
  void holder.catch(holderReady.reject);
  void loader.catch(loaderReady.reject);

  try {
    const [holderPid, loaderPid] = await Promise.all([
      holderReady.promise,
      loaderReady.promise,
    ]);
    await waitForPostgresBlock(client, loaderPid, holderPid);
  } finally {
    releaseHolder.resolve();
    await outcomes;
  }
  const [holderOutcome, loaderOutcome] = await outcomes;
  fulfilledValue(holderOutcome);
  return loaderOutcome;
};

test("an empty request returns a fresh empty array without SQL", async () => {
  const queries: string[] = [];
  const recordedDb = drizzle(client, {
    schema,
    logger: { logQuery: (query) => queries.push(query) },
  });
  const ids = Object.freeze<string[]>([]);
  const nodes = await recordedDb.transaction((tx) =>
    loadHubPeriodNodesForUpdate(tx, ids),
  );
  assert.deepEqual(nodes, []);
  assert.notStrictEqual(nodes, ids);
  assert.deepEqual(queries, []);
});

test("a batch returns full ordered pairs in three queries, deduplicating requests and shared purchases", async () => {
  await withFixture(async (fixture) => {
    const before = await readSnapshot(fixture);
    const ids = Object.freeze([
      fixture.hubId,
      fixture.standaloneId,
      fixture.mainId,
      fixture.hubId,
    ]);
    const queries: string[] = [];
    const recordedDb = drizzle(client, {
      schema,
      logger: { logQuery: (query) => queries.push(query) },
    });
    const nodes = await recordedDb.transaction((tx) =>
      loadHubPeriodNodesForUpdate(tx, ids),
    );

    assert.equal(queries.length, 3);
    assert.deepEqual(
      nodes.map((node) => node.entitlement.id),
      [fixture.mainId, fixture.standaloneId, fixture.hubId],
    );
    assert.deepEqual(
      nodes,
      before.entitlements.map((entitlement) => {
        const purchase = before.purchases.find(
          (row) => row.id === entitlement.purchaseId,
        );
        assert.ok(purchase);
        return { entitlement, purchase };
      }),
    );
    assert.equal(
      nodes.filter((node) => node.purchase.id === fixture.highPurchaseId).length,
      2,
    );
    assert.equal(nodes[1].purchase.outcome, "processing");
    assert.equal(nodes[1].purchase.succeededAt, null);
    assert.equal(nodes[2].entitlement.status, "revoked");
    assert.equal(nodes[0].entitlement.periodStartMode, null);
    assert.deepEqual(ids, [
      fixture.hubId,
      fixture.standaloneId,
      fixture.mainId,
      fixture.hubId,
    ]);
    assert.deepEqual(await readSnapshot(fixture), before);
  });
});

test("a subset loads only requested rights without adding their predecessors", async () => {
  await withFixture(async (fixture) => {
    const nodes = await loadNodes([fixture.standaloneId]);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].entitlement.id, fixture.standaloneId);
    assert.equal(nodes[0].purchase.id, fixture.lowPurchaseId);
    assert.equal(nodes[0].entitlement.startsAfterEntitlementId, fixture.mainId);
  });
});

for (const mixed of [false, true]) {
  test(`a ${mixed ? "partly" : "wholly"} missing request rejects instead of returning partial data`, async () => {
    await withFixture(async (fixture) => {
      const before = await readSnapshot(fixture);
      const ids = mixed ? [fixture.mainId, randomUUID()] : [randomUUID()];
      await assert.rejects(loadNodes(ids), { name: "Error", message: CONFLICT });
      assert.deepEqual(await readSnapshot(fixture), before);
    });
  });
}

test("a SQL failure preserves its database cause instead of becoming a read conflict", async () => {
  // Deliberately violate the trusted-ID precondition to exercise an actual SQL error.
  await assert.rejects(loadNodes(["invalid-uuid"]), hasPostgresCode("22P02"));
});

test(
  "a link moved to an unrequested purchase while the purchase lock is pending conflicts",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      const outcome = await runBlockedLoad(
        [fixture.standaloneId],
        (tx) => lockPurchase(tx, fixture.lowPurchaseId),
        async (tx) => {
          await tx
            .update(accessEntitlements)
            .set({ purchaseId: fixture.sparePurchaseId })
            .where(eq(accessEntitlements.id, fixture.standaloneId));
        },
      );
      assertReadConflict(outcome);
    });
  },
);

test(
  "a changed link conflicts even when its new purchase is already in the requested set",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      const outcome = await runBlockedLoad(
        [fixture.mainId, fixture.standaloneId],
        (tx) => lockPurchase(tx, fixture.lowPurchaseId),
        async (tx) => {
          await tx
            .update(accessEntitlements)
            .set({ purchaseId: fixture.lowPurchaseId })
            .where(eq(accessEntitlements.id, fixture.mainId));
        },
      );
      assertReadConflict(outcome);
    });
  },
);

test(
  "a purchase deleted after reference discovery produces a read conflict",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      const outcome = await runBlockedLoad(
        [fixture.standaloneId],
        (tx) => lockPurchase(tx, fixture.lowPurchaseId),
        async (tx) => {
          await tx.delete(purchases).where(eq(purchases.id, fixture.lowPurchaseId));
        },
      );
      assertReadConflict(outcome);
    });
  },
);

test(
  "a right deleted while entitlement locks are pending produces a read conflict",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      const outcome = await runBlockedLoad(
        [fixture.mainId, fixture.hubId],
        (tx) => lockEntitlement(tx, fixture.mainId),
        async (tx) => {
          await tx
            .delete(accessEntitlements)
            .where(eq(accessEntitlements.id, fixture.hubId));
        },
      );
      assertReadConflict(outcome);
    });
  },
);

test(
  "a link changed after purchases are locked is rejected at the final entitlement read",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      const outcome = await runBlockedLoad(
        [fixture.mainId],
        (tx) => lockEntitlement(tx, fixture.mainId),
        async (tx) => {
          await tx
            .update(accessEntitlements)
            .set({ purchaseId: fixture.sparePurchaseId })
            .where(eq(accessEntitlements.id, fixture.mainId));
        },
      );
      assertReadConflict(outcome);
    });
  },
);

test(
  "a waited-on purchase is returned with its current owner and payment fields",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      const outcome = await runBlockedLoad(
        [fixture.mainId],
        (tx) => lockPurchase(tx, fixture.highPurchaseId),
        async (tx) => {
          await tx
            .update(purchases)
            .set({
              outcome: "failed",
              telegramUserId: "987654321",
              succeededAt: null,
              updatedAt: CHANGED_AT,
            })
            .where(eq(purchases.id, fixture.highPurchaseId));
        },
      );
      const [node] = fulfilledValue(outcome);
      assert.ok(node);
      assert.equal(node.purchase.outcome, "failed");
      assert.equal(node.purchase.telegramUserId, "987654321");
      assert.equal(node.purchase.succeededAt, null);
      assert.deepEqual(node.purchase.updatedAt, CHANGED_AT);
    });
  },
);

test(
  "a waited-on entitlement is returned with its current revocation and dates",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      const outcome = await runBlockedLoad(
        [fixture.mainId],
        (tx) => lockEntitlement(tx, fixture.mainId),
        async (tx) => {
          await tx
            .update(accessEntitlements)
            .set({
              status: "revoked",
              revokedAt: CHANGED_AT,
              expiresAt: null,
              updatedAt: CHANGED_AT,
            })
            .where(eq(accessEntitlements.id, fixture.mainId));
        },
      );
      const [node] = fulfilledValue(outcome);
      assert.ok(node);
      assert.equal(node.entitlement.status, "revoked");
      assert.deepEqual(node.entitlement.revokedAt, CHANGED_AT);
      assert.equal(node.entitlement.expiresAt, null);
      assert.deepEqual(node.entitlement.updatedAt, CHANGED_AT);
    });
  },
);

for (const target of ["purchase", "entitlement"] as const) {
  test(
    `${target} stays locked after loader return until caller ${target === "purchase" ? "commits" : "rolls back"}`,
    CONCURRENT_TEST,
    async () => {
      await withFixture(async (fixture) => {
        const rollback = new Error("rollback_hub_node_reader");
        const loaderReady = Promise.withResolvers<number>();
        const writerReady = Promise.withResolvers<number>();
        const releaseLoader = Promise.withResolvers<void>();

        const loader = db.transaction(async (tx) => {
          const pid = await prepareObservedTransaction(tx);
          await loadHubPeriodNodesForUpdate(tx, [fixture.mainId]);
          loaderReady.resolve(pid);
          await releaseLoader.promise;
          if (target === "entitlement") throw rollback;
        });
        const writer = db.transaction(async (tx) => {
          await loaderReady.promise;
          writerReady.resolve(await prepareObservedTransaction(tx));
          if (target === "purchase") {
            await tx
              .update(purchases)
              .set({ customerFullNameSnapshot: "Changed after release" })
              .where(eq(purchases.id, fixture.highPurchaseId));
          } else {
            await tx
              .update(accessEntitlements)
              .set({ revokedReason: "Changed after release" })
              .where(eq(accessEntitlements.id, fixture.mainId));
          }
        });
        const outcomes = Promise.allSettled([loader, writer]);
        void loader.catch(loaderReady.reject);
        void writer.catch(writerReady.reject);

        try {
          const [loaderPid, writerPid] = await Promise.all([
            loaderReady.promise,
            writerReady.promise,
          ]);
          await waitForPostgresBlock(client, writerPid, loaderPid);
          // Ordinary readers remain usable while writes wait on these row locks.
          const rows = await db
            .select({ id: accessEntitlements.id })
            .from(accessEntitlements)
            .where(eq(accessEntitlements.id, fixture.mainId));
          assert.deepEqual(rows, [{ id: fixture.mainId }]);
        } finally {
          releaseLoader.resolve();
          await outcomes;
        }
        const [loaderOutcome, writerOutcome] = await outcomes;
        if (target === "entitlement") {
          assert.equal(loaderOutcome.status, "rejected");
          if (loaderOutcome.status === "rejected")
            assert.strictEqual(loaderOutcome.reason, rollback);
        } else {
          fulfilledValue(loaderOutcome);
        }
        fulfilledValue(writerOutcome);
        const snapshot = await readSnapshot(fixture);
        if (target === "purchase") {
          assert.equal(
            snapshot.purchases.find((row) => row.id === fixture.highPurchaseId)
              ?.customerFullNameSnapshot,
            "Changed after release",
          );
        } else {
          assert.equal(
            snapshot.entitlements.find((row) => row.id === fixture.mainId)?.revokedReason,
            "Changed after release",
          );
        }
      });
    },
  );
}

test(
  "entitlements are locked by ID even when the request order is reversed",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      const outcome = await runBlockedLoad(
        [fixture.hubId, fixture.mainId],
        (tx) => lockEntitlement(tx, fixture.hubId),
        async () => {
          // The loader is waiting on the higher ID and must already own the lower one.
          await assert.rejects(
            db.transaction((tx) =>
              tx
                .select({ id: accessEntitlements.id })
                .from(accessEntitlements)
                .where(eq(accessEntitlements.id, fixture.mainId))
                .for("update", { noWait: true }),
            ),
            hasPostgresCode("55P03"),
          );
        },
      );
      assert.deepEqual(
        fulfilledValue(outcome).map((node) => node.entitlement.id),
        [fixture.mainId, fixture.hubId],
      );
    });
  },
);

test(
  "overlapping reversed requests lock lower purchase IDs first and both complete",
  CONCURRENT_TEST,
  async () => {
    await withFixture(async (fixture) => {
      const holderReady = Promise.withResolvers<number>();
      const firstReady = Promise.withResolvers<number>();
      const releaseHolder = Promise.withResolvers<void>();
      const holder = db.transaction(async (tx) => {
        const pid = await prepareObservedTransaction(tx);
        await lockPurchase(tx, fixture.highPurchaseId);
        holderReady.resolve(pid);
        await releaseHolder.promise;
      });
      const first = db.transaction(async (tx) => {
        await holderReady.promise;
        firstReady.resolve(await prepareObservedTransaction(tx));
        return loadHubPeriodNodesForUpdate(tx, [fixture.mainId, fixture.standaloneId]);
      });
      const outcomes = Promise.allSettled([holder, first]);
      void holder.catch(holderReady.reject);
      void first.catch(firstReady.reject);
      let secondOutcomes: Promise<PromiseSettledResult<HubPeriodNodeSnapshot[]>[]> =
        Promise.resolve([]);

      try {
        const [holderPid, firstPid] = await Promise.all([
          holderReady.promise,
          firstReady.promise,
        ]);
        await waitForPostgresBlock(client, firstPid, holderPid);
        // A queued waiter alone is not proof: NOWAIT proves the lower row is held.
        await assert.rejects(
          db.transaction((tx) =>
            tx
              .select({ id: purchases.id })
              .from(purchases)
              .where(eq(purchases.id, fixture.lowPurchaseId))
              .for("update", { noWait: true }),
          ),
          hasPostgresCode("55P03"),
        );

        const secondReady = Promise.withResolvers<number>();
        const second = db.transaction(async (tx) => {
          secondReady.resolve(await prepareObservedTransaction(tx));
          return loadHubPeriodNodesForUpdate(tx, [fixture.standaloneId, fixture.mainId]);
        });
        secondOutcomes = Promise.allSettled([second]);
        void second.catch(secondReady.reject);
        await waitForPostgresBlock(client, await secondReady.promise, firstPid);
      } finally {
        releaseHolder.resolve();
        await outcomes;
        await secondOutcomes;
      }
      const [holderOutcome, firstOutcome] = await outcomes;
      fulfilledValue(holderOutcome);
      const [secondOutcome] = await secondOutcomes;
      assert.ok(secondOutcome);
      const expectedIds = [fixture.mainId, fixture.standaloneId];
      assert.deepEqual(
        fulfilledValue(firstOutcome).map((node) => node.entitlement.id),
        expectedIds,
      );
      assert.deepEqual(
        fulfilledValue(secondOutcome).map((node) => node.entitlement.id),
        expectedIds,
      );
    });
  },
);
