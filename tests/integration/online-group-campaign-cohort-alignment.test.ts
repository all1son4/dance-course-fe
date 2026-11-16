import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { alignCohortWithCampaignInTransaction } from "@/db/online-group-campaigns";
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

const PREVIOUS_START = new Date("2026-10-05T16:00:00.000Z");
const START = new Date("2026-11-23T17:00:00.000Z");
const MOVED_START = new Date("2026-11-24T17:00:00.000Z");
const ROLLBACK = new Error("rollback_cohort_alignment_fixture");

type Fixture = {
  tx: DatabaseTransaction;
  hubChatId: string;
  mainChatId: string;
  otherChatId: string;
  previousCohortId: string;
  cohortId: string;
};

async function withFixture(
  run: (fixture: Fixture) => Promise<void>,
  { closed = false }: { closed?: boolean } = {},
) {
  try {
    await db.transaction(async (tx) => {
      const suffix = randomUUID();
      const [hubChatId, previousChatId, mainChatId, otherChatId] = [
        "hub",
        "previous",
        "main",
        "other",
      ].map((name) => `cohort_alignment_${name}_${suffix}`);
      await tx.insert(telegramChats).values(
        [hubChatId, previousChatId, mainChatId, otherChatId].map((chatId) => ({
          chatId: chatId as string,
          title: chatId as string,
          type: "supergroup",
        })),
      );
      const [previous] = await tx
        .insert(onlineGroupCohorts)
        .values({
          title: "Previous",
          mainChatId: previousChatId as string,
          startsAt: PREVIOUS_START,
          closedAt: new Date("2026-11-16T09:00:00.000Z"),
          accessEndsAt: new Date("2026-11-16T23:00:00.000Z"),
          lessonsClearedAt: new Date("2026-11-16T08:00:00.000Z"),
        })
        .returning({ id: onlineGroupCohorts.id });
      assert.ok(previous);
      const [cohort] = await tx
        .insert(onlineGroupCohorts)
        .values({
          title: "Current",
          mainChatId: mainChatId as string,
          startsAt: START,
          previousCohortId: previous.id,
          ...(closed
            ? {
                closedAt: new Date("2026-12-20T09:00:00.000Z"),
                accessEndsAt: new Date("2026-12-20T23:00:00.000Z"),
                lessonsClearedAt: new Date("2026-12-20T08:00:00.000Z"),
              }
            : {}),
        })
        .returning({ id: onlineGroupCohorts.id });
      assert.ok(cohort);
      await run({
        tx,
        hubChatId: hubChatId as string,
        mainChatId: mainChatId as string,
        otherChatId: otherChatId as string,
        previousCohortId: previous.id,
        cohortId: cohort.id,
      });
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

const campaign = (fixture: Fixture) => ({
  id: randomUUID(),
  title: "Online Group 3.0",
  regularChatId: fixture.mainChatId,
  libraryChatId: fixture.hubChatId,
  startsAt: START,
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const align = (fixture: Fixture, values: { mainChatId?: string; startsAt?: Date }) =>
  alignCohortWithCampaignInTransaction({
    existingCampaign: campaign(fixture),
    mainChatId: values.mainChatId ?? fixture.mainChatId,
    startsAt: values.startsAt ?? START,
    tx: fixture.tx,
  });

const readStart = async ({ tx, cohortId }: Fixture) => {
  const [cohort] = await tx
    .select({ startsAt: onlineGroupCohorts.startsAt })
    .from(onlineGroupCohorts)
    .where(eq(onlineGroupCohorts.id, cohortId));
  return cohort?.startsAt;
};

test("a new start date in the old form moves the cohort too", async () => {
  await withFixture(async (fixture) => {
    await align(fixture, { startsAt: MOVED_START });
    assert.deepEqual(await readStart(fixture), MOVED_START);
  });
});

test("the main chat of a cohort cannot be switched in the old form", async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(
      align(fixture, { mainChatId: fixture.otherChatId, startsAt: MOVED_START }),
      /online_group_cohort_main_chat_fixed/u,
    );
    assert.deepEqual(await readStart(fixture), START);
  });
});

test("a campaign without a cohort record is saved as before", async () => {
  await withFixture(async (fixture) => {
    await alignCohortWithCampaignInTransaction({
      existingCampaign: { ...campaign(fixture), regularChatId: fixture.otherChatId },
      mainChatId: fixture.hubChatId,
      startsAt: MOVED_START,
      tx: fixture.tx,
    });
    assert.deepEqual(await readStart(fixture), START);
  });
});

test("a closed cohort keeps its start", async () => {
  await withFixture(
    async (fixture) => {
      await assert.rejects(
        align(fixture, { startsAt: MOVED_START }),
        /online_group_cohort_closed/u,
      );
      // Saving the same date stays allowed.
      await align(fixture, {});
    },
    { closed: true },
  );
});

test("a start that paid Hub continuations begin at is not moved (HUB-D26)", async () => {
  await withFixture(async (fixture) => {
    const [plusPurchase] = await fixture.tx
      .insert(purchases)
      .values({
        paymentIntentId: `pi_cohort_alignment_${randomUUID()}`,
        amountMinor: 28000,
        currency: "pln",
        stripeStatus: "succeeded",
        outcome: "succeeded",
        onlineGroupCohortId: fixture.previousCohortId,
      })
      .returning({ id: purchases.id });
    assert.ok(plusPurchase);
    const [primary] = await fixture.tx
      .insert(accessEntitlements)
      .values({
        purchaseId: plusPurchase.id,
        accessKey: "primary",
        sourceKind: "online_group",
        status: "activated",
      })
      .returning({ id: accessEntitlements.id });
    assert.ok(primary);
    const [hubPurchase] = await fixture.tx
      .insert(purchases)
      .values({
        paymentIntentId: `pi_cohort_alignment_hub_${randomUUID()}`,
        amountMinor: 15500,
        currency: "pln",
        stripeStatus: "succeeded",
        outcome: "succeeded",
      })
      .returning({ id: purchases.id });
    assert.ok(hubPurchase);
    await fixture.tx.insert(accessEntitlements).values({
      purchaseId: hubPurchase.id,
      accessKey: "inspiration-hub",
      sourceKind: "standalone_hub",
      periodStartMode: "after_entitlement",
      paidDurationDays: 56,
      startsAfterEntitlementId: primary.id,
      startsAt: START,
      expiresAt: new Date(START.getTime() + 56 * 24 * 3600_000),
      status: "pending",
    });

    await assert.rejects(
      align(fixture, { startsAt: MOVED_START }),
      /online_group_cohort_start_has_continuations/u,
    );
    assert.deepEqual(await readStart(fixture), START);
  });
});

test("after the transfer the form may switch to the recorded successor cohort", async () => {
  await withFixture(async (fixture) => {
    const [previous] = await fixture.tx
      .select({ mainChatId: onlineGroupCohorts.mainChatId })
      .from(onlineGroupCohorts)
      .where(eq(onlineGroupCohorts.id, fixture.previousCohortId));
    assert.ok(previous);
    const previousCampaign = { ...campaign(fixture), regularChatId: previous.mainChatId };

    // Same start: the switch only follows the records.
    await alignCohortWithCampaignInTransaction({
      existingCampaign: previousCampaign,
      mainChatId: fixture.mainChatId,
      startsAt: START,
      tx: fixture.tx,
    });
    assert.deepEqual(await readStart(fixture), START);

    // A different start in the same save moves the successor.
    await alignCohortWithCampaignInTransaction({
      existingCampaign: previousCampaign,
      mainChatId: fixture.mainChatId,
      startsAt: MOVED_START,
      tx: fixture.tx,
    });
    assert.deepEqual(await readStart(fixture), MOVED_START);

    // A chat that is not the recorded successor stays refused.
    await assert.rejects(
      alignCohortWithCampaignInTransaction({
        existingCampaign: previousCampaign,
        mainChatId: fixture.otherChatId,
        startsAt: START,
        tx: fixture.tx,
      }),
      /online_group_cohort_main_chat_fixed/u,
    );
  });
});
