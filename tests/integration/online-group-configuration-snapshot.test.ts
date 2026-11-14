import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  type OnlineGroupConfigurationSnapshot,
  readOnlineGroupConfigurationSnapshot,
} from "@/db/online-group-configuration-snapshot";
import * as schema from "@/db/schema";
import {
  inspirationHubSettings,
  onlineGroupCampaigns,
  onlineGroupCohorts,
  telegramChats,
} from "@/db/schema";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

// One connection keeps these temporary tables private to this test file, even
// while other integration files use the same PostgreSQL database in parallel.
const client = postgres(getRequiredTestDatabaseUrl(), {
  connect_timeout: 5,
  max: 1,
  prepare: false,
});
const db = drizzle(client, { schema });

before(async () => {
  await client`CREATE TEMP TABLE telegram_chats (LIKE public.telegram_chats INCLUDING ALL)`;
  await client`CREATE TEMP TABLE online_group_campaigns (LIKE public.online_group_campaigns INCLUDING ALL)`;
  await client`CREATE TEMP TABLE online_group_cohorts (LIKE public.online_group_cohorts INCLUDING ALL)`;
  await client`CREATE TEMP TABLE inspiration_hub_settings (LIKE public.inspiration_hub_settings INCLUDING ALL)`;
});

beforeEach(async () => {
  // Fully qualified names prevent a fixture failure from truncating public data.
  await client`TRUNCATE pg_temp.online_group_campaigns, pg_temp.online_group_cohorts, pg_temp.inspiration_hub_settings, pg_temp.telegram_chats`;
});

after(async () => {
  await client.end();
});

async function seedConfiguration(): Promise<OnlineGroupConfigurationSnapshot> {
  const chats: OnlineGroupConfigurationSnapshot["chats"] = [
    { chatId: "hub-a", title: "Old Hub", type: "supergroup", isActive: true },
    { chatId: "hub-b", title: "New Hub", type: "supergroup", isActive: true },
    { chatId: "main-a", title: "Group A", type: "supergroup", isActive: true },
    { chatId: "main-b", title: "Group B", type: "supergroup", isActive: false },
    { chatId: "unused-chat", title: "Unused", type: "channel", isActive: false },
  ];
  await db.insert(telegramChats).values(
    [...chats].reverse().map((chat) => ({
      ...chat,
      registeredByTelegramUserId: "123456789",
      registeredByTelegramUsername: "test_registrar",
    })),
  );

  const campaigns: OnlineGroupConfigurationSnapshot["campaigns"] = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      title: "Group A original",
      regularChatId: "main-a",
      libraryChatId: "hub-a",
      startsAt: new Date("2026-09-01T10:00:00Z"),
      status: "archived",
      createdAt: new Date("2026-08-01T10:00:00Z"),
    },
    {
      id: "10000000-0000-4000-8000-000000000002",
      title: "Group A edited",
      regularChatId: "main-a",
      libraryChatId: "hub-b",
      startsAt: new Date("2026-09-08T10:00:00Z"),
      status: "active",
      createdAt: new Date("2026-08-01T10:00:00Z"),
    },
    {
      id: "10000000-0000-4000-8000-000000000003",
      title: "Group B history",
      regularChatId: "main-b",
      libraryChatId: "hub-a",
      startsAt: new Date("2026-07-01T10:00:00Z"),
      status: "archived",
      createdAt: new Date("2026-08-02T10:00:00Z"),
    },
  ];
  await db.insert(onlineGroupCampaigns).values([...campaigns].reverse());

  const cohorts: OnlineGroupConfigurationSnapshot["cohorts"] = [
    {
      id: "20000000-0000-4000-8000-000000000001",
      title: "Existing newer cohort",
      mainChatId: "main-a",
      startsAt: new Date("2026-09-08T10:00:00Z"),
      previousCohortId: "20000000-0000-4000-8000-000000000002",
      closedAt: null,
      accessEndsAt: null,
      lessonsClearedAt: null,
      salesEnabled: false,
    },
    {
      id: "20000000-0000-4000-8000-000000000002",
      title: "Existing older cohort",
      mainChatId: "main-b",
      startsAt: new Date("2026-07-01T10:00:00Z"),
      previousCohortId: null,
      closedAt: new Date("2026-08-20T15:00:00Z"),
      accessEndsAt: new Date("2026-08-20T22:00:00Z"),
      lessonsClearedAt: new Date("2026-08-20T14:00:00Z"),
      salesEnabled: false,
    },
  ];
  await db.insert(onlineGroupCohorts).values([...cohorts].reverse());

  return { campaigns, chats, cohorts, hubSettings: null };
}

async function storedConfiguration() {
  return {
    chats: await client`SELECT * FROM pg_temp.telegram_chats ORDER BY chat_id`,
    campaigns: await client`SELECT * FROM pg_temp.online_group_campaigns ORDER BY id`,
    cohorts: await client`SELECT * FROM pg_temp.online_group_cohorts ORDER BY id`,
    hubSettings: await client`SELECT * FROM pg_temp.inspiration_hub_settings ORDER BY id`,
  };
}

test("configuration snapshot: an empty database returns empty lists and no invented Hub setting", async () => {
  assert.deepEqual(await readOnlineGroupConfigurationSnapshot(db), {
    campaigns: [],
    chats: [],
    cohorts: [],
    hubSettings: null,
  });
});

test("configuration snapshot: preserves archived versions, inactive and unused chats, and existing cohorts", async () => {
  const expected = await seedConfiguration();

  // Exact shape excludes registrar identities and unrelated audit fields.
  // Reversed inserts and tied campaign dates exercise explicit report ordering.
  assert.deepEqual(await readOnlineGroupConfigurationSnapshot(db), expected);
});

test("configuration snapshot: returns the recorded Hub setting independently and leaves stored data unchanged", async () => {
  const expected = await seedConfiguration();
  await db.insert(inspirationHubSettings).values({ telegramChatId: "hub-a" });
  const before = await storedConfiguration();

  // The active legacy campaign points at hub-b; preserve both facts for review.
  assert.deepEqual(await readOnlineGroupConfigurationSnapshot(db), {
    ...expected,
    hubSettings: { telegramChatId: "hub-a" },
  });
  assert.deepEqual(await storedConfiguration(), before);
});

test("configuration snapshot: PostgreSQL uses one repeatable-read, read-only transaction", async () => {
  let observedModes: { isolation: string; readOnly: string } | undefined;
  const observingDatabase: Pick<typeof db, "transaction"> = {
    transaction: (work, config) =>
      db.transaction(async (tx) => {
        const [modes] = await tx.execute<{ isolation: string; readOnly: string }>(sql`
          SELECT current_setting('transaction_isolation') AS isolation,
            current_setting('transaction_read_only') AS "readOnly"
        `);
        observedModes = modes;
        return work(tx);
      }, config),
  };

  await readOnlineGroupConfigurationSnapshot(observingDatabase);

  assert.deepEqual(observedModes, { isolation: "repeatable read", readOnly: "on" });
});

test("configuration snapshot: query failure is propagated instead of becoming an empty report", async () => {
  await client`ALTER TABLE pg_temp.telegram_chats RENAME COLUMN title TO unavailable_title`;

  try {
    await assert.rejects(readOnlineGroupConfigurationSnapshot(db), (error: unknown) => {
      const cause = error instanceof Error && error.cause ? error.cause : error;
      return cause instanceof postgres.PostgresError && cause.code === "42703";
    });
  } finally {
    await client`ALTER TABLE pg_temp.telegram_chats RENAME COLUMN unavailable_title TO title`;
  }
});
