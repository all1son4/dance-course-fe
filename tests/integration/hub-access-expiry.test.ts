import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, type TestContext } from "node:test";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import {
  accessEntitlements,
  inspirationHubSettings,
  onlineGroupCohorts,
  purchases,
  telegramChats,
  telegramUserBindings,
} from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";
import { revokeExpiredOnlineGroupHubAccess } from "@/lib/telegram/online-group-hub-expiry";

import { createTestTelegramUserId } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.TELEGRAM_BOT_TOKEN = "hub-expiry-test-token";

const client = postgres(databaseUrl, { max: 2, prepare: false });
const db = drizzle(client, { schema });

after(async () => {
  await client.end();
});

const NOW = new Date("2027-01-10T12:00:00.000Z");
const PAST = new Date("2027-01-05T11:00:00.000Z");
const LONG_AGO = new Date("2026-11-10T11:00:00.000Z");
const FUTURE = new Date("2027-03-02T11:00:00.000Z");
const ROLLBACK = new Error("rollback_hub_access_expiry_fixture");

type Fixture = {
  tx: DatabaseTransaction;
  chatId: string;
  ownerId: string;
};

type TelegramCall = { method: string; chatId: string; userId: string };

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const chatId = `hub_expiry_chat_${randomUUID()}`;
      await tx
        .insert(telegramChats)
        .values({ chatId, title: "Hub expiry", type: "supergroup" });
      await run({ tx, chatId, ownerId: createTestTelegramUserId() });
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

function stubTelegram(
  context: TestContext,
  reply: { status: number; body: Record<string, unknown> } = {
    status: 200,
    body: { ok: true, result: true },
  },
): TelegramCall[] {
  const calls: TelegramCall[] = [];
  context.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({
        method: String(url).split("/").pop() ?? "",
        chatId: String(payload.chat_id),
        userId: String(payload.user_id),
      });
      return new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  return calls;
}

const kicksIn = (calls: TelegramCall[], { chatId, ownerId }: Fixture) =>
  calls.filter(
    (call) =>
      call.method === "banChatMember" &&
      call.chatId === chatId &&
      call.userId === ownerId,
  );

async function insertPurchase(
  { tx }: Fixture,
  values: { telegramUserId?: string | null; onlineGroupCohortId?: string | null } = {},
) {
  const [purchase] = await tx
    .insert(purchases)
    .values({
      paymentIntentId: `pi_hub_expiry_${randomUUID()}`,
      amountMinor: 3500,
      currency: "eur",
      stripeStatus: "succeeded",
      outcome: "succeeded",
      succeededAt: LONG_AGO,
      telegramUserId: values.telegramUserId ?? null,
      onlineGroupCohortId: values.onlineGroupCohortId ?? null,
    })
    .returning({ id: purchases.id });
  assert.ok(purchase);
  return purchase.id;
}

async function insertRight(
  fixture: Fixture,
  values: Partial<typeof accessEntitlements.$inferInsert> & { purchaseId: string },
) {
  const [right] = await fixture.tx
    .insert(accessEntitlements)
    .values({
      accessKey: "inspiration-hub",
      status: "activated",
      telegramChatId: fixture.chatId,
      ...values,
    })
    .returning({ id: accessEntitlements.id });
  assert.ok(right);
  return right.id;
}

async function insertStandalone(
  fixture: Fixture,
  values: Partial<typeof accessEntitlements.$inferInsert> = {},
) {
  const purchaseId = await insertPurchase(fixture, { telegramUserId: fixture.ownerId });
  const entitlementId = await insertRight(fixture, {
    purchaseId,
    sourceKind: "standalone_hub",
    periodStartMode: "payment",
    paidDurationDays: 56,
    startsAt: LONG_AGO,
    expiresAt: PAST,
    ...values,
  });
  return { purchaseId, entitlementId };
}

async function insertBinding(
  fixture: Fixture,
  values: { purchaseId: string; entitlementId: string; accessExpiresAt: Date | null },
) {
  const [binding] = await fixture.tx
    .insert(telegramUserBindings)
    .values({
      ...values,
      chatId: fixture.chatId,
      telegramUserId: fixture.ownerId,
      boundAt: LONG_AGO,
      lastSeenAt: LONG_AGO,
      status: "active",
    })
    .returning({ id: telegramUserBindings.id });
  assert.ok(binding);
  return binding.id;
}

/** The pre-period-model shape: a Plus Hub right whose binding carries the deadline. */
async function insertLegacyExpiredMember(fixture: Fixture) {
  const purchaseId = await insertPurchase(fixture);
  const entitlementId = await insertRight(fixture, { purchaseId, expiresAt: PAST });
  const bindingId = await insertBinding(fixture, {
    purchaseId,
    entitlementId,
    accessExpiresAt: PAST,
  });
  return { purchaseId, entitlementId, bindingId };
}

async function insertClosedCohort(fixture: Fixture, accessEndsAt: Date | null) {
  const mainChatId = `hub_expiry_main_${randomUUID()}`;
  await fixture.tx
    .insert(telegramChats)
    .values({ chatId: mainChatId, title: "Hub expiry cohort", type: "supergroup" });
  const closedAt =
    accessEndsAt === null ? null : new Date(accessEndsAt.getTime() - 12 * 3600_000);
  const [cohort] = await fixture.tx
    .insert(onlineGroupCohorts)
    .values({
      title: "Hub expiry cohort",
      mainChatId,
      startsAt: LONG_AGO,
      closedAt,
      accessEndsAt,
      lessonsClearedAt:
        closedAt === null ? null : new Date(closedAt.getTime() - 3600_000),
    })
    .returning({ id: onlineGroupCohorts.id });
  assert.ok(cohort);
  return { cohortId: cohort.id, mainChatId };
}

async function insertPendingContinuation(fixture: Fixture, cohortEndsAt: Date | null) {
  const { cohortId, mainChatId } = await insertClosedCohort(fixture, cohortEndsAt);
  const onlinePurchaseId = await insertPurchase(fixture, {
    telegramUserId: fixture.ownerId,
    onlineGroupCohortId: cohortId,
  });
  const primaryId = await insertRight(fixture, {
    purchaseId: onlinePurchaseId,
    accessKey: "primary",
    sourceKind: "online_group",
    telegramChatId: mainChatId,
  });
  return insertStandalone(fixture, {
    periodStartMode: "after_entitlement",
    startsAfterEntitlementId: primaryId,
    startsAt: null,
    expiresAt: null,
  });
}

async function readRight({ tx }: Fixture, id: string) {
  const [right] = await tx
    .select({
      status: accessEntitlements.status,
      revokedAt: accessEntitlements.revokedAt,
      revokedReason: accessEntitlements.revokedReason,
    })
    .from(accessEntitlements)
    .where(eq(accessEntitlements.id, id));
  assert.ok(right);
  return right;
}

async function readBindingStatus({ tx }: Fixture, id: string) {
  const [binding] = await tx
    .select({ status: telegramUserBindings.status })
    .from(telegramUserBindings)
    .where(eq(telegramUserBindings.id, id));
  assert.ok(binding);
  return binding.status;
}

const run = (fixture: Fixture) =>
  revokeExpiredOnlineGroupHubAccess({ database: fixture.tx, now: NOW });

test("a legacy member with no other access is removed exactly as before", async (t) => {
  const calls = stubTelegram(t);
  await withFixture(async (fixture) => {
    const legacy = await insertLegacyExpiredMember(fixture);

    await run(fixture);

    assert.equal(kicksIn(calls, fixture).length, 1);
    assert.equal(await readBindingStatus(fixture, legacy.bindingId), "revoked");
    assert.deepEqual(await readRight(fixture, legacy.entitlementId), {
      status: "revoked",
      revokedAt: NOW,
      revokedReason: "expired",
    });
  });
});

test("an active standalone period keeps a legacy member and leaves legacy rows untouched", async (t) => {
  const calls = stubTelegram(t);
  await withFixture(async (fixture) => {
    const legacy = await insertLegacyExpiredMember(fixture);
    await insertStandalone(fixture, { startsAt: PAST, expiresAt: FUTURE });

    await run(fixture);

    assert.equal(kicksIn(calls, fixture).length, 0);
    assert.equal(await readBindingStatus(fixture, legacy.bindingId), "active");
    assert.equal((await readRight(fixture, legacy.entitlementId)).status, "activated");
  });
});

test("an ended standalone period removes its member even with an open-ended binding", async (t) => {
  const calls = stubTelegram(t);
  await withFixture(async (fixture) => {
    const standalone = await insertStandalone(fixture);
    // Legacy logic read a null deadline as unlimited and never removed this member.
    const bindingId = await insertBinding(fixture, {
      ...standalone,
      accessExpiresAt: null,
    });

    await run(fixture);

    assert.equal(kicksIn(calls, fixture).length, 1);
    assert.equal(await readBindingStatus(fixture, bindingId), "revoked");
    assert.deepEqual(await readRight(fixture, standalone.entitlementId), {
      status: "expired",
      revokedAt: null,
      revokedReason: null,
    });
  });
});

test("an ended period whose renewal is active marks the end and keeps the member", async (t) => {
  const calls = stubTelegram(t);
  await withFixture(async (fixture) => {
    const first = await insertStandalone(fixture);
    const bindingId = await insertBinding(fixture, { ...first, accessExpiresAt: PAST });
    await insertStandalone(fixture, {
      periodStartMode: "after_entitlement",
      startsAfterEntitlementId: first.entitlementId,
      startsAt: PAST,
      expiresAt: FUTURE,
    });

    await run(fixture);

    assert.equal(kicksIn(calls, fixture).length, 0);
    assert.equal(await readBindingStatus(fixture, bindingId), "active");
    assert.equal((await readRight(fixture, first.entitlementId)).status, "expired");
  });
});

test("a paid continuation stalled after a closed cohort keeps the member and is reported", async (t) => {
  const calls = stubTelegram(t);
  const warn = t.mock.method(console, "warn", () => undefined);
  await withFixture(async (fixture) => {
    const legacy = await insertLegacyExpiredMember(fixture);
    const pending = await insertPendingContinuation(fixture, PAST);

    const result = await run(fixture);

    assert.equal(kicksIn(calls, fixture).length, 0);
    assert.ok(result.stalledGroups >= 1);
    assert.equal(await readBindingStatus(fixture, legacy.bindingId), "active");
    assert.ok(
      warn.mock.calls.some((call) =>
        JSON.stringify(call.arguments).includes(pending.entitlementId),
      ),
    );
  });
});

test("a stalled continuation is reported on every run, not only the first (К13)", async (t) => {
  stubTelegram(t);
  t.mock.method(console, "warn", () => undefined);
  t.mock.method(console, "error", () => undefined);
  await withFixture(async (fixture) => {
    await insertLegacyExpiredMember(fixture);
    const pending = await insertPendingContinuation(fixture, PAST);
    const waiting = await insertPendingContinuation(fixture, null);
    const [stalledPurchase, waitingPurchase] = await Promise.all(
      [pending.purchaseId, waiting.purchaseId].map(async (id) => {
        const [row] = await fixture.tx
          .select({ paymentIntentId: purchases.paymentIntentId })
          .from(purchases)
          .where(eq(purchases.id, id));
        return row?.paymentIntentId;
      }),
    );

    for (let runIndex = 0; runIndex < 2; runIndex += 1) {
      const reported: string[][] = [];
      await revokeExpiredOnlineGroupHubAccess({
        database: fixture.tx,
        now: NOW,
        reportProblems: async (problems) => {
          reported.push(problems.stalledContinuationPaymentIntentIds);
        },
      });
      assert.ok(reported[0]?.includes(stalledPurchase ?? ""), `run ${runIndex + 1}`);
      // A continuation whose cohort is still open is simply waiting.
      assert.equal(reported[0]?.includes(waitingPurchase ?? ""), false);
    }
  });
});

test("a continuation waiting for an open cohort does not keep anyone in the Hub", async (t) => {
  const calls = stubTelegram(t);
  await withFixture(async (fixture) => {
    const legacy = await insertLegacyExpiredMember(fixture);
    await insertPendingContinuation(fixture, null);

    await run(fixture);

    assert.equal(kicksIn(calls, fixture).length, 1);
    assert.equal(await readBindingStatus(fixture, legacy.bindingId), "revoked");
  });
});

test("an active gap bridge keeps the member until the Plus start", async (t) => {
  const calls = stubTelegram(t);
  await withFixture(async (fixture) => {
    const legacy = await insertLegacyExpiredMember(fixture);
    const plusPurchaseId = await insertPurchase(fixture, {
      telegramUserId: fixture.ownerId,
    });
    await insertRight(fixture, {
      purchaseId: plusPurchaseId,
      accessKey: "inspiration-hub-bridge",
      sourceKind: "hub_bridge",
      startsAt: PAST,
      expiresAt: FUTURE,
    });

    await run(fixture);

    assert.equal(kicksIn(calls, fixture).length, 0);
    assert.equal(await readBindingStatus(fixture, legacy.bindingId), "active");
  });
});

test("the Hub of a classified Plus keeps a member whose standalone period ended", async (t) => {
  const calls = stubTelegram(t);
  await withFixture(async (fixture) => {
    const standalone = await insertStandalone(fixture);
    await insertBinding(fixture, { ...standalone, accessExpiresAt: null });
    const plusPurchaseId = await insertPurchase(fixture, {
      telegramUserId: fixture.ownerId,
    });
    await insertRight(fixture, {
      purchaseId: plusPurchaseId,
      sourceKind: "online_group",
    });

    await run(fixture);

    assert.equal(kicksIn(calls, fixture).length, 0);
    assert.equal((await readRight(fixture, standalone.entitlementId)).status, "expired");
  });
});

test("the Hub of a Plus whose cohort has not started does not keep anyone yet (К3, HUB-D33)", async (t) => {
  const calls = stubTelegram(t);
  await withFixture(async (fixture) => {
    const standalone = await insertStandalone(fixture);
    await insertBinding(fixture, { ...standalone, accessExpiresAt: null });
    const mainChatId = `hub_expiry_future_${randomUUID()}`;
    await fixture.tx
      .insert(telegramChats)
      .values({ chatId: mainChatId, title: "Future cohort", type: "supergroup" });
    const [cohort] = await fixture.tx
      .insert(onlineGroupCohorts)
      .values({
        title: "Future cohort",
        mainChatId,
        startsAt: new Date(NOW.getTime() + 8 * 24 * 3600_000),
      })
      .returning({ id: onlineGroupCohorts.id });
    assert.ok(cohort);
    const plusPurchaseId = await insertPurchase(fixture, {
      telegramUserId: fixture.ownerId,
      onlineGroupCohortId: cohort.id,
    });
    // The right carries no start: only the cohort says when the Plus Hub opens.
    await insertRight(fixture, {
      purchaseId: plusPurchaseId,
      sourceKind: "online_group",
      startsAt: null,
    });

    await run(fixture);

    assert.equal(kicksIn(calls, fixture).length, 1);
  });
});

test("an ended right of someone who never joined is marked without a kick", async (t) => {
  const calls = stubTelegram(t);
  await withFixture(async (fixture) => {
    const standalone = await insertStandalone(fixture);

    await run(fixture);

    assert.equal(kicksIn(calls, fixture).length, 0);
    assert.equal((await readRight(fixture, standalone.entitlementId)).status, "expired");
  });
});

test("a failed kick changes nothing so the next run retries", async (t) => {
  const calls = stubTelegram(t, {
    status: 400,
    body: { ok: false, error_code: 400, description: "Bad Request: CHAT_ADMIN_REQUIRED" },
  });
  t.mock.method(console, "error", () => undefined);
  await withFixture(async (fixture) => {
    const standalone = await insertStandalone(fixture);
    const bindingId = await insertBinding(fixture, {
      ...standalone,
      accessExpiresAt: null,
    });

    const result = await run(fixture);

    assert.equal(kicksIn(calls, fixture).length, 1);
    assert.ok(result.failedGroups >= 1);
    assert.equal(await readBindingStatus(fixture, bindingId), "active");
    assert.equal(
      (await readRight(fixture, standalone.entitlementId)).status,
      "activated",
    );
  });
});

test("a right without a recorded chat applies to the configured shared Hub", async (t) => {
  const calls = stubTelegram(t);
  await withFixture(async (fixture) => {
    await fixture.tx
      .insert(inspirationHubSettings)
      .values({ telegramChatId: fixture.chatId })
      .onConflictDoUpdate({
        target: inspirationHubSettings.id,
        set: { telegramChatId: fixture.chatId },
      });
    const legacy = await insertLegacyExpiredMember(fixture);
    await insertStandalone(fixture, {
      telegramChatId: null,
      startsAt: PAST,
      expiresAt: FUTURE,
    });

    await run(fixture);

    assert.equal(kicksIn(calls, fixture).length, 0);
    assert.equal(await readBindingStatus(fixture, legacy.bindingId), "active");
  });
});

test("an explicitly revoked right neither keeps the member nor gets re-marked", async (t) => {
  const calls = stubTelegram(t);
  await withFixture(async (fixture) => {
    const legacy = await insertLegacyExpiredMember(fixture);
    const revoked = await insertStandalone(fixture, {
      startsAt: PAST,
      expiresAt: FUTURE,
      status: "revoked",
      revokedAt: PAST,
      revokedReason: "admin",
    });

    await run(fixture);

    assert.equal(kicksIn(calls, fixture).length, 1);
    assert.equal(await readBindingStatus(fixture, legacy.bindingId), "revoked");
    assert.deepEqual(await readRight(fixture, revoked.entitlementId), {
      status: "revoked",
      revokedAt: PAST,
      revokedReason: "admin",
    });
  });
});

test("a period-model binding with no deadline no longer shields a legacy expiry", async (t) => {
  const calls = stubTelegram(t);
  await withFixture(async (fixture) => {
    const legacy = await insertLegacyExpiredMember(fixture);
    const ended = await insertStandalone(fixture, { status: "expired" });
    const endedBindingId = await insertBinding(fixture, {
      ...ended,
      accessExpiresAt: null,
    });

    await run(fixture);

    assert.equal(kicksIn(calls, fixture).length, 1);
    const statuses = await fixture.tx
      .select({ status: telegramUserBindings.status })
      .from(telegramUserBindings)
      .where(inArray(telegramUserBindings.id, [legacy.bindingId, endedBindingId]));
    assert.deepEqual(
      statuses.map((row) => row.status),
      ["revoked", "revoked"],
    );
  });
});

for (const scenario of [
  { name: "inside", endedAt: new Date("2027-01-08T00:00:00.000Z"), kicked: false },
  { name: "after", endedAt: new Date("2027-01-02T23:00:00.000Z"), kicked: true },
]) {
  test(`a Plus Hub that ended ${scenario.name} the 7-day grace ${scenario.kicked ? "removes" : "keeps"} its member`, async (t) => {
    const calls = stubTelegram(t);
    await withFixture(async (fixture) => {
      const purchaseId = await insertPurchase(fixture, {
        telegramUserId: fixture.ownerId,
      });
      const entitlementId = await insertRight(fixture, {
        purchaseId,
        sourceKind: "online_group",
        expiresAt: scenario.endedAt,
      });
      const bindingId = await insertBinding(fixture, {
        purchaseId,
        entitlementId,
        accessExpiresAt: scenario.endedAt,
      });

      await run(fixture);

      assert.equal(kicksIn(calls, fixture).length, scenario.kicked ? 1 : 0);
      assert.equal(
        await readBindingStatus(fixture, bindingId),
        scenario.kicked ? "revoked" : "active",
      );
      assert.equal(
        (await readRight(fixture, entitlementId)).status,
        scenario.kicked ? "expired" : "activated",
      );
    });
  });
}
