import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getOnlineGroupCohortSale } from "@/db/online-group-cohort-sale";
import * as schema from "@/db/schema";
import { onlineGroupCohorts, telegramChats } from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), { max: 1, prepare: false });
const db = drizzle(client, { schema });

after(async () => {
  await client.end();
});

const ROLLBACK = new Error("rollback_online_group_cohort_sale_fixture");
// Cohort #2 started 5 October; it was closed on 16 November at 14:00 Warsaw time.
const PREVIOUS_STARTS_AT = new Date("2026-10-05T16:00:00.000Z");
const PREVIOUS_CLOSED_AT = new Date("2026-11-16T13:00:00.000Z");
const PREVIOUS_ACCESS_ENDS_AT = new Date("2026-11-16T23:00:00.000Z");
// Cohort #3 starts on 23 November.
const STARTS_AT = new Date("2026-11-23T17:00:00.000Z");

type CohortValues = {
  previousCohortId?: string | null;
  salesEnabled?: boolean;
  startsAt?: Date;
};

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

async function insertCohort(
  tx: DatabaseTransaction,
  values: CohortValues = {},
): Promise<{ chatId: string; cohortId: string }> {
  const chatId = `cohort_sale_${randomUUID()}`;
  await tx.insert(telegramChats).values({ chatId, title: chatId, type: "supergroup" });
  const [cohort] = await tx
    .insert(onlineGroupCohorts)
    .values({
      title: chatId,
      mainChatId: chatId,
      startsAt: values.startsAt ?? STARTS_AT,
      previousCohortId: values.previousCohortId ?? null,
      salesEnabled: values.salesEnabled ?? true,
    })
    .returning({ id: onlineGroupCohorts.id });
  assert.ok(cohort);
  return { chatId, cohortId: cohort.id };
}

const insertPreviousCohort = (tx: DatabaseTransaction) =>
  insertCohort(tx, { salesEnabled: false, startsAt: PREVIOUS_STARTS_AT });

const closeCohort = (tx: DatabaseTransaction, cohortId: string) =>
  tx
    .update(onlineGroupCohorts)
    .set({
      closedAt: PREVIOUS_CLOSED_AT,
      accessEndsAt: PREVIOUS_ACCESS_ENDS_AT,
      lessonsClearedAt: PREVIOUS_CLOSED_AT,
      salesEnabled: false,
    })
    .where(eq(onlineGroupCohorts.id, cohortId));

test("a cohort is sold once its predecessor is closed", async () => {
  await withTransaction(async (tx) => {
    const previous = await insertPreviousCohort(tx);
    await closeCohort(tx, previous.cohortId);
    const next = await insertCohort(tx, { previousCohortId: previous.cohortId });

    assert.deepEqual(await getOnlineGroupCohortSale(tx, next.chatId), {
      open: true,
      cohortId: next.cohortId,
    });
  });
});

test("a cohort without a predecessor is sold without waiting for anything", async () => {
  await withTransaction(async (tx) => {
    const cohort = await insertCohort(tx);

    assert.deepEqual(await getOnlineGroupCohortSale(tx, cohort.chatId), {
      open: true,
      cohortId: cohort.cohortId,
    });
  });
});

test("HUB-D13: a cohort is not sold while its predecessor is still open", async () => {
  await withTransaction(async (tx) => {
    const previous = await insertPreviousCohort(tx);
    const next = await insertCohort(tx, { previousCohortId: previous.cohortId });

    assert.deepEqual(await getOnlineGroupCohortSale(tx, next.chatId), {
      open: false,
      reason: "previous_cohort_open",
    });
  });
});

test("a payment is refused when no cohort uses the campaign's main chat", async () => {
  await withTransaction(async (tx) => {
    await insertCohort(tx);

    assert.deepEqual(await getOnlineGroupCohortSale(tx, `missing_${randomUUID()}`), {
      open: false,
      reason: "cohort_not_found",
    });
  });
});

test("a payment is refused when the cohort's sales are switched off", async () => {
  await withTransaction(async (tx) => {
    const cohort = await insertCohort(tx, { salesEnabled: false });

    assert.deepEqual(await getOnlineGroupCohortSale(tx, cohort.chatId), {
      open: false,
      reason: "cohort_sales_disabled",
    });
  });
});

test("a payment is refused when the cohort itself is closed", async () => {
  await withTransaction(async (tx) => {
    const cohort = await insertPreviousCohort(tx);
    await closeCohort(tx, cohort.cohortId);

    assert.deepEqual(await getOnlineGroupCohortSale(tx, cohort.chatId), {
      open: false,
      reason: "cohort_closed",
    });
  });
});
