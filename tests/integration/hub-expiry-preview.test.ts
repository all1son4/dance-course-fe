import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import {
  accessEntitlements,
  purchases,
  telegramChats,
  telegramUserBindings,
} from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";
import { previewHubExpiry } from "@/lib/telegram/hub-expiry-preview";

import { createTestTelegramUserId } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.TELEGRAM_BOT_TOKEN = "hub-expiry-preview-test-token";

const client = postgres(databaseUrl, { max: 2, prepare: false });
const db = drizzle(client, { schema });

after(async () => {
  await client.end();
});

const LONG_AGO = new Date("2026-11-10T11:00:00.000Z");
const DEADLINE = new Date("2026-11-23T17:00:00.000Z");
const ROLLBACK = new Error("rollback_hub_expiry_preview_fixture");

async function withFixture(
  run: (fixture: {
    tx: DatabaseTransaction;
    chatId: string;
    ownerId: string;
  }) => Promise<void>,
) {
  try {
    await db.transaction(async (tx) => {
      const chatId = `hub_preview_chat_${randomUUID()}`;
      await tx
        .insert(telegramChats)
        .values({ chatId, title: "Hub expiry preview", type: "supergroup" });
      await run({ tx, chatId, ownerId: createTestTelegramUserId() });
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

/** A Plus Hub right of the old model whose binding ends at the next cohort start. */
async function insertLegacyMember({
  tx,
  chatId,
  ownerId,
}: {
  tx: DatabaseTransaction;
  chatId: string;
  ownerId: string;
}) {
  const [purchase] = await tx
    .insert(purchases)
    .values({
      paymentIntentId: `pi_hub_preview_${randomUUID()}`,
      amountMinor: 28000,
      currency: "pln",
      stripeStatus: "succeeded",
      outcome: "succeeded",
      succeededAt: LONG_AGO,
    })
    .returning({ id: purchases.id });
  assert.ok(purchase);
  const [right] = await tx
    .insert(accessEntitlements)
    .values({
      purchaseId: purchase.id,
      accessKey: "inspiration-hub",
      status: "activated",
      telegramChatId: chatId,
      expiresAt: DEADLINE,
    })
    .returning({ id: accessEntitlements.id });
  assert.ok(right);
  const [binding] = await tx
    .insert(telegramUserBindings)
    .values({
      purchaseId: purchase.id,
      entitlementId: right.id,
      chatId,
      telegramUserId: ownerId,
      telegramUsername: "preview_member",
      boundAt: LONG_AGO,
      lastSeenAt: LONG_AGO,
      accessExpiresAt: DEADLINE,
      status: "active",
    })
    .returning({ id: telegramUserBindings.id });
  assert.ok(binding);
  return { entitlementId: right.id, bindingId: binding.id };
}

test("the preview names whom the cron would remove and changes nothing", async (t) => {
  const fetchCalls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL) => {
    fetchCalls.push(String(url));
    throw new Error("the preview must not call Telegram");
  });

  await withFixture(async (fixture) => {
    const legacy = await insertLegacyMember(fixture);

    const before = await previewHubExpiry(fixture.tx, {
      at: new Date(DEADLINE.getTime() - 3600_000),
    });
    assert.equal(
      before.removals.some((removal) => removal.telegramUserId === fixture.ownerId),
      false,
    );

    const afterDeadline = await previewHubExpiry(fixture.tx, {
      at: new Date(DEADLINE.getTime() + 3600_000),
    });
    assert.deepEqual(
      afterDeadline.removals.filter((removal) => removal.chatId === fixture.chatId),
      [
        {
          chatId: fixture.chatId,
          telegramUserId: fixture.ownerId,
          telegramUsername: "preview_member",
        },
      ],
    );

    // The cron's own writes were rolled back with the preview.
    const [binding] = await fixture.tx
      .select({ status: telegramUserBindings.status })
      .from(telegramUserBindings)
      .where(eq(telegramUserBindings.id, legacy.bindingId));
    const [right] = await fixture.tx
      .select({ status: accessEntitlements.status })
      .from(accessEntitlements)
      .where(eq(accessEntitlements.id, legacy.entitlementId));
    assert.equal(binding?.status, "active");
    assert.equal(right?.status, "activated");
  });

  assert.deepEqual(fetchCalls, []);
});
