import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { buildOnlineGroupConfigurationReport } from "@/db/online-group-configuration-report";
import { readOnlineGroupConfigurationSnapshot } from "@/db/online-group-configuration-snapshot";
import { buildOnlineGroupPurchaseReport } from "@/db/online-group-purchase-report";
import { readOnlineGroupPurchaseSnapshot } from "@/db/online-group-purchase-snapshot";
import { readOnlineGroupReconciliationSnapshot } from "@/db/online-group-reconciliation-snapshot";
import * as schema from "@/db/schema";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), {
  connect_timeout: 5,
  max: 1,
  prepare: false,
});
const db = drizzle(client, { schema });
const cohortId = "10000000-0000-4000-8000-000000000001";
const purchaseId = "20000000-0000-4000-8000-000000000001";
const entitlementId = "30000000-0000-4000-8000-000000000001";
const tables = [
  "telegram_chats",
  "online_group_campaigns",
  "online_group_cohorts",
  "inspiration_hub_settings",
  "purchases",
  "access_entitlements",
  "telegram_user_bindings",
  "telegram_access_tokens",
] as const;

// A single connection makes all eight fixture tables private to this test file.
before(async () => {
  for (const table of tables) {
    await client`CREATE TEMP TABLE ${client(table)} (LIKE public.${client(table)} INCLUDING ALL)`;
  }
});

beforeEach(async () => {
  await client`TRUNCATE pg_temp.telegram_access_tokens, pg_temp.telegram_user_bindings,
    pg_temp.access_entitlements, pg_temp.purchases, pg_temp.inspiration_hub_settings,
    pg_temp.online_group_cohorts, pg_temp.online_group_campaigns, pg_temp.telegram_chats`;
});

after(async () => {
  await client.end({ timeout: 5 });
});

async function seedSnapshot(): Promise<void> {
  await client`INSERT INTO pg_temp.telegram_chats
    (chat_id, title, type, is_active, registered_by_telegram_username)
    VALUES ('main-a', 'Recorded Group', 'supergroup', true, 'private_registrar'),
      ('hub-a', 'Recorded Hub', 'supergroup', true, 'private_registrar')`;
  await client`INSERT INTO pg_temp.online_group_campaigns
    (title, regular_chat_id, library_chat_id, starts_at, status)
    VALUES ('Recorded Group', 'main-a', 'hub-a', '2026-09-01T10:00:00Z', 'active')`;
  await client`INSERT INTO pg_temp.online_group_cohorts
    (id, title, main_chat_id, starts_at)
    VALUES (${cohortId}, 'Actual Cohort', 'main-a', '2026-09-01T10:00:00Z')`;
  await client`INSERT INTO pg_temp.inspiration_hub_settings (telegram_chat_id)
    VALUES ('hub-a')`;
  await client`INSERT INTO pg_temp.purchases
    (id, payment_intent_id, product_external_id, offer_external_id,
      amount_minor, currency, stripe_status, outcome, online_group_cohort_id,
      telegram_user_id, customer_email_snapshot, succeeded_at,
      inspiration_chat_id_snapshot, inspiration_access_expires_at_snapshot)
    VALUES (${purchaseId}, 'pi_reconciliation_fixture', 'online-group', 'online-group-plus',
      4000, 'eur', 'succeeded', 'succeeded', ${cohortId}, '123',
      'private@example.test', '2026-08-31T10:00:00Z', 'hub-a', '2026-11-01T10:00:00Z')`;
  await client`INSERT INTO pg_temp.access_entitlements
    (id, purchase_id, access_key, status, telegram_chat_id, telegram_user_id,
      starts_at, expires_at)
    VALUES (${entitlementId}, ${purchaseId}, 'primary', 'activated', 'main-a', '123',
      '2026-09-01T10:00:00Z', '2026-11-01T10:00:00Z')`;
  await client`INSERT INTO pg_temp.telegram_user_bindings
    (purchase_id, entitlement_id, telegram_user_id, chat_id, status,
      bound_at, last_seen_at, invite_link)
    VALUES (${purchaseId}, ${entitlementId}, '123', 'main-a', 'active',
      '2026-09-01T10:00:00Z', '2026-09-02T10:00:00Z', 'https://t.me/+private_invitation')`;
  await client`INSERT INTO pg_temp.telegram_access_tokens
    (token_id, token_hash, token_value, purchase_id, entitlement_id,
      link_kind, chat_id, status, expires_at, used_at, telegram_user_id)
    VALUES ('private_token_identifier', 'private_token_hash', 'https://t.me/+private_invitation',
      ${purchaseId}, ${entitlementId}, 'channel_invite', 'main-a', 'used',
      '2026-10-01T10:00:00Z', '2026-09-01T10:00:00Z', '123')`;
}

async function storedRows() {
  const result: Record<string, readonly unknown[]> = {};
  for (const table of tables) {
    const key = table === "telegram_chats" ? "chat_id" : "id";
    result[table] =
      await client`SELECT * FROM pg_temp.${client(table)} ORDER BY ${client(key)}`;
  }
  return result;
}

test("reconciliation snapshot: empty tables produce both complete empty snapshots", async () => {
  assert.deepEqual(await readOnlineGroupReconciliationSnapshot(db), {
    configuration: { campaigns: [], chats: [], cohorts: [], hubSettings: null },
    purchases: { purchases: [], entitlements: [], bindings: [], tokens: [] },
  });
});

test("reconciliation snapshot: reuses both readers without dropping facts or exposing secrets", async () => {
  await seedSnapshot();
  const expectedConfiguration = await readOnlineGroupConfigurationSnapshot(db);
  const expectedPurchases = await readOnlineGroupPurchaseSnapshot(db);
  const snapshot = await readOnlineGroupReconciliationSnapshot(db);

  assert.deepEqual(snapshot, {
    configuration: expectedConfiguration,
    purchases: expectedPurchases,
  });
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /private_|example\.test|https:\/\/t\.me/u,
  );
});

test("reconciliation snapshot: one transaction supplies repeatable-read, read-only and both timeouts", async () => {
  type TransactionSettings = {
    isolation: string;
    readOnly: string;
    statementTimeout: string;
    lockTimeout: string;
  };
  let transactionCalls = 0;
  let observed: TransactionSettings | undefined;
  const observingDatabase: Pick<typeof db, "transaction"> = {
    transaction: (work, config) => {
      transactionCalls += 1;
      return db.transaction(async (tx) => {
        const result = await work(tx);
        const [settings] = await tx.execute<TransactionSettings>(sql`
          SELECT current_setting('transaction_isolation') AS isolation,
            current_setting('transaction_read_only') AS "readOnly",
            current_setting('statement_timeout') AS "statementTimeout",
            current_setting('lock_timeout') AS "lockTimeout"
        `);
        observed = settings;
        return result;
      }, config);
    },
  };

  await readOnlineGroupReconciliationSnapshot(observingDatabase);

  assert.equal(transactionCalls, 1);
  assert.deepEqual(observed, {
    isolation: "repeatable read",
    readOnly: "on",
    statementTimeout: "15s",
    lockTimeout: "2s",
  });
});

test("reconciliation snapshot: reading leaves all eight source tables unchanged", async () => {
  await seedSnapshot();
  const before = await storedRows();

  await readOnlineGroupReconciliationSnapshot(db);

  assert.deepEqual(await storedRows(), before);
});

test("reconciliation snapshot: configuration query errors reject the whole read", async () => {
  await seedSnapshot();
  await client`ALTER TABLE pg_temp.online_group_campaigns RENAME COLUMN title TO unavailable_title`;
  try {
    await assert.rejects(readOnlineGroupReconciliationSnapshot(db), (error: unknown) => {
      const cause = error instanceof Error && error.cause ? error.cause : error;
      return cause instanceof postgres.PostgresError && cause.code === "42703";
    });
  } finally {
    await client`ALTER TABLE pg_temp.online_group_campaigns RENAME COLUMN unavailable_title TO title`;
  }
});

test("reconciliation snapshot: the final purchase query error cannot return configuration alone", async () => {
  await seedSnapshot();
  await client`ALTER TABLE pg_temp.telegram_access_tokens RENAME COLUMN used_at TO unavailable_used_at`;
  try {
    await assert.rejects(readOnlineGroupReconciliationSnapshot(db), (error: unknown) => {
      const cause = error instanceof Error && error.cause ? error.cause : error;
      return cause instanceof postgres.PostgresError && cause.code === "42703";
    });
  } finally {
    await client`ALTER TABLE pg_temp.telegram_access_tokens RENAME COLUMN unavailable_used_at TO used_at`;
  }
});

test("reconciliation snapshot: both report builders consume their corresponding snapshot sections", async () => {
  await seedSnapshot();
  const snapshot = await readOnlineGroupReconciliationSnapshot(db);
  const configuration = buildOnlineGroupConfigurationReport(snapshot.configuration);
  const purchases = buildOnlineGroupPurchaseReport(snapshot.purchases);

  assert.equal(configuration.groups[0].cohort?.id, cohortId);
  assert.equal(configuration.groups[0].mainChatId, "main-a");
  assert.deepEqual(configuration.groups[0].issues, []);
  assert.deepEqual(configuration.hubIssues, []);
  assert.equal(purchases.purchases[0].purchase.onlineGroupCohortId, cohortId);
  assert.equal(purchases.purchases[0].identity.status, "consistent");
  assert.equal(purchases.purchases[0].identity.telegramUserId, "123");
  assert.deepEqual(purchases.purchases[0].tokenIssues, []);
  assert.deepEqual(purchases.recordsWithoutPurchase, {
    entitlements: [],
    bindings: [],
    tokens: [],
    tokenIssues: [],
  });
});
