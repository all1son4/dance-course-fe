import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  type OnlineGroupPurchaseSnapshot,
  readOnlineGroupPurchaseSnapshot,
} from "@/db/online-group-purchase-snapshot";
import * as schema from "@/db/schema";
import {
  accessEntitlements,
  purchases,
  telegramAccessTokens,
  telegramUserBindings,
} from "@/db/schema";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), {
  connect_timeout: 5,
  max: 1,
  prepare: false,
});
const db = drizzle(client, { schema });

// Session-local tables isolate these fixtures from parallel integration files.
before(async () => {
  await client`CREATE TEMP TABLE purchases (LIKE public.purchases INCLUDING ALL)`;
  await client`CREATE TEMP TABLE access_entitlements (LIKE public.access_entitlements INCLUDING ALL)`;
  await client`CREATE TEMP TABLE telegram_user_bindings (LIKE public.telegram_user_bindings INCLUDING ALL)`;
  await client`CREATE TEMP TABLE telegram_access_tokens (LIKE public.telegram_access_tokens INCLUDING ALL)`;
});

beforeEach(async () => {
  await client`TRUNCATE pg_temp.telegram_access_tokens, pg_temp.telegram_user_bindings,
    pg_temp.access_entitlements, pg_temp.purchases`;
});

after(async () => {
  await client.end({ timeout: 5 });
});

async function seedSnapshot(): Promise<OnlineGroupPurchaseSnapshot> {
  const purchaseRows: OnlineGroupPurchaseSnapshot["purchases"] = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      productExternalId: "online-group",
      offerExternalId: "online-group-plus",
      outcome: "succeeded",
      source: "stripe",
      livemode: false,
      firstSeenAt: new Date("2026-09-01T10:00:00Z"),
      inviteHistoryCreatedAt: new Date("2026-08-31T10:00:00Z"),
      succeededAt: new Date("2026-09-01T10:01:00Z"),
      onlineGroupCohortId: "90000000-0000-4000-8000-000000000001",
      telegramUserId: "123",
      inspirationChatIdSnapshot: "hub-a",
      inspirationAccessExpiresAtSnapshot: new Date("2026-11-01T10:00:00Z"),
    },
    {
      id: "10000000-0000-4000-8000-000000000002",
      productExternalId: "another-product",
      offerExternalId: null,
      outcome: "failed",
      source: "stripe",
      livemode: true,
      firstSeenAt: new Date("2026-09-01T10:00:00Z"),
      inviteHistoryCreatedAt: null,
      succeededAt: null,
      onlineGroupCohortId: null,
      telegramUserId: null,
      inspirationChatIdSnapshot: null,
      inspirationAccessExpiresAtSnapshot: null,
    },
    {
      id: "10000000-0000-4000-8000-000000000003",
      productExternalId: null,
      offerExternalId: null,
      outcome: "succeeded",
      source: "admin_offer_link",
      livemode: false,
      firstSeenAt: new Date("2026-09-02T10:00:00Z"),
      inviteHistoryCreatedAt: null,
      succeededAt: null,
      onlineGroupCohortId: null,
      telegramUserId: null,
      inspirationChatIdSnapshot: null,
      inspirationAccessExpiresAtSnapshot: null,
    },
  ];
  await db.insert(purchases).values(
    [...purchaseRows].reverse().map((row) => ({
      ...row,
      paymentIntentId: `pi_snapshot_${row.id}`,
      amountMinor: 0,
      currency: "eur",
      stripeStatus: row.outcome,
      customerEmailSnapshot: "private@example.test",
      customerFullNameSnapshot: "Private Name",
      customerTelegramUsernameSnapshot: "private_username",
    })),
  );

  const entitlementRows: OnlineGroupPurchaseSnapshot["entitlements"] = [
    {
      id: "20000000-0000-4000-8000-000000000001",
      purchaseId: purchaseRows[0].id,
      accessKey: "primary",
      deliveryChannel: "telegram",
      accessWorkflow: "telegram-online-group",
      status: "revoked",
      startsAt: new Date("2026-09-01T10:05:00Z"),
      expiresAt: new Date("2026-10-31T23:00:00Z"),
      periodStartMode: null,
      paidDurationDays: null,
      startsAfterEntitlementId: null,
      revokedAt: new Date("2026-11-01T03:00:00Z"),
      revokedReason: "expired",
      externalTargetType: "telegram_chat",
      telegramChatId: "main-a",
      telegramUserId: "123",
      sourceKind: null,
    },
    {
      id: "20000000-0000-4000-8000-000000000002",
      purchaseId: purchaseRows[2].id,
      accessKey: "inspiration-hub",
      deliveryChannel: "telegram",
      accessWorkflow: "telegram-online-group",
      status: "expired",
      startsAt: new Date("2026-09-01T10:00:00Z"),
      expiresAt: new Date("2026-10-27T10:00:00Z"),
      periodStartMode: "payment",
      paidDurationDays: 56,
      startsAfterEntitlementId: null,
      revokedAt: null,
      revokedReason: null,
      externalTargetType: "telegram_chat",
      telegramChatId: "hub-a",
      telegramUserId: null,
      sourceKind: "standalone_hub",
    },
  ];
  await db.insert(accessEntitlements).values(
    [...entitlementRows].reverse().map((row) => ({
      ...row,
      telegramUsername: "private_username",
      currentTokenId: "private_token_identifier",
    })),
  );

  const bindingRows: OnlineGroupPurchaseSnapshot["bindings"] = [
    {
      id: "30000000-0000-4000-8000-000000000001",
      purchaseId: purchaseRows[0].id,
      entitlementId: entitlementRows[0].id,
      telegramUserId: "123",
      chatId: "main-a",
      boundAt: new Date("2026-09-01T10:05:00Z"),
      lastSeenAt: new Date("2026-10-01T10:00:00Z"),
      accessExpiresAt: new Date("2026-10-31T23:00:00Z"),
      revokedAt: new Date("2026-11-01T03:00:00Z"),
      revokedReason: "expired",
      status: "revoked",
    },
    {
      id: "30000000-0000-4000-8000-000000000002",
      purchaseId: purchaseRows[2].id,
      entitlementId: null,
      telegramUserId: "999",
      chatId: null,
      boundAt: new Date("2026-09-01T10:00:00Z"),
      lastSeenAt: new Date("2026-09-02T10:00:00Z"),
      accessExpiresAt: null,
      revokedAt: null,
      revokedReason: null,
      status: "left",
    },
    {
      id: "30000000-0000-4000-8000-000000000003",
      purchaseId: purchaseRows[0].id,
      entitlementId: null,
      telegramUserId: "123",
      chatId: "hub-a",
      boundAt: new Date("2026-09-01T10:06:00Z"),
      lastSeenAt: new Date("2026-09-02T10:00:00Z"),
      accessExpiresAt: null,
      revokedAt: null,
      revokedReason: null,
      status: "active",
    },
  ];
  await db.insert(telegramUserBindings).values(
    [...bindingRows].reverse().map((row) => ({
      ...row,
      customerEmailSnapshot: "private@example.test",
      telegramUsername: "private_username",
      inviteLink: "https://t.me/+private_invitation",
    })),
  );

  const tokenRows: OnlineGroupPurchaseSnapshot["tokens"] = [
    {
      id: "40000000-0000-4000-8000-000000000001",
      purchaseId: purchaseRows[0].id,
      entitlementId: entitlementRows[0].id,
      linkKind: "channel_invite",
      chatId: "main-a",
      status: "used",
      expiresAt: new Date("2026-09-30T10:00:00Z"),
      usedAt: new Date("2026-09-01T10:05:00Z"),
      telegramUserId: "123",
      accessExpiresAt: new Date("2026-10-31T23:00:00Z"),
      createdAt: new Date("2026-09-01T10:01:00Z"),
    },
    {
      id: "40000000-0000-4000-8000-000000000002",
      purchaseId: purchaseRows[0].id,
      entitlementId: null,
      linkKind: "channel_invite",
      chatId: "hub-a",
      status: "issued",
      expiresAt: new Date("2026-09-30T10:00:00Z"),
      usedAt: null,
      telegramUserId: "123",
      accessExpiresAt: null,
      createdAt: new Date("2026-09-01T10:01:00Z"),
    },
    {
      id: "40000000-0000-4000-8000-000000000003",
      purchaseId: purchaseRows[2].id,
      entitlementId: null,
      linkKind: "start_token",
      chatId: null,
      status: "revoked",
      expiresAt: new Date("2026-09-30T10:00:00Z"),
      usedAt: new Date("2026-09-01T10:00:00Z"),
      telegramUserId: "999",
      accessExpiresAt: null,
      createdAt: new Date("2026-09-01T10:00:00Z"),
    },
    {
      id: "40000000-0000-4000-8000-000000000004",
      purchaseId: purchaseRows[1].id,
      entitlementId: null,
      linkKind: "start_token",
      chatId: null,
      status: "expired",
      expiresAt: new Date("2026-09-30T10:00:00Z"),
      usedAt: null,
      telegramUserId: null,
      accessExpiresAt: null,
      createdAt: new Date("2026-09-01T10:00:00Z"),
    },
    {
      id: "40000000-0000-4000-8000-000000000005",
      purchaseId: purchaseRows[2].id,
      entitlementId: null,
      linkKind: "start_token",
      chatId: null,
      status: "used",
      expiresAt: new Date("2026-09-30T10:00:00Z"),
      usedAt: null,
      telegramUserId: "999",
      accessExpiresAt: null,
      createdAt: new Date("2026-09-01T10:00:00Z"),
    },
  ];
  await db.insert(telegramAccessTokens).values(
    [...tokenRows].reverse().map((row) => ({
      ...row,
      tokenId: `private_token_${row.id}`,
      tokenHash: `private_hash_${row.id}`,
      tokenValue: "https://t.me/+private_invitation",
      customerEmailSnapshot: "private@example.test",
      telegramUsername: "private_username",
      lastError: "private_provider_details",
    })),
  );

  return {
    purchases: purchaseRows,
    entitlements: entitlementRows,
    bindings: bindingRows,
    tokens: tokenRows,
  };
}

async function storedRows() {
  return {
    purchases: await client`SELECT * FROM pg_temp.purchases ORDER BY id`,
    entitlements: await client`SELECT * FROM pg_temp.access_entitlements ORDER BY id`,
    bindings: await client`SELECT * FROM pg_temp.telegram_user_bindings ORDER BY id`,
    tokens: await client`SELECT * FROM pg_temp.telegram_access_tokens ORDER BY id`,
  };
}

test("purchase snapshot: empty tables return four empty lists", async () => {
  assert.deepEqual(await readOnlineGroupPurchaseSnapshot(db), {
    purchases: [],
    entitlements: [],
    bindings: [],
    tokens: [],
  });
});

test("purchase snapshot: retains all outcomes, products, historical statuses and nullable facts in deterministic order", async () => {
  const expected = await seedSnapshot();

  assert.deepEqual(await readOnlineGroupPurchaseSnapshot(db), expected);
});

test("purchase snapshot: excludes invitation secrets and contact details without changing stored records", async () => {
  await seedSnapshot();
  const before = await storedRows();
  const snapshot = await readOnlineGroupPurchaseSnapshot(db);

  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /private_|example\.test|Private Name|https:\/\/t\.me|tokenHash|tokenValue|inviteLink|customerEmail|telegramUsername/u,
  );
  assert.deepEqual(await storedRows(), before);
});

test("purchase snapshot: missing purchase rows do not hide recorded child facts through joins", async () => {
  const expected = await seedSnapshot();
  // LIKE tables intentionally have no foreign keys, so incomplete historical
  // references can be inspected without modifying any public table.
  await client`TRUNCATE pg_temp.purchases`;

  assert.deepEqual(await readOnlineGroupPurchaseSnapshot(db), {
    ...expected,
    purchases: [],
  });
});

test("purchase snapshot: transaction is read-only repeatable-read with bounded statement and lock waits", async () => {
  type TransactionSettings = {
    isolation: string;
    readOnly: string;
    statementTimeout: string;
    lockTimeout: string;
  };
  let observed: TransactionSettings | undefined;
  const observingDatabase: Pick<typeof db, "transaction"> = {
    transaction: (work, config) =>
      db.transaction(async (tx) => {
        const result = await work(tx);
        const [settings] = await tx.execute<TransactionSettings>(sql`
          SELECT current_setting('transaction_isolation') AS isolation,
            current_setting('transaction_read_only') AS "readOnly",
            current_setting('statement_timeout') AS "statementTimeout",
            current_setting('lock_timeout') AS "lockTimeout"
        `);
        observed = settings;
        return result;
      }, config),
  };

  await readOnlineGroupPurchaseSnapshot(observingDatabase);

  assert.deepEqual(observed, {
    isolation: "repeatable read",
    readOnly: "on",
    statementTimeout: "15s",
    lockTimeout: "2s",
  });
});

test("purchase snapshot: a failed last query rejects the whole snapshot instead of returning partial data", async () => {
  await seedSnapshot();
  await client`ALTER TABLE pg_temp.telegram_access_tokens RENAME COLUMN used_at TO unavailable_used_at`;

  try {
    await assert.rejects(readOnlineGroupPurchaseSnapshot(db), (error: unknown) => {
      const cause = error instanceof Error && error.cause ? error.cause : error;
      return cause instanceof postgres.PostgresError && cause.code === "42703";
    });
  } finally {
    await client`ALTER TABLE pg_temp.telegram_access_tokens RENAME COLUMN unavailable_used_at TO used_at`;
  }
});
