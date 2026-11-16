import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import {
  ensurePlusHubBridgeInTransaction,
  moveCohortStartInTransaction,
} from "@/db/hub-bridge";
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

const onlineOffers = SELLABLE_PRODUCTS["online-group-anna-strok"].offers;
const PLUS_OFFER_ID = onlineOffers.find((offer) => offer.code === "library-access")?.id;
const STANDARD_OFFER_ID = onlineOffers.find((offer) => offer.code === "standard")?.id;

// 17 November 2026, 12:00 in Warsaw.
const PLUS_START = new Date("2026-11-17T11:00:00.000Z");
const PAID_AT = new Date("2026-11-09T09:00:00.000Z");
const STANDALONE_START = new Date("2026-09-20T10:00:00.000Z");
const PREVIOUS_PLUS_END = new Date("2026-10-20T22:00:00.000Z");
const PROCESSED_AT = new Date("2026-11-09T09:01:00.000Z");
const ROLLBACK = new Error("rollback_hub_bridge_fixture");

type Fixture = { tx: DatabaseTransaction; ownerId: string };

async function withFixture(run: (fixture: Fixture) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await run({ tx, ownerId: createTestTelegramUserId() });
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

async function insertCohort(
  tx: DatabaseTransaction,
  values: { startsAt: Date; previousCohortId?: string; accessEndsAt?: Date },
) {
  const chatId = `hub_bridge_${randomUUID()}`;
  await tx.insert(telegramChats).values({ chatId, title: chatId, type: "supergroup" });
  const closedAt =
    values.accessEndsAt === undefined
      ? null
      : new Date(values.accessEndsAt.getTime() - 10 * 3600_000);
  const [cohort] = await tx
    .insert(onlineGroupCohorts)
    .values({
      title: chatId,
      mainChatId: chatId,
      startsAt: values.startsAt,
      previousCohortId: values.previousCohortId ?? null,
      closedAt,
      accessEndsAt: values.accessEndsAt ?? null,
      lessonsClearedAt: closedAt,
    })
    .returning({ id: onlineGroupCohorts.id });
  assert.ok(cohort);
  return cohort.id;
}

async function insertPurchase(
  fixture: Fixture,
  values: {
    paidAt?: Date;
    cohortId?: string | null;
    offerId?: string | null;
    telegramUserId?: string | null;
  } = {},
) {
  const [purchase] = await fixture.tx
    .insert(purchases)
    .values({
      paymentIntentId: `pi_hub_bridge_${randomUUID()}`,
      amountMinor: 6500,
      currency: "eur",
      stripeStatus: "succeeded",
      outcome: "succeeded",
      succeededAt: values.paidAt ?? PAID_AT,
      telegramUserId:
        values.telegramUserId === undefined ? fixture.ownerId : values.telegramUserId,
      onlineGroupCohortId: values.cohortId ?? null,
      offerExternalId: values.offerId === undefined ? PLUS_OFFER_ID : values.offerId,
    })
    .returning({ id: purchases.id });
  assert.ok(purchase);
  return purchase.id;
}

async function insertStandaloneEndingAt(fixture: Fixture, expiresAt: Date) {
  const purchaseId = await insertPurchase(fixture, {
    paidAt: STANDALONE_START,
    offerId: null,
  });
  await fixture.tx.insert(accessEntitlements).values({
    purchaseId,
    accessKey: "inspiration-hub",
    sourceKind: "standalone_hub",
    periodStartMode: "payment",
    paidDurationDays: 56,
    startsAt: STANDALONE_START,
    expiresAt,
    status: "activated",
  });
}

/** A new Plus in a cohort starting at PLUS_START, optionally after a closed cohort. */
async function insertNewPlus(
  fixture: Fixture,
  values: { paidAt?: Date; withPreviousPlus?: boolean; offerId?: string | null } = {},
) {
  let previousCohortId: string | undefined;
  if (values.withPreviousPlus) {
    previousCohortId = await insertCohort(fixture.tx, {
      startsAt: new Date("2026-08-01T10:00:00.000Z"),
      accessEndsAt: PREVIOUS_PLUS_END,
    });
    const previousPurchaseId = await insertPurchase(fixture, {
      paidAt: new Date("2026-07-20T10:00:00.000Z"),
      cohortId: previousCohortId,
    });
    await fixture.tx.insert(accessEntitlements).values({
      purchaseId: previousPurchaseId,
      accessKey: "inspiration-hub",
      sourceKind: "online_group",
      expiresAt: PREVIOUS_PLUS_END,
      status: "activated",
    });
  }
  const cohortId = await insertCohort(fixture.tx, {
    startsAt: PLUS_START,
    previousCohortId,
  });
  const purchaseId = await insertPurchase(fixture, {
    paidAt: values.paidAt,
    cohortId,
    offerId: values.offerId,
  });
  return { cohortId, purchaseId };
}

const bridge = (fixture: Fixture, purchaseId: string) =>
  ensurePlusHubBridgeInTransaction(fixture.tx, { purchaseId, processedAt: PROCESSED_AT });

const datesOf = (right: { startsAt: Date | null; expiresAt: Date | null } | null) =>
  right === null ? null : { startsAt: right.startsAt, expiresAt: right.expiresAt };

for (const scenario of [
  { name: "a 5-day gap is bridged", end: "2026-11-12T11:00:00.000Z", bridged: true },
  {
    name: "exactly 7 calendar days are bridged",
    end: "2026-11-10T11:00:00.000Z",
    bridged: true,
  },
  {
    name: "7 days and 1 hour are not bridged",
    end: "2026-11-10T10:00:00.000Z",
    bridged: false,
  },
  {
    name: "a Hub covering the start needs no bridge",
    end: "2026-11-30T11:00:00.000Z",
    bridged: false,
  },
]) {
  test(`standalone Hub → Plus: ${scenario.name}`, async () => {
    await withFixture(async (fixture) => {
      const standaloneEnd = new Date(scenario.end);
      await insertStandaloneEndingAt(fixture, standaloneEnd);
      const { purchaseId } = await insertNewPlus(fixture);

      const result = await bridge(fixture, purchaseId);

      assert.deepEqual(
        datesOf(result),
        scenario.bridged ? { startsAt: standaloneEnd, expiresAt: PLUS_START } : null,
      );
      if (result) {
        assert.equal(result.sourceKind, "hub_bridge");
        assert.equal(result.accessKey, "inspiration-hub-bridge");
        assert.equal(result.purchaseId, purchaseId);
        assert.equal(result.telegramUserId, fixture.ownerId);
      }
    });
  });
}

test("Plus → Plus bought within 7 days is bridged however long the pause (HUB-D24)", async () => {
  await withFixture(async (fixture) => {
    const { purchaseId } = await insertNewPlus(fixture, {
      withPreviousPlus: true,
      paidAt: new Date("2026-10-23T09:00:00.000Z"),
    });

    assert.deepEqual(datesOf(await bridge(fixture, purchaseId)), {
      startsAt: PREVIOUS_PLUS_END,
      expiresAt: PLUS_START,
    });
  });
});

test("Plus → Plus bought after the 7-day grace gets no bridge", async () => {
  await withFixture(async (fixture) => {
    const { purchaseId } = await insertNewPlus(fixture, {
      withPreviousPlus: true,
      paidAt: new Date("2026-10-28T09:00:00.000Z"),
    });

    assert.equal(await bridge(fixture, purchaseId), null);
  });
});

test("a standalone Hub still running moves a Plus → Plus bridge to its end", async () => {
  await withFixture(async (fixture) => {
    const standaloneEnd = new Date("2026-10-30T10:00:00.000Z");
    await insertStandaloneEndingAt(fixture, standaloneEnd);
    const { purchaseId } = await insertNewPlus(fixture, {
      withPreviousPlus: true,
      paidAt: new Date("2026-10-23T09:00:00.000Z"),
    });

    assert.deepEqual(datesOf(await bridge(fixture, purchaseId)), {
      startsAt: standaloneEnd,
      expiresAt: PLUS_START,
    });
  });
});

test("a replay returns the stored bridge", async () => {
  await withFixture(async (fixture) => {
    await insertStandaloneEndingAt(fixture, new Date("2026-11-12T11:00:00.000Z"));
    const { purchaseId } = await insertNewPlus(fixture);

    const first = await bridge(fixture, purchaseId);
    const replay = await bridge(fixture, purchaseId);

    assert.ok(first);
    assert.deepEqual(replay, first);
  });
});

test("no bridge without a Telegram owner or after the cohort started", async () => {
  await withFixture(async (fixture) => {
    await insertStandaloneEndingAt(fixture, new Date("2026-11-12T11:00:00.000Z"));
    const cohortId = await insertCohort(fixture.tx, { startsAt: PLUS_START });
    const ownerless = await insertPurchase(fixture, { cohortId, telegramUserId: null });
    const late = await insertPurchase(fixture, {
      cohortId,
      paidAt: new Date("2026-11-18T09:00:00.000Z"),
    });

    assert.equal(await bridge(fixture, ownerless), null);
    assert.equal(await bridge(fixture, late), null);
  });
});

test("Standard never gets a Hub bridge", async () => {
  await withFixture(async (fixture) => {
    await insertStandaloneEndingAt(fixture, new Date("2026-11-12T11:00:00.000Z"));
    const { purchaseId } = await insertNewPlus(fixture, { offerId: STANDARD_OFFER_ID });

    await assert.rejects(bridge(fixture, purchaseId), {
      message: "hub_bridge_purchase_invalid",
    });
  });
});

test("moving the start keeps bridges reaching the new date (HUB-D14)", async () => {
  await withFixture(async (fixture) => {
    const standaloneEnd = new Date("2026-11-12T11:00:00.000Z");
    await insertStandaloneEndingAt(fixture, standaloneEnd);
    const { cohortId, purchaseId } = await insertNewPlus(fixture);
    const granted = await bridge(fixture, purchaseId);
    assert.ok(granted);
    const later = new Date("2026-11-23T11:00:00.000Z");

    await moveCohortStartInTransaction(fixture.tx, {
      cohortId,
      startsAt: later,
      updatedAt: PROCESSED_AT,
    });

    const [moved] = await fixture.tx
      .select()
      .from(accessEntitlements)
      .where(eq(accessEntitlements.id, granted.id));
    assert.deepEqual(datesOf(moved ?? null), {
      startsAt: standaloneEnd,
      expiresAt: later,
    });

    const earlier = new Date("2026-11-11T11:00:00.000Z");
    await moveCohortStartInTransaction(fixture.tx, {
      cohortId,
      startsAt: earlier,
      updatedAt: PROCESSED_AT,
    });
    const [collapsed] = await fixture.tx
      .select()
      .from(accessEntitlements)
      .where(eq(accessEntitlements.id, granted.id));
    assert.deepEqual(datesOf(collapsed ?? null), {
      startsAt: standaloneEnd,
      expiresAt: standaloneEnd,
    });
  });
});

test("a closed cohort's start cannot be moved", async () => {
  await withFixture(async (fixture) => {
    const cohortId = await insertCohort(fixture.tx, {
      startsAt: new Date("2026-08-01T10:00:00.000Z"),
      accessEndsAt: PREVIOUS_PLUS_END,
    });

    await assert.rejects(
      moveCohortStartInTransaction(fixture.tx, {
        cohortId,
        startsAt: PLUS_START,
        updatedAt: PROCESSED_AT,
      }),
      { message: "cohort_start_move_invalid" },
    );
  });
});
