import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  type ApplyPendingHubPeriodDatesCommand,
  applyPendingHubPeriodDatesInTransaction,
} from "@/db/hub-period-dates";
import * as schema from "@/db/schema";
import {
  accessEntitlements,
  onlineGroupCohorts,
  purchases,
  telegramChats,
} from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";

import { waitForPostgresBlock } from "../helpers/postgres-locks";
import { createTestTelegramUserIdPair } from "../helpers/telegram-user-id";
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

const [OWNER_ID, OTHER_OWNER_ID] = createTestTelegramUserIdPair();
const CREATED_AT = new Date("2026-11-10T09:00:00.000Z");
const STARTS_AT = new Date("2026-11-15T23:00:00.000Z");
const EXPIRES_AT = new Date("2027-01-10T23:00:00.000Z");
const SECOND_EXPIRES_AT = new Date("2027-03-07T23:00:00.000Z");
const WRITTEN_AT = new Date("2026-11-16T10:00:00.000Z");
const CONFLICT = "hub_period_chain_write_conflict";

type WriterFixture = {
  cohortId: string;
  mainChatId: string;
  hubChatId: string;
  parentPurchaseId: string;
  firstPurchaseId: string;
  secondPurchaseId: string;
  parentId: string;
  firstId: string;
  secondId: string;
};

const seedFixture = async (tx: DatabaseTransaction): Promise<WriterFixture> => {
  const suffix = randomUUID();
  const fixture: WriterFixture = {
    cohortId: randomUUID(),
    mainChatId: `hub_writer_main_${suffix}`,
    hubChatId: `hub_writer_hub_${suffix}`,
    parentPurchaseId: randomUUID(),
    firstPurchaseId: randomUUID(),
    secondPurchaseId: randomUUID(),
    parentId: randomUUID(),
    firstId: randomUUID(),
    secondId: randomUUID(),
  };

  await tx.insert(telegramChats).values([
    { chatId: fixture.mainChatId, title: "Writer Online chat", type: "supergroup" },
    { chatId: fixture.hubChatId, title: "Writer Hub chat", type: "supergroup" },
  ]);
  await tx.insert(onlineGroupCohorts).values({
    id: fixture.cohortId,
    mainChatId: fixture.mainChatId,
    title: "Writer predecessor cohort",
    startsAt: new Date("2026-10-01T08:00:00.000Z"),
  });

  const payment = {
    amountMinor: 4000,
    currency: "eur",
    stripeStatus: "succeeded",
    outcome: "succeeded" as const,
    telegramUserId: OWNER_ID,
    succeededAt: CREATED_AT,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
  await tx.insert(purchases).values([
    {
      ...payment,
      id: fixture.parentPurchaseId,
      paymentIntentId: `pi_hub_writer_parent_${suffix}`,
      onlineGroupCohortId: fixture.cohortId,
    },
    {
      ...payment,
      id: fixture.firstPurchaseId,
      paymentIntentId: `pi_hub_writer_first_${suffix}`,
    },
    {
      ...payment,
      id: fixture.secondPurchaseId,
      paymentIntentId: `pi_hub_writer_second_${suffix}`,
    },
  ]);

  await tx.insert(accessEntitlements).values({
    id: fixture.parentId,
    purchaseId: fixture.parentPurchaseId,
    sourceKind: "online_group",
    accessKey: "primary",
    status: "activated",
    telegramUserId: OWNER_ID,
    telegramChatId: fixture.mainChatId,
    expiresAt: STARTS_AT,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  const pending = {
    accessKey: "inspiration-hub",
    sourceKind: "standalone_hub" as const,
    periodStartMode: "after_entitlement" as const,
    paidDurationDays: 56,
    externalTargetType: "telegram_chat" as const,
    telegramChatId: fixture.hubChatId,
    telegramUsername: "hub_writer_member",
    deliveryChannel: "telegram",
    accessWorkflow: "telegram-online-group",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
  await tx.insert(accessEntitlements).values({
    ...pending,
    id: fixture.firstId,
    purchaseId: fixture.firstPurchaseId,
    startsAfterEntitlementId: fixture.parentId,
    status: "pending",
    telegramUserId: null,
  });
  await tx.insert(accessEntitlements).values({
    ...pending,
    id: fixture.secondId,
    purchaseId: fixture.secondPurchaseId,
    startsAfterEntitlementId: fixture.firstId,
    status: "activated",
    telegramUserId: OWNER_ID,
    currentTokenId: `token_hub_writer_${suffix}`,
  });

  return fixture;
};

const withFixture = async (
  run: (fixture: WriterFixture) => Promise<void>,
): Promise<void> => {
  // Committed fixtures let separate connections observe real rollback and locking.
  const fixture = await db.transaction(seedFixture);

  try {
    await run(fixture);
  } finally {
    await db.transaction(async (tx) => {
      // The predecessor FK is RESTRICT: delete the chain from its tail.
      for (const id of [fixture.secondId, fixture.firstId, fixture.parentId]) {
        await tx.delete(accessEntitlements).where(eq(accessEntitlements.id, id));
      }
      await tx
        .delete(purchases)
        .where(
          inArray(purchases.id, [
            fixture.parentPurchaseId,
            fixture.firstPurchaseId,
            fixture.secondPurchaseId,
          ]),
        );
      await tx
        .delete(onlineGroupCohorts)
        .where(eq(onlineGroupCohorts.id, fixture.cohortId));
      await tx
        .delete(telegramChats)
        .where(inArray(telegramChats.chatId, [fixture.mainChatId, fixture.hubChatId]));
    });
  }
};

const readSnapshot = async (fixture: WriterFixture) => ({
  entitlements: await db
    .select()
    .from(accessEntitlements)
    .where(
      inArray(accessEntitlements.id, [
        fixture.parentId,
        fixture.firstId,
        fixture.secondId,
      ]),
    )
    .orderBy(asc(accessEntitlements.id)),
  purchases: await db
    .select()
    .from(purchases)
    .where(
      inArray(purchases.id, [
        fixture.parentPurchaseId,
        fixture.firstPurchaseId,
        fixture.secondPurchaseId,
      ]),
    )
    .orderBy(asc(purchases.id)),
});

const createCommand = (fixture: WriterFixture): ApplyPendingHubPeriodDatesCommand => ({
  telegramUserId: OWNER_ID,
  updatedAt: WRITTEN_AT,
  updates: [
    { entitlementId: fixture.firstId, startsAt: STARTS_AT, expiresAt: EXPIRES_AT },
    {
      entitlementId: fixture.secondId,
      startsAt: EXPIRES_AT,
      expiresAt: SECOND_EXPIRES_AT,
    },
  ],
});

const firstPeriodCommand = (
  fixture: WriterFixture,
): ApplyPendingHubPeriodDatesCommand => {
  const command = createCommand(fixture);
  return { ...command, updates: command.updates.slice(0, 1) };
};

const applyCommand = (command: ApplyPendingHubPeriodDatesCommand) =>
  db.transaction((tx) => applyPendingHubPeriodDatesInTransaction(tx, command));

const assertConflictLeavesSnapshot = async (
  fixture: WriterFixture,
  command = firstPeriodCommand(fixture),
) => {
  const before = await readSnapshot(fixture);
  await assert.rejects(applyCommand(command), { name: "Error", message: CONFLICT });
  assert.deepEqual(await readSnapshot(fixture), before);
};

test("a paid batch fills dates for unbound and matching owners, preserving every other field", async () => {
  await withFixture(async (fixture) => {
    const before = await readSnapshot(fixture);
    const command = createCommand(fixture);

    assert.equal(await applyCommand(command), undefined);

    const after = await readSnapshot(fixture);
    assert.deepEqual(after.purchases, before.purchases);
    assert.deepEqual(
      after.entitlements,
      before.entitlements.map((row) => {
        if (row.id === fixture.firstId) {
          return {
            ...row,
            startsAt: STARTS_AT,
            expiresAt: EXPIRES_AT,
            updatedAt: WRITTEN_AT,
          };
        }
        if (row.id === fixture.secondId) {
          return {
            ...row,
            startsAt: EXPIRES_AT,
            expiresAt: SECOND_EXPIRES_AT,
            updatedAt: WRITTEN_AT,
          };
        }
        return row;
      }),
    );
  });
});

test("an empty plan succeeds without changing purchases or entitlements", async () => {
  await withFixture(async (fixture) => {
    const before = await readSnapshot(fixture);
    assert.equal(
      await applyCommand({ ...createCommand(fixture), updates: [] }),
      undefined,
    );
    assert.deepEqual(await readSnapshot(fixture), before);
  });
});

for (const outcome of ["processing", "requires_action", "failed", "canceled"] as const) {
  test(`a purchase with outcome ${outcome} cannot receive Hub dates`, async () => {
    await withFixture(async (fixture) => {
      await db
        .update(purchases)
        .set({ outcome })
        .where(eq(purchases.id, fixture.firstPurchaseId));
      await assertConflictLeavesSnapshot(fixture);
    });
  });
}

const rejectedPurchases: {
  name: string;
  values: Partial<typeof purchases.$inferInsert>;
}[] = [
  { name: "another verified owner", values: { telegramUserId: OTHER_OWNER_ID } },
  { name: "no verified owner", values: { telegramUserId: null } },
  { name: "no confirmed payment time", values: { succeededAt: null } },
];

for (const scenario of rejectedPurchases) {
  test(`a successful purchase with ${scenario.name} cannot receive Hub dates`, async () => {
    await withFixture(async (fixture) => {
      await db
        .update(purchases)
        .set(scenario.values)
        .where(eq(purchases.id, fixture.firstPurchaseId));
      await assertConflictLeavesSnapshot(fixture);
    });
  });
}

test("a purchase linked to an Online cohort cannot receive standalone Hub dates", async () => {
  await withFixture(async (fixture) => {
    await db
      .update(purchases)
      .set({ onlineGroupCohortId: fixture.cohortId })
      .where(eq(purchases.id, fixture.firstPurchaseId));
    await assertConflictLeavesSnapshot(fixture);
  });
});

const rejectedEntitlements: {
  name: string;
  values: Partial<typeof accessEntitlements.$inferInsert>;
}[] = [
  { name: "a conflicting Telegram binding", values: { telegramUserId: OTHER_OWNER_ID } },
  { name: "revocation by status alone", values: { status: "revoked" } },
  { name: "revocation by timestamp alone", values: { revokedAt: CREATED_AT } },
  {
    name: "legacy standalone metadata",
    values: {
      periodStartMode: null,
      paidDurationDays: null,
      startsAfterEntitlementId: null,
    },
  },
  {
    name: "an unclassified legacy source",
    values: {
      sourceKind: null,
      periodStartMode: null,
      paidDurationDays: null,
      startsAfterEntitlementId: null,
    },
  },
  {
    name: "Online Plus Hub access",
    values: {
      sourceKind: "online_group",
      periodStartMode: null,
      paidDurationDays: null,
      startsAfterEntitlementId: null,
    },
  },
  {
    name: "bridge access",
    values: {
      sourceKind: "hub_bridge",
      accessKey: "inspiration-hub-bridge",
      periodStartMode: null,
      paidDurationDays: null,
      startsAfterEntitlementId: null,
    },
  },
  {
    name: "a payment-started period",
    values: {
      periodStartMode: "payment",
      startsAfterEntitlementId: null,
      startsAt: STARTS_AT,
      expiresAt: EXPIRES_AT,
    },
  },
];

for (const scenario of rejectedEntitlements) {
  test(`an entitlement with ${scenario.name} is not assigned pending-chain dates`, async () => {
    await withFixture(async (fixture) => {
      await db
        .update(accessEntitlements)
        .set(scenario.values)
        .where(eq(accessEntitlements.id, fixture.firstId));
      await assertConflictLeavesSnapshot(fixture);
    });
  });
}

test("an unknown entitlement ID produces a conflict without inserting a right", async () => {
  await withFixture(async (fixture) => {
    await assertConflictLeavesSnapshot(fixture, {
      ...firstPeriodCommand(fixture),
      updates: [
        { entitlementId: randomUUID(), startsAt: STARTS_AT, expiresAt: EXPIRES_AT },
      ],
    });
  });
});

for (const sameDates of [true, false]) {
  test(`already resolved dates conflict even when the new dates ${sameDates ? "match" : "differ"}`, async () => {
    await withFixture(async (fixture) => {
      const command = firstPeriodCommand(fixture);
      await applyCommand(command);
      await assertConflictLeavesSnapshot(fixture, {
        ...command,
        updatedAt: new Date("2026-11-17T10:00:00.000Z"),
        updates: sameDates
          ? command.updates
          : [
              {
                entitlementId: fixture.firstId,
                startsAt: EXPIRES_AT,
                expiresAt: SECOND_EXPIRES_AT,
              },
            ],
      });
    });
  });
}

for (const status of ["expired", "left_channel"] as const) {
  test(`delivery status ${status} does not replace the pending calendar state`, async () => {
    await withFixture(async (fixture) => {
      await db
        .update(accessEntitlements)
        .set({ status })
        .where(eq(accessEntitlements.id, fixture.firstId));
      await applyCommand(firstPeriodCommand(fixture));
      const { entitlements } = await readSnapshot(fixture);
      const first = entitlements.find((row) => row.id === fixture.firstId);
      const second = entitlements.find((row) => row.id === fixture.secondId);
      assert.ok(first);
      assert.ok(second);
      assert.equal(first.status, status);
      assert.deepEqual(first.startsAt, STARTS_AT);
      assert.deepEqual(first.expiresAt, EXPIRES_AT);
      assert.equal(second.startsAt, null);
      assert.equal(second.expiresAt, null);
    });
  });
}

test("a conflict on the second right rolls back the first write in the caller's transaction", async () => {
  await withFixture(async (fixture) => {
    await db
      .update(accessEntitlements)
      .set({ revokedAt: CREATED_AT })
      .where(eq(accessEntitlements.id, fixture.secondId));
    await assertConflictLeavesSnapshot(fixture, createCommand(fixture));
  });
});

test("a database constraint failure retains its cause and rolls back earlier writes", async () => {
  await withFixture(async (fixture) => {
    const before = await readSnapshot(fixture);
    const command = createCommand(fixture);
    await assert.rejects(
      applyCommand({
        ...command,
        updates: [command.updates[0], { ...command.updates[1], expiresAt: EXPIRES_AT }],
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.notEqual(error.message, CONFLICT);
        assert.ok(error.cause instanceof postgres.PostgresError);
        assert.equal(error.cause.code, "23514");
        assert.equal(
          error.cause.constraint_name,
          "access_entitlements_period_dates_check",
        );
        return true;
      },
    );
    assert.deepEqual(await readSnapshot(fixture), before);
  });
});

test(
  "a competing write waits for the first commit, then conflicts without overwriting it",
  { timeout: 15000 },
  async () => {
    await withFixture(async (fixture) => {
      const winnerReady = Promise.withResolvers<number>();
      const contenderReady = Promise.withResolvers<number>();
      const releaseWinner = Promise.withResolvers<void>();
      const command = firstPeriodCommand(fixture);

      const winner = db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
        const [backend] = await tx.execute<{ pid: number }>(
          sql`SELECT pg_backend_pid() AS pid`,
        );
        assert.ok(backend);
        await applyPendingHubPeriodDatesInTransaction(tx, command);
        winnerReady.resolve(backend.pid);
        await releaseWinner.promise;
      });
      const contender = db.transaction(async (tx) => {
        await winnerReady.promise;
        await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
        const [backend] = await tx.execute<{ pid: number }>(
          sql`SELECT pg_backend_pid() AS pid`,
        );
        assert.ok(backend);
        contenderReady.resolve(backend.pid);
        await applyPendingHubPeriodDatesInTransaction(tx, {
          ...command,
          updates: [
            {
              entitlementId: fixture.firstId,
              startsAt: EXPIRES_AT,
              expiresAt: SECOND_EXPIRES_AT,
            },
          ],
        });
      });
      const outcomes = Promise.allSettled([winner, contender]);
      // Reject readiness on early failure rather than leaving the test waiting.
      void winner.catch(winnerReady.reject);
      void contender.catch(contenderReady.reject);

      try {
        const [winnerPid, contenderPid] = await Promise.all([
          winnerReady.promise,
          contenderReady.promise,
        ]);
        await waitForPostgresBlock(client, contenderPid, winnerPid);
      } finally {
        releaseWinner.resolve();
        await outcomes;
      }

      const [winnerOutcome, contenderOutcome] = await outcomes;
      assert.equal(winnerOutcome.status, "fulfilled");
      assert.equal(contenderOutcome.status, "rejected");
      if (contenderOutcome.status === "rejected") {
        assert.ok(contenderOutcome.reason instanceof Error);
        assert.equal(contenderOutcome.reason.message, CONFLICT);
      }
      const { entitlements } = await readSnapshot(fixture);
      const first = entitlements.find((row) => row.id === fixture.firstId);
      assert.ok(first);
      assert.deepEqual(first.startsAt, STARTS_AT);
      assert.deepEqual(first.expiresAt, EXPIRES_AT);
      assert.deepEqual(first.updatedAt, WRITTEN_AT);
    });
  },
);
