import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { closeOnlineGroupCohortInTransaction } from "@/db/cohort-closure";
import { classifyCohortPlusHubRights } from "@/db/plus-hub-classification";
import * as schema from "@/db/schema";
import {
  accessEntitlements,
  onlineGroupCohorts,
  purchases,
  telegramChats,
} from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), { max: 2, prepare: false });
const db = drizzle(client, { schema });

after(async () => {
  await client.end();
});

const START = new Date("2026-11-23T17:00:00.000Z");
const STAMPED = new Date("2027-01-11T18:00:00.000Z");
const ROLLBACK = new Error("rollback_plus_hub_classification_fixture");

async function withCohort(
  run: (fixture: {
    tx: DatabaseTransaction;
    mainChatId: string;
    cohortId: string;
  }) => Promise<void>,
) {
  try {
    await db.transaction(async (tx) => {
      const mainChatId = `plus_hub_classification_${randomUUID()}`;
      await tx
        .insert(telegramChats)
        .values({ chatId: mainChatId, title: "Online Group 3.0", type: "supergroup" });
      const [cohort] = await tx
        .insert(onlineGroupCohorts)
        .values({ title: "Online Group 3.0", mainChatId, startsAt: START })
        .returning({ id: onlineGroupCohorts.id });
      assert.ok(cohort);
      await run({ tx, mainChatId, cohortId: cohort.id });
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

async function insertPlusHubRight(
  tx: DatabaseTransaction,
  cohortId: string,
  values: Partial<typeof accessEntitlements.$inferInsert> = {},
) {
  const [purchase] = await tx
    .insert(purchases)
    .values({
      paymentIntentId: `pi_plus_hub_${randomUUID()}`,
      amountMinor: 28000,
      currency: "pln",
      stripeStatus: "succeeded",
      outcome: "succeeded",
      onlineGroupCohortId: cohortId,
    })
    .returning({ id: purchases.id });
  assert.ok(purchase);
  const [right] = await tx
    .insert(accessEntitlements)
    .values({
      purchaseId: purchase.id,
      accessKey: "inspiration-hub",
      status: "activated",
      ...values,
    })
    .returning({ id: accessEntitlements.id });
  assert.ok(right);
  return right.id;
}

const readRight = async (tx: DatabaseTransaction, id: string) => {
  const [right] = await tx
    .select({
      sourceKind: accessEntitlements.sourceKind,
      expiresAt: accessEntitlements.expiresAt,
    })
    .from(accessEntitlements)
    .where(eq(accessEntitlements.id, id));
  return right;
};

test("the Plus Hub rights of a cohort move into the period model (step 27)", async () => {
  await withCohort(async ({ tx, mainChatId, cohortId }) => {
    const stamped = await insertPlusHubRight(tx, cohortId, { expiresAt: STAMPED });
    const open = await insertPlusHubRight(tx, cohortId);

    const dryRun = await classifyCohortPlusHubRights(tx, { mainChatId, write: false });
    assert.equal(dryRun.written, false);
    assert.equal(dryRun.classified, 2);
    assert.equal(dryRun.clearedDeadlines.length, 1);
    assert.deepEqual(await readRight(tx, stamped), {
      sourceKind: null,
      expiresAt: STAMPED,
    });

    const written = await classifyCohortPlusHubRights(tx, { mainChatId, write: true });
    assert.equal(written.classified, 2);
    for (const id of [stamped, open]) {
      assert.deepEqual(await readRight(tx, id), {
        sourceKind: "online_group",
        expiresAt: null,
      });
    }

    const again = await classifyCohortPlusHubRights(tx, { mainChatId, write: true });
    assert.equal(again.classified, 0);
    assert.equal(again.alreadyClassified, 2);

    // The closure of the cohort now records the end of these Plus Hubs.
    const closedAt = new Date("2027-01-17T12:00:00.000Z");
    await closeOnlineGroupCohortInTransaction(tx, {
      cohortId,
      confirmationTitle: "Online Group 3.0",
      lessonsCleared: true,
      openNextCohortSales: false,
      closedAt,
    });
    const ended = await readRight(tx, open);
    assert.equal(ended?.sourceKind, "online_group");
    assert.deepEqual(ended?.expiresAt, new Date("2027-01-17T23:00:00.000Z"));

    await assert.rejects(
      classifyCohortPlusHubRights(tx, { mainChatId, write: false }),
      /plus_hub_classification_cohort_closed/u,
    );
  });
});

test("an unknown main chat is refused", async () => {
  await assert.rejects(
    classifyCohortPlusHubRights(db, {
      mainChatId: `missing_${randomUUID()}`,
      write: false,
    }),
    /plus_hub_classification_cohort_not_found/u,
  );
});
