import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { saveOnlineGroupCampaignInTransaction } from "@/db/online-group-campaigns";
import * as schema from "@/db/schema";
import {
  accessEntitlements,
  onlineGroupCampaigns,
  purchases,
  telegramAccessTokens,
  telegramChats,
  telegramUserBindings,
} from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";

import { createTestTelegramUserId } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), { max: 2, prepare: false });
const db = drizzle(client, { schema });

after(async () => {
  await client.end();
});

const OLD_START = new Date("2026-10-05T18:00:00.000Z");
const NEW_START = new Date("2027-01-11T18:00:00.000Z");
const PAID_AT = new Date("2026-11-10T11:00:00.000Z");
const PAID_END = new Date("2027-01-05T11:00:00.000Z");
const ROLLBACK = new Error("rollback_campaign_hub_guard_fixture");

type Fixture = {
  tx: DatabaseTransaction;
  hubChatId: string;
  oldMainChatId: string;
  newMainChatId: string;
  ownerId: string;
};

async function withFixture(run: (fixture: Fixture) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      const suffix = randomUUID();
      const fixture: Fixture = {
        tx,
        hubChatId: `campaign_guard_hub_${suffix}`,
        oldMainChatId: `campaign_guard_old_${suffix}`,
        newMainChatId: `campaign_guard_new_${suffix}`,
        ownerId: createTestTelegramUserId(),
      };
      await tx.insert(telegramChats).values(
        [fixture.hubChatId, fixture.oldMainChatId, fixture.newMainChatId].map(
          (chatId) => ({
            chatId,
            title: chatId,
            type: "supergroup",
          }),
        ),
      );
      await run(fixture);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

/** One purchase in the Hub chat with its right, binding and invite token. */
async function insertHubAccess(
  fixture: Fixture,
  values: {
    deadline: Date | null;
    right: Partial<typeof accessEntitlements.$inferInsert>;
  },
) {
  const { tx, hubChatId, ownerId } = fixture;
  const [purchase] = await tx
    .insert(purchases)
    .values({
      paymentIntentId: `pi_campaign_guard_${randomUUID()}`,
      amountMinor: 4000,
      currency: "eur",
      stripeStatus: "succeeded",
      outcome: "succeeded",
      succeededAt: PAID_AT,
      telegramUserId: ownerId,
      inspirationChatIdSnapshot: hubChatId,
      inspirationAccessExpiresAtSnapshot: values.deadline,
    })
    .returning({ id: purchases.id });
  assert.ok(purchase);
  const [right] = await tx
    .insert(accessEntitlements)
    .values({
      purchaseId: purchase.id,
      accessKey: "inspiration-hub",
      status: "activated",
      telegramChatId: hubChatId,
      expiresAt: values.deadline,
      ...values.right,
    })
    .returning({ id: accessEntitlements.id });
  assert.ok(right);
  await tx.insert(telegramUserBindings).values({
    purchaseId: purchase.id,
    entitlementId: right.id,
    chatId: hubChatId,
    telegramUserId: ownerId,
    boundAt: PAID_AT,
    lastSeenAt: PAID_AT,
    accessExpiresAt: values.deadline,
    status: "active",
  });
  await tx.insert(telegramAccessTokens).values({
    purchaseId: purchase.id,
    entitlementId: right.id,
    tokenId: `tgi_guard_${randomUUID()}`,
    tokenHash: randomUUID(),
    linkKind: "channel_invite",
    chatId: hubChatId,
    accessExpiresAt: values.deadline,
    status: "issued",
    expiresAt: PAID_END,
  });
  return { purchaseId: purchase.id, entitlementId: right.id };
}

async function readDeadlines(
  { tx }: Fixture,
  ids: { purchaseId: string; entitlementId: string },
) {
  const [purchase] = await tx
    .select({ deadline: purchases.inspirationAccessExpiresAtSnapshot })
    .from(purchases)
    .where(eq(purchases.id, ids.purchaseId));
  const [right] = await tx
    .select({
      startsAt: accessEntitlements.startsAt,
      expiresAt: accessEntitlements.expiresAt,
    })
    .from(accessEntitlements)
    .where(eq(accessEntitlements.id, ids.entitlementId));
  const [binding] = await tx
    .select({ deadline: telegramUserBindings.accessExpiresAt })
    .from(telegramUserBindings)
    .where(eq(telegramUserBindings.purchaseId, ids.purchaseId));
  const [token] = await tx
    .select({ deadline: telegramAccessTokens.accessExpiresAt })
    .from(telegramAccessTokens)
    .where(eq(telegramAccessTokens.purchaseId, ids.purchaseId));
  return {
    purchase: purchase?.deadline ?? null,
    rightStart: right?.startsAt ?? null,
    rightEnd: right?.expiresAt ?? null,
    binding: binding?.deadline ?? null,
    token: token?.deadline ?? null,
  };
}

function existingCampaign(fixture: Fixture): typeof onlineGroupCampaigns.$inferSelect {
  return {
    id: randomUUID(),
    title: "Autumn",
    regularChatId: fixture.oldMainChatId,
    libraryChatId: fixture.hubChatId,
    startsAt: OLD_START,
    status: "active",
    createdAt: OLD_START,
    updatedAt: OLD_START,
  };
}

async function save(fixture: Fixture, mainChatId: string) {
  await saveOnlineGroupCampaignInTransaction({
    existingCampaign: existingCampaign(fixture),
    inspirationChatId: fixture.hubChatId,
    mainChatId,
    startsAt: NEW_START,
    title: "Winter",
    tx: fixture.tx,
  });
}

const allAt = (deadline: Date) => ({
  purchase: deadline,
  rightStart: null,
  rightEnd: deadline,
  binding: deadline,
  token: deadline,
});

test("a new cohort stamps legacy Plus Hub deadlines but not period-model rights", async () => {
  await withFixture(async (fixture) => {
    const legacyPlus = await insertHubAccess(fixture, { deadline: null, right: {} });
    const classifiedPlus = await insertHubAccess(fixture, {
      deadline: null,
      right: { sourceKind: "online_group" },
    });
    const paid = await insertHubAccess(fixture, {
      deadline: PAID_END,
      right: {
        sourceKind: "standalone_hub",
        periodStartMode: "payment",
        paidDurationDays: 56,
        startsAt: PAID_AT,
      },
    });
    // Before this guard the save set an end without a start here and violated
    // access_entitlements_period_dates_check, failing the whole admin save.
    const waiting = await insertHubAccess(fixture, {
      deadline: null,
      right: {
        sourceKind: "standalone_hub",
        periodStartMode: "after_entitlement",
        paidDurationDays: 56,
        startsAfterEntitlementId: paid.entitlementId,
      },
    });

    await save(fixture, fixture.newMainChatId);

    assert.deepEqual(await readDeadlines(fixture, legacyPlus), allAt(NEW_START));
    // A classified Plus right ends at closure plus the HUB-D24 grace, not at the next
    // start; only the purchase snapshot, binding and token copies follow the campaign.
    assert.deepEqual(await readDeadlines(fixture, classifiedPlus), {
      ...allAt(NEW_START),
      rightEnd: null,
    });
    assert.deepEqual(await readDeadlines(fixture, waiting), {
      purchase: null,
      rightStart: null,
      rightEnd: null,
      binding: null,
      token: null,
    });
  });
});

test("editing the active cohort moves Plus deadlines but not an equal standalone end", async () => {
  await withFixture(async (fixture) => {
    const plus = await insertHubAccess(fixture, { deadline: OLD_START, right: {} });
    const standalone = await insertHubAccess(fixture, {
      deadline: OLD_START,
      right: {
        sourceKind: "standalone_hub",
        periodStartMode: "payment",
        paidDurationDays: 56,
        startsAt: new Date(OLD_START.getTime() - 56 * 24 * 3600_000),
      },
    });

    await save(fixture, fixture.oldMainChatId);

    assert.deepEqual(await readDeadlines(fixture, plus), allAt(NEW_START));
    assert.deepEqual(await readDeadlines(fixture, standalone), {
      purchase: OLD_START,
      rightStart: new Date(OLD_START.getTime() - 56 * 24 * 3600_000),
      rightEnd: OLD_START,
      binding: OLD_START,
      token: OLD_START,
    });
  });
});
