import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, type TestContext } from "node:test";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { ensureHubPurchasePeriodInTransaction } from "@/db/hub-purchase-period-service";
import * as schema from "@/db/schema";
import {
  accessEntitlements,
  inspirationHubSettings,
  onlineGroupCohorts,
  purchases,
  telegramChats,
} from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";
import { getStandaloneHubPeriodEnd } from "@/lib/inspiration-hub/period-end";
import {
  type HubExpiryProblems,
  revokeExpiredOnlineGroupHubAccess,
} from "@/lib/telegram/online-group-hub-expiry";

import { createTestTelegramUserId } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.TELEGRAM_BOT_TOKEN = "hub-launch-rules-test-token";

const client = postgres(databaseUrl, { max: 2, prepare: false });
const db = drizzle(client, { schema });

after(async () => {
  await client.end();
});

const ROLLBACK = new Error("rollback_hub_launch_rules_fixture");
const OWNER = createTestTelegramUserId();

// Cohort #2 closed on 16 November; access ends at 00:00 on 17 November in Warsaw.
const COHORT_2_STARTS = new Date("2026-10-05T16:00:00.000Z");
const COHORT_2_CLEARED = new Date("2026-11-16T12:00:00.000Z");
const COHORT_2_CLOSED = new Date("2026-11-16T13:00:00.000Z");
const COHORT_2_ENDS = new Date("2026-11-16T23:00:00.000Z");
// Cohort #3 starts on 23 November at 18:00 Warsaw time.
const COHORT_3_STARTS = new Date("2026-11-23T17:00:00.000Z");
const CONTINUATION_PAID = new Date("2026-11-18T10:00:00.000Z");

const withTransaction = async (
  run: (tx: DatabaseTransaction) => Promise<void>,
): Promise<void> => {
  try {
    await db.transaction(async (tx) => {
      await run(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
};

async function insertChat(tx: DatabaseTransaction) {
  const chatId = `hub_launch_rules_${randomUUID()}`;
  await tx.insert(telegramChats).values({ chatId, title: chatId, type: "supergroup" });
  return chatId;
}

/** Cohort #2, closed, followed by cohort #3 that has not started yet. */
async function insertCohorts(tx: DatabaseTransaction) {
  const [cohort2] = await tx
    .insert(onlineGroupCohorts)
    .values({
      title: "Cohort 2",
      mainChatId: await insertChat(tx),
      startsAt: COHORT_2_STARTS,
      closedAt: COHORT_2_CLOSED,
      accessEndsAt: COHORT_2_ENDS,
      lessonsClearedAt: COHORT_2_CLEARED,
    })
    .returning({ id: onlineGroupCohorts.id });
  assert.ok(cohort2);
  await tx.insert(onlineGroupCohorts).values({
    title: "Cohort 3",
    mainChatId: await insertChat(tx),
    startsAt: COHORT_3_STARTS,
    previousCohortId: cohort2.id,
    salesEnabled: true,
  });
  return cohort2.id;
}

async function insertPurchase(
  tx: DatabaseTransaction,
  values: {
    succeededAt: Date;
    telegramUserId?: string | null;
    onlineGroupCohortId?: string | null;
  },
) {
  const [purchase] = await tx
    .insert(purchases)
    .values({
      paymentIntentId: `pi_hub_launch_rules_${randomUUID()}`,
      amountMinor: 4000,
      currency: "eur",
      stripeStatus: "succeeded",
      outcome: "succeeded",
      succeededAt: values.succeededAt,
      telegramUserId: values.telegramUserId === undefined ? OWNER : values.telegramUserId,
      onlineGroupCohortId: values.onlineGroupCohortId ?? null,
    })
    .returning({ id: purchases.id, paymentIntentId: purchases.paymentIntentId });
  assert.ok(purchase);
  return purchase;
}

/** A cohort #2 purchase in the new model; Plus also holds the old-model Hub right. */
async function insertCohort2Buyer(tx: DatabaseTransaction, plus: boolean) {
  const cohortId = await insertCohorts(tx);
  const purchase = await insertPurchase(tx, {
    succeededAt: new Date("2026-10-01T08:00:00.000Z"),
    onlineGroupCohortId: cohortId,
  });
  await tx.insert(accessEntitlements).values([
    {
      purchaseId: purchase.id,
      accessKey: "primary",
      sourceKind: "online_group",
      status: "activated",
    },
    ...(plus
      ? [
          {
            purchaseId: purchase.id,
            accessKey: "inspiration-hub",
            status: "activated" as const,
            expiresAt: COHORT_3_STARTS,
          },
        ]
      : []),
  ]);
  return cohortId;
}

const buyHub = async (
  tx: DatabaseTransaction,
  values: {
    paidAt: Date;
    processedAt?: Date;
    continuationCohortId?: string | null;
  },
) => {
  const purchase = await insertPurchase(tx, { succeededAt: values.paidAt });
  return ensureHubPurchasePeriodInTransaction(tx, {
    purchaseId: purchase.id,
    continuationCohortId: values.continuationCohortId ?? null,
    processedAt: values.processedAt ?? values.paidAt,
  });
};

test("HUB-D26: a Plus #2 member's Hub-only continuation runs from 23 November to 18 January", async () => {
  await withTransaction(async (tx) => {
    const cohortId = await insertCohort2Buyer(tx, true);

    const period = await buyHub(tx, {
      paidAt: CONTINUATION_PAID,
      continuationCohortId: cohortId,
    });

    assert.equal(period.periodStartMode, "after_entitlement");
    assert.deepEqual(period.startsAt, COHORT_3_STARTS);
    assert.deepEqual(
      period.expiresAt,
      getStandaloneHubPeriodEnd({ startsAt: COHORT_3_STARTS }),
    );
    assert.equal(period.expiresAt?.toISOString().slice(0, 10), "2027-01-18");
  });
});

test("HUB-D26: a Standard #2 member's continuation counts from payment", async () => {
  await withTransaction(async (tx) => {
    const cohortId = await insertCohort2Buyer(tx, false);

    const period = await buyHub(tx, {
      paidAt: CONTINUATION_PAID,
      continuationCohortId: cohortId,
    });

    assert.deepEqual(period.startsAt, CONTINUATION_PAID);
  });
});

test("HUB-D26: an early renewal after such a continuation follows its end", async () => {
  await withTransaction(async (tx) => {
    const cohortId = await insertCohort2Buyer(tx, true);
    const continuation = await buyHub(tx, {
      paidAt: CONTINUATION_PAID,
      continuationCohortId: cohortId,
    });

    const renewal = await buyHub(tx, { paidAt: new Date("2026-12-20T10:00:00.000Z") });

    // The renewal revalidates the whole chain, cohort #2 included, with HUB-D26.
    assert.deepEqual(continuation.startsAt, COHORT_3_STARTS);
    assert.equal(renewal.startsAfterEntitlementId, continuation.id);
    assert.deepEqual(renewal.startsAt, continuation.expiresAt);
  });
});

test("К11: paid on 4 January with the Hub until 5 January, processed on 6 January: from 5 January", async () => {
  await withTransaction(async (tx) => {
    // 56 days from 10 November end on 5 January.
    const first = await buyHub(tx, { paidAt: new Date("2026-11-10T10:00:00.000Z") });
    assert.equal(first.expiresAt?.toISOString().slice(0, 10), "2027-01-05");

    const renewal = await buyHub(tx, {
      paidAt: new Date("2027-01-04T10:00:00.000Z"),
      processedAt: new Date("2027-01-06T10:00:00.000Z"),
    });

    assert.equal(renewal.startsAfterEntitlementId, first.id);
    assert.deepEqual(renewal.startsAt, first.expiresAt);
  });
});

// --- The daily cron: what it cannot settle it reports instead of hiding.

const NOW = new Date("2027-01-10T12:00:00.000Z");
const PAST = new Date("2027-01-05T11:00:00.000Z");
const FUTURE = new Date("2027-03-02T11:00:00.000Z");

function stubTelegram(context: TestContext) {
  context.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ ok: true, result: true }), {
        headers: { "Content-Type": "application/json" },
      }),
  );
}

async function insertStandaloneRight(
  tx: DatabaseTransaction,
  values: {
    telegramUserId: string | null;
    paidAt: Date;
    startsAt: Date;
    expiresAt: Date;
    telegramChatId?: string | null;
  },
) {
  const purchase = await insertPurchase(tx, {
    succeededAt: values.paidAt,
    telegramUserId: values.telegramUserId,
  });
  const [right] = await tx
    .insert(accessEntitlements)
    .values({
      purchaseId: purchase.id,
      accessKey: "inspiration-hub",
      sourceKind: "standalone_hub",
      status: "pending",
      startsAt: values.startsAt,
      expiresAt: values.expiresAt,
      telegramChatId: values.telegramChatId ?? null,
    })
    .returning({ id: accessEntitlements.id });
  assert.ok(right);
  return { paymentIntentId: purchase.paymentIntentId, rightId: right.id };
}

const readStatus = async (tx: DatabaseTransaction, rightId: string) => {
  const [right] = await tx
    .select({ status: accessEntitlements.status })
    .from(accessEntitlements)
    .where(eq(accessEntitlements.id, rightId));
  return right?.status;
};

const runCron = async (tx: DatabaseTransaction) => {
  const reports: HubExpiryProblems[] = [];
  const result = await revokeExpiredOnlineGroupHubAccess({
    database: tx,
    now: NOW,
    reportProblems: async (problems) => {
      reports.push(problems);
    },
  });
  return { reports, result };
};

const configureHubChat = async (tx: DatabaseTransaction) => {
  const chatId = await insertChat(tx);
  await tx
    .insert(inspirationHubSettings)
    .values({ telegramChatId: chatId })
    .onConflictDoUpdate({
      target: inspirationHubSettings.id,
      set: { telegramChatId: chatId },
    });
};

test("К5: an ended right without an owner stays unmarked and is reported on every run", async (t) => {
  stubTelegram(t);
  await withTransaction(async (tx) => {
    await configureHubChat(tx);
    const ownerless = await insertStandaloneRight(tx, {
      telegramUserId: null,
      paidAt: new Date("2026-11-10T11:00:00.000Z"),
      startsAt: new Date("2026-11-10T11:00:00.000Z"),
      expiresAt: PAST,
    });

    for (let run = 0; run < 2; run += 1) {
      const { reports, result } = await runCron(tx);

      assert.equal(await readStatus(tx, ownerless.rightId), "pending");
      assert.ok(
        result.problems.ownerlessEndedPaymentIntentIds.includes(
          ownerless.paymentIntentId,
        ),
      );
      assert.equal(reports.length, 1);
    }
  });
});

test("К5: a running Hub purchase without an owner is reported after three days", async (t) => {
  stubTelegram(t);
  await withTransaction(async (tx) => {
    await configureHubChat(tx);
    const old = await insertStandaloneRight(tx, {
      telegramUserId: null,
      paidAt: new Date("2027-01-06T11:00:00.000Z"),
      startsAt: new Date("2027-01-06T11:00:00.000Z"),
      expiresAt: FUTURE,
    });
    const recent = await insertStandaloneRight(tx, {
      telegramUserId: null,
      paidAt: new Date("2027-01-09T11:00:00.000Z"),
      startsAt: new Date("2027-01-09T11:00:00.000Z"),
      expiresAt: FUTURE,
    });

    const { result } = await runCron(tx);

    const reported = result.problems.ownerlessPurchasePaymentIntentIds;
    assert.ok(reported.includes(old.paymentIntentId));
    assert.ok(!reported.includes(recent.paymentIntentId));
  });
});

test("К6: without the shared Hub setting the cron marks no standalone right and reports it", async (t) => {
  stubTelegram(t);
  await withTransaction(async (tx) => {
    await tx.delete(inspirationHubSettings);
    const ended = await insertStandaloneRight(tx, {
      telegramUserId: createTestTelegramUserId(),
      paidAt: new Date("2026-11-10T11:00:00.000Z"),
      startsAt: new Date("2026-11-10T11:00:00.000Z"),
      expiresAt: PAST,
    });

    const { reports, result } = await runCron(tx);

    assert.equal(result.problems.hubSettingsMissing, true);
    assert.equal(reports[0]?.hubSettingsMissing, true);
    assert.equal(await readStatus(tx, ended.rightId), "pending");
  });
});
