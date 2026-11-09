import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  discoverHubPeriodChain,
  type HubPeriodChainReference,
} from "@/db/hub-period-chain-discovery";
import { loadHubPeriodNodesForUpdate } from "@/db/hub-period-nodes";
import * as schema from "@/db/schema";
import {
  accessEntitlements,
  onlineGroupCohorts,
  purchases,
  telegramChats,
} from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";

import { createTestTelegramUserIdPair } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), {
  connect_timeout: 5,
  max: 3,
  prepare: false,
});
const db = drizzle(client, { schema });

after(async () => {
  await client.end();
});

const [OWNER_ID, OTHER_OWNER_ID] = createTestTelegramUserIdPair();
const PAID_AT = new Date("2026-11-10T09:00:00.000Z");
const STARTS_AT = new Date("2026-11-15T23:00:00.000Z");
const EXPIRES_AT = new Date("2027-01-10T23:00:00.000Z");
const CONFLICT = "hub_period_chain_read_conflict";

type DiscoveryFixture = {
  cohortId: string;
  mainChatId: string;
  rootId: string;
  firstId: string;
  secondId: string;
  plusHubId: string;
  unrelatedId: string;
  rootPurchaseId: string;
  firstPurchaseId: string;
  secondPurchaseId: string;
  unrelatedPurchaseId: string;
};

function makePurchase(
  id: string,
  onlineGroupCohortId: string | null = null,
): typeof purchases.$inferInsert {
  return {
    id,
    paymentIntentId: `pi_hub_discovery_${id}`,
    amountMinor: 4000,
    currency: "eur",
    stripeStatus: "succeeded",
    outcome: "succeeded",
    telegramUserId: OWNER_ID,
    succeededAt: PAID_AT,
    customerEmailSnapshot: "discovery@example.test",
    onlineGroupCohortId,
  };
}

async function seedFixture(tx: DatabaseTransaction): Promise<DiscoveryFixture> {
  // Calendar order deliberately differs from UUID order: second, root, first.
  const [secondId, rootId, firstId] = [randomUUID(), randomUUID(), randomUUID()].sort();
  const fixture: DiscoveryFixture = {
    cohortId: randomUUID(),
    mainChatId: `hub_discovery_${randomUUID()}`,
    rootId,
    firstId,
    secondId,
    plusHubId: randomUUID(),
    unrelatedId: randomUUID(),
    rootPurchaseId: randomUUID(),
    firstPurchaseId: randomUUID(),
    secondPurchaseId: randomUUID(),
    unrelatedPurchaseId: randomUUID(),
  };

  await tx.insert(telegramChats).values({
    chatId: fixture.mainChatId,
    title: "Discovery Online chat",
    type: "supergroup",
  });
  await tx.insert(onlineGroupCohorts).values({
    id: fixture.cohortId,
    mainChatId: fixture.mainChatId,
    title: "Discovery cohort",
    startsAt: STARTS_AT,
  });
  await tx
    .insert(purchases)
    .values([
      makePurchase(fixture.rootPurchaseId, fixture.cohortId),
      makePurchase(fixture.firstPurchaseId),
      makePurchase(fixture.secondPurchaseId),
      makePurchase(fixture.unrelatedPurchaseId),
    ]);
  await tx.insert(accessEntitlements).values({
    id: fixture.rootId,
    purchaseId: fixture.rootPurchaseId,
    accessKey: "primary",
    sourceKind: "online_group",
    status: "activated",
    telegramUserId: OWNER_ID,
    telegramChatId: fixture.mainChatId,
    startsAt: STARTS_AT,
  });
  await tx.insert(accessEntitlements).values({
    id: fixture.firstId,
    purchaseId: fixture.firstPurchaseId,
    accessKey: "inspiration-hub",
    sourceKind: "standalone_hub",
    periodStartMode: "after_entitlement",
    paidDurationDays: 56,
    startsAfterEntitlementId: fixture.rootId,
  });
  await tx.insert(accessEntitlements).values([
    {
      id: fixture.secondId,
      purchaseId: fixture.secondPurchaseId,
      accessKey: "inspiration-hub",
      sourceKind: "standalone_hub",
      periodStartMode: "after_entitlement",
      paidDurationDays: 56,
      startsAfterEntitlementId: fixture.firstId,
    },
    {
      id: fixture.plusHubId,
      purchaseId: fixture.rootPurchaseId,
      accessKey: "inspiration-hub",
      sourceKind: "online_group",
    },
    {
      id: fixture.unrelatedId,
      purchaseId: fixture.unrelatedPurchaseId,
      accessKey: "inspiration-hub",
      sourceKind: "standalone_hub",
      periodStartMode: "payment",
      paidDurationDays: 56,
      startsAt: STARTS_AT,
      expiresAt: EXPIRES_AT,
      telegramUserId: OWNER_ID,
    },
  ]);
  return fixture;
}

function entitlementIds(fixture: DiscoveryFixture): string[] {
  return [
    fixture.rootId,
    fixture.firstId,
    fixture.secondId,
    fixture.plusHubId,
    fixture.unrelatedId,
  ];
}

function purchaseIds(fixture: DiscoveryFixture): string[] {
  return [
    fixture.rootPurchaseId,
    fixture.firstPurchaseId,
    fixture.secondPurchaseId,
    fixture.unrelatedPurchaseId,
  ];
}

async function withFixture(
  run: (fixture: DiscoveryFixture) => Promise<void>,
): Promise<void> {
  const fixture = await db.transaction(seedFixture);
  try {
    await run(fixture);
  } finally {
    await db.transaction(async (tx) => {
      // Clear dependencies first so cleanup also works for cyclic fixtures.
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
        .where(eq(onlineGroupCohorts.id, fixture.cohortId));
      await tx.delete(telegramChats).where(eq(telegramChats.chatId, fixture.mainChatId));
    });
  }
}

function expectedChain(fixture: DiscoveryFixture): HubPeriodChainReference[] {
  return [
    {
      id: fixture.rootId,
      purchaseId: fixture.rootPurchaseId,
      startsAfterEntitlementId: null,
      onlineGroupCohortId: fixture.cohortId,
    },
    {
      id: fixture.firstId,
      purchaseId: fixture.firstPurchaseId,
      startsAfterEntitlementId: fixture.rootId,
      onlineGroupCohortId: null,
    },
    {
      id: fixture.secondId,
      purchaseId: fixture.secondPurchaseId,
      startsAfterEntitlementId: fixture.firstId,
      onlineGroupCohortId: null,
    },
  ].sort((left, right) => left.id.localeCompare(right.id));
}

async function discover(entitlementId: string): Promise<HubPeriodChainReference[]> {
  return db.transaction(async (tx) => {
    // Also bounds an accidentally nonterminating recursive query on the server.
    await tx.execute(sql`SET LOCAL statement_timeout = '2s'`);
    return discoverHubPeriodChain(tx, entitlementId);
  });
}

async function readSnapshot(fixture: DiscoveryFixture) {
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
  };
}

test("an isolated payment right returns its exact fields and nullable cohort", async () => {
  await withFixture(async (fixture) => {
    assert.deepEqual(await discover(fixture.unrelatedId), [
      {
        id: fixture.unrelatedId,
        purchaseId: fixture.unrelatedPurchaseId,
        startsAfterEntitlementId: null,
        onlineGroupCohortId: null,
      },
    ]);
  });
});

for (const entry of ["rootId", "firstId", "secondId"] as const) {
  test(`entry at ${entry} finds both directions and sorts by ID rather than chain order`, async () => {
    await withFixture(async (fixture) => {
      assert.deepEqual(await discover(fixture[entry]), expectedChain(fixture));
    });
  });
}

test("an unlinked Plus Hub right does not inherit its purchase's main chain", async () => {
  await withFixture(async (fixture) => {
    assert.deepEqual(await discover(fixture.plusHubId), [
      {
        id: fixture.plusHubId,
        purchaseId: fixture.rootPurchaseId,
        startsAfterEntitlementId: null,
        onlineGroupCohortId: fixture.cohortId,
      },
    ]);
  });
});

test("discovery uses one parameterized statement and returns an ordinary array", async () => {
  await withFixture(async (fixture) => {
    const queries: { query: string; params: unknown[] }[] = [];
    const recordedDb = drizzle(client, {
      schema,
      logger: { logQuery: (query, params) => queries.push({ query, params }) },
    });
    const rows = await recordedDb.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '2s'`);
      queries.length = 0;
      return discoverHubPeriodChain(tx, fixture.firstId);
    });

    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0].params, [fixture.firstId]);
    assert.equal(queries[0].query.includes(fixture.firstId), false);
    assert.strictEqual(Object.getPrototypeOf(rows), Array.prototype);
    assert.deepEqual(rows, expectedChain(fixture));
  });
});

test("repeated discovery preserves every stored field and returns fresh results", async () => {
  await withFixture(async (fixture) => {
    const before = await readSnapshot(fixture);
    const first = await discover(fixture.firstId);
    const second = await discover(fixture.firstId);

    assert.deepEqual(second, first);
    assert.notStrictEqual(second, first);
    assert.notStrictEqual(second[0], first[0]);
    assert.deepEqual(await readSnapshot(fixture), before);
  });
});

type Mutation = {
  name: string;
  apply: (tx: DatabaseTransaction, fixture: DiscoveryFixture) => Promise<unknown>;
};

const mutations: Mutation[] = [
  {
    name: "a different Telegram owner",
    apply: async (tx, fixture) => {
      await tx
        .update(purchases)
        .set({ telegramUserId: OTHER_OWNER_ID })
        .where(eq(purchases.id, fixture.firstPurchaseId));
      await tx
        .update(accessEntitlements)
        .set({ telegramUserId: OTHER_OWNER_ID })
        .where(eq(accessEntitlements.id, fixture.firstId));
    },
  },
  {
    name: "an unverified purchase owner",
    apply: (tx, fixture) =>
      tx
        .update(purchases)
        .set({ telegramUserId: null })
        .where(eq(purchases.id, fixture.firstPurchaseId)),
  },
  {
    name: "a failed purchase",
    apply: (tx, fixture) =>
      tx
        .update(purchases)
        .set({ outcome: "failed", stripeStatus: "failed", succeededAt: null })
        .where(eq(purchases.id, fixture.firstPurchaseId)),
  },
  {
    name: "a missing canonical payment date",
    apply: (tx, fixture) =>
      tx
        .update(purchases)
        .set({ succeededAt: null })
        .where(eq(purchases.id, fixture.firstPurchaseId)),
  },
  {
    name: "a revoked right",
    apply: (tx, fixture) =>
      tx
        .update(accessEntitlements)
        .set({ status: "revoked", revokedAt: PAID_AT, revokedReason: "manual" })
        .where(eq(accessEntitlements.id, fixture.firstId)),
  },
  {
    name: "a legacy predecessor",
    apply: (tx, fixture) =>
      tx
        .update(accessEntitlements)
        .set({ sourceKind: null })
        .where(eq(accessEntitlements.id, fixture.rootId)),
  },
  {
    name: "an unexpected bridge predecessor",
    apply: (tx, fixture) =>
      tx
        .update(accessEntitlements)
        .set({ sourceKind: "hub_bridge", accessKey: "inspiration-hub-bridge" })
        .where(eq(accessEntitlements.id, fixture.rootId)),
  },
  {
    name: "an expired delivery status",
    apply: (tx, fixture) =>
      tx
        .update(accessEntitlements)
        .set({ status: "expired" })
        .where(eq(accessEntitlements.id, fixture.firstId)),
  },
  {
    name: "a left-channel delivery status",
    apply: (tx, fixture) =>
      tx
        .update(accessEntitlements)
        .set({ status: "left_channel" })
        .where(eq(accessEntitlements.id, fixture.firstId)),
  },
];

for (const mutation of mutations) {
  test(`the full chain remains visible with ${mutation.name}`, async () => {
    await withFixture(async (fixture) => {
      await db.transaction((tx) => mutation.apply(tx, fixture));
      assert.deepEqual(await discover(fixture.secondId), expectedChain(fixture));
    });
  });
}

test("a resolved descendant after a pending right is returned for later validation", async () => {
  await withFixture(async (fixture) => {
    await db
      .update(accessEntitlements)
      .set({ startsAt: STARTS_AT, expiresAt: EXPIRES_AT })
      .where(eq(accessEntitlements.id, fixture.secondId));

    assert.deepEqual(await discover(fixture.firstId), expectedChain(fixture));
  });
});

test("an inconsistent standalone purchase's cohort ID is returned without hiding the node", async () => {
  await withFixture(async (fixture) => {
    await db
      .update(purchases)
      .set({ onlineGroupCohortId: fixture.cohortId })
      .where(eq(purchases.id, fixture.firstPurchaseId));

    const expected = expectedChain(fixture).map((row) =>
      row.id === fixture.firstId
        ? { ...row, onlineGroupCohortId: fixture.cohortId }
        : row,
    );
    assert.deepEqual(await discover(fixture.secondId), expected);
  });
});

for (const length of [2, 3]) {
  test(
    `a ${length}-node cycle terminates and returns each node exactly once`,
    { timeout: 5000 },
    async () => {
      await withFixture(async (fixture) => {
        const tailId = length === 2 ? fixture.firstId : fixture.secondId;
        await db.transaction(async (tx) => {
          await tx
            .delete(accessEntitlements)
            .where(eq(accessEntitlements.id, fixture.plusHubId));
          if (length === 2) {
            await tx
              .delete(accessEntitlements)
              .where(eq(accessEntitlements.id, fixture.secondId));
          }
          await tx
            .update(accessEntitlements)
            .set({
              sourceKind: "standalone_hub",
              accessKey: "inspiration-hub",
              periodStartMode: "after_entitlement",
              paidDurationDays: 56,
              startsAfterEntitlementId: tailId,
              startsAt: null,
              expiresAt: null,
            })
            .where(eq(accessEntitlements.id, fixture.rootId));
        });

        const expected = expectedChain(fixture)
          .filter((row) => length === 3 || row.id !== fixture.secondId)
          .map((row) =>
            row.id === fixture.rootId
              ? { ...row, startsAfterEntitlementId: tailId }
              : row,
          );
        for (const id of [fixture.rootId, tailId]) {
          assert.deepEqual(await discover(id), expected);
        }
      });
    },
  );
}

test("an absent entry rejects instead of returning an empty set", async () => {
  await assert.rejects(discover(randomUUID()), { name: "Error", message: CONFLICT });
});

for (const id of ["invalid-uuid", "' OR TRUE; --"]) {
  test(`invalid input ${JSON.stringify(id)} preserves a real PostgreSQL error`, async () => {
    // Exercise the SQL failure boundary by violating the trusted UUID precondition.
    await assert.rejects(
      discover(id),
      (error: unknown) =>
        error instanceof Error &&
        error.cause instanceof postgres.PostgresError &&
        error.cause.code === "22P02",
    );
  });
}

test("discovery feeds the complete set to the locking loader in the same transaction", async () => {
  await withFixture(async (fixture) => {
    const nodes = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '2s'`);
      const references = await discoverHubPeriodChain(tx, fixture.firstId);
      return loadHubPeriodNodesForUpdate(
        tx,
        references.map((row) => row.id),
      );
    });

    assert.deepEqual(
      nodes.map(({ entitlement, purchase }) => ({
        id: entitlement.id,
        purchaseId: purchase.id,
        startsAfterEntitlementId: entitlement.startsAfterEntitlementId,
        onlineGroupCohortId: purchase.onlineGroupCohortId,
      })),
      expectedChain(fixture),
    );
    assert.ok(nodes.every((node) => node.purchase.telegramUserId === OWNER_ID));
    assert.ok(nodes.every((node) => node.purchase.succeededAt instanceof Date));
  });
});

test(
  "discovery holds no row locks while its caller's transaction stays open",
  { timeout: 5000 },
  async () => {
    await withFixture(async (fixture) => {
      await db.transaction(async (reader) => {
        await reader.execute(sql`SET LOCAL statement_timeout = '2s'`);
        assert.deepEqual(
          await discoverHubPeriodChain(reader, fixture.firstId),
          expectedChain(fixture),
        );

        // Independent connection must finish both writes before the reader commits.
        await db.transaction(async (writer) => {
          await writer.execute(sql`SET LOCAL lock_timeout = '1s'`);
          const changedPurchases = await writer
            .update(purchases)
            .set({ telegramUserId: OTHER_OWNER_ID })
            .where(inArray(purchases.id, purchaseIds(fixture)))
            .returning({ id: purchases.id });
          const changedEntitlements = await writer
            .update(accessEntitlements)
            .set({ telegramUserId: OTHER_OWNER_ID })
            .where(inArray(accessEntitlements.id, entitlementIds(fixture)))
            .returning({ id: accessEntitlements.id });
          assert.equal(changedPurchases.length, 4);
          assert.equal(changedEntitlements.length, 5);
        });
      });
    });
  },
);

test("a later discovery sees a newly attached period inside its caller's transaction", async () => {
  await withFixture(async (fixture) => {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '2s'`);
      assert.deepEqual(
        await discoverHubPeriodChain(tx, fixture.firstId),
        expectedChain(fixture),
      );
      await tx
        .update(accessEntitlements)
        .set({
          periodStartMode: "after_entitlement",
          startsAfterEntitlementId: fixture.secondId,
          startsAt: null,
          expiresAt: null,
        })
        .where(eq(accessEntitlements.id, fixture.unrelatedId));

      const expected = [
        ...expectedChain(fixture),
        {
          id: fixture.unrelatedId,
          purchaseId: fixture.unrelatedPurchaseId,
          startsAfterEntitlementId: fixture.secondId,
          onlineGroupCohortId: null,
        },
      ].sort((left, right) => left.id.localeCompare(right.id));
      assert.deepEqual(await discoverHubPeriodChain(tx, fixture.rootId), expected);
    });
  });
});
