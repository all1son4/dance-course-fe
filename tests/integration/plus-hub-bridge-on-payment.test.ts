import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { recordOnlineGroupPurchaseSourceInTransaction } from "@/db/purchase-access-source";
import * as schema from "@/db/schema";
import {
  accessEntitlements,
  onlineGroupCohorts,
  purchases,
  telegramChats,
} from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";

import { createTestTelegramUserId } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), { max: 2, prepare: false });
const db = drizzle(client, { schema });

after(async () => {
  await client.end();
});

const DAY_MS = 24 * 3600_000;
const PLUS_OFFER_ID = "off_online_group_anna_strok_library_access";
const ROLLBACK = new Error("rollback_plus_bridge_fixture");

async function withFixture(
  run: (fixture: {
    tx: DatabaseTransaction;
    owner: string;
    cohortId: string;
    cohortStart: Date;
  }) => Promise<void>,
) {
  try {
    await db.transaction(async (tx) => {
      const mainChatId = `plus_bridge_${randomUUID()}`;
      await tx
        .insert(telegramChats)
        .values({ chatId: mainChatId, title: "Plus bridge", type: "supergroup" });
      const cohortStart = new Date(Date.now() + 5 * DAY_MS);
      const [cohort] = await tx
        .insert(onlineGroupCohorts)
        .values({ title: "Plus bridge", mainChatId, startsAt: cohortStart })
        .returning({ id: onlineGroupCohorts.id });
      assert.ok(cohort);
      await run({
        tx,
        owner: createTestTelegramUserId(),
        cohortId: cohort.id,
        cohortStart,
      });
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

async function insertPurchase(
  tx: DatabaseTransaction,
  values: Partial<typeof purchases.$inferInsert>,
) {
  const [purchase] = await tx
    .insert(purchases)
    .values({
      paymentIntentId: `pi_plus_bridge_${randomUUID()}`,
      amountMinor: 28000,
      currency: "pln",
      stripeStatus: "succeeded",
      outcome: "succeeded",
      succeededAt: new Date(),
      ...values,
    })
    .returning({ id: purchases.id });
  assert.ok(purchase);
  return purchase.id;
}

test("a Plus bought while the buyer's Hub runs bridges the gap to the cohort start", async () => {
  await withFixture(async ({ tx, owner, cohortId, cohortStart }) => {
    // Her own paid Hub ends three days before the cohort starts.
    const standaloneEnd = new Date(cohortStart.getTime() - 3 * DAY_MS);
    const standalonePurchaseId = await insertPurchase(tx, {
      telegramUserId: owner,
      amountMinor: 17500,
      succeededAt: new Date(standaloneEnd.getTime() - 56 * DAY_MS),
    });
    await tx.insert(accessEntitlements).values({
      purchaseId: standalonePurchaseId,
      accessKey: "inspiration-hub",
      sourceKind: "standalone_hub",
      periodStartMode: "payment",
      paidDurationDays: 56,
      startsAt: new Date(standaloneEnd.getTime() - 56 * DAY_MS),
      expiresAt: standaloneEnd,
      status: "activated",
    });

    const plusPurchaseId = await insertPurchase(tx, { offerExternalId: PLUS_OFFER_ID });
    await tx
      .insert(accessEntitlements)
      .values({ purchaseId: plusPurchaseId, accessKey: "primary", status: "pending" });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await recordOnlineGroupPurchaseSourceInTransaction(tx, {
        purchaseId: plusPurchaseId,
        cohortId,
        verifiedTelegramUserId: owner,
      });
    }

    const bridges = await tx
      .select({
        sourceKind: accessEntitlements.sourceKind,
        startsAt: accessEntitlements.startsAt,
        expiresAt: accessEntitlements.expiresAt,
        telegramUserId: accessEntitlements.telegramUserId,
      })
      .from(accessEntitlements)
      .where(
        and(
          eq(accessEntitlements.purchaseId, plusPurchaseId),
          eq(accessEntitlements.accessKey, "inspiration-hub-bridge"),
        ),
      );
    assert.deepEqual(bridges, [
      {
        sourceKind: "hub_bridge",
        startsAt: standaloneEnd,
        expiresAt: cohortStart,
        telegramUserId: owner,
      },
    ]);
  });
});

test("a Plus without a known owner gets no bridge", async () => {
  await withFixture(async ({ tx, cohortId }) => {
    const plusPurchaseId = await insertPurchase(tx, { offerExternalId: PLUS_OFFER_ID });
    await tx
      .insert(accessEntitlements)
      .values({ purchaseId: plusPurchaseId, accessKey: "primary", status: "pending" });

    await recordOnlineGroupPurchaseSourceInTransaction(tx, {
      purchaseId: plusPurchaseId,
      cohortId,
      verifiedTelegramUserId: null,
    });

    const bridges = await tx
      .select({ id: accessEntitlements.id })
      .from(accessEntitlements)
      .where(
        and(
          eq(accessEntitlements.purchaseId, plusPurchaseId),
          eq(accessEntitlements.accessKey, "inspiration-hub-bridge"),
        ),
      );
    assert.deepEqual(bridges, []);
  });
});
