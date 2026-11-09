import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDeclaredMigrationPhase } from "@/db/migration-policy";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), {
  max: 1,
  prepare: false,
});

after(async () => {
  await client.end();
});

type SettingsFixture = {
  chatId: string;
  tx: postgres.TransactionSql;
};

// Each fixture rolls back, preserving any pre-existing test settings and chats.
const withSettingsFixture = async (
  run: (fixture: SettingsFixture) => Promise<void>,
): Promise<void> => {
  const rollback = new Error("rollback_hub_settings_fixture");

  try {
    await client.begin(async (tx) => {
      await tx`LOCK TABLE inspiration_hub_settings IN EXCLUSIVE MODE`;
      await tx`DELETE FROM inspiration_hub_settings`;

      const chatId = `hub_settings_test_${randomUUID()}`;
      await tx`
        INSERT INTO telegram_chats (chat_id, title, type)
        VALUES (${chatId}, 'Hub settings test', 'supergroup')
      `;

      await run({ chatId, tx });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
};

const hasPostgresCode =
  (code: string) =>
  (error: unknown): boolean =>
    error instanceof postgres.PostgresError && error.code === code;

test("the Hub settings migration is declared as an expand release", () => {
  const source = readFileSync("drizzle/0023_inspiration_hub_settings.sql", "utf8");

  assert.equal(getDeclaredMigrationPhase(source), "expand");
});

test("Hub settings can be saved for a registered chat with default ID and dates", async () => {
  await withSettingsFixture(async ({ chatId, tx }) => {
    const [settings] = await tx<
      { created_at: Date; id: number; telegram_chat_id: string; updated_at: Date }[]
    >`
      INSERT INTO inspiration_hub_settings (telegram_chat_id)
      VALUES (${chatId})
      RETURNING id, telegram_chat_id, created_at, updated_at
    `;

    assert.equal(settings.id, 1);
    assert.equal(settings.telegram_chat_id, chatId);
    assert.ok(settings.created_at instanceof Date);
    assert.ok(settings.updated_at instanceof Date);
  });
});

test("Hub settings reject a second row", async () => {
  await withSettingsFixture(async ({ chatId, tx }) => {
    await tx`
      INSERT INTO inspiration_hub_settings (telegram_chat_id)
      VALUES (${chatId})
    `;

    await assert.rejects(
      tx.savepoint(
        (attempt) => attempt`
        INSERT INTO inspiration_hub_settings (telegram_chat_id)
        VALUES (${chatId})
      `,
      ),
      hasPostgresCode("23505"),
    );

    const [result] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM inspiration_hub_settings
    `;
    assert.equal(result.count, 1);
  });
});

test("Hub settings reject an ID other than one", async () => {
  await withSettingsFixture(async ({ chatId, tx }) => {
    await assert.rejects(
      tx.savepoint(
        (attempt) => attempt`
        INSERT INTO inspiration_hub_settings (id, telegram_chat_id)
        VALUES (2, ${chatId})
      `,
      ),
      hasPostgresCode("23514"),
    );
  });
});

test("Hub settings require a chat ID", async () => {
  await withSettingsFixture(async ({ tx }) => {
    await assert.rejects(
      tx.savepoint(
        (attempt) => attempt`
        INSERT INTO inspiration_hub_settings (telegram_chat_id)
        VALUES (NULL)
      `,
      ),
      hasPostgresCode("23502"),
    );
  });
});

test("Hub settings reject an unregistered chat", async () => {
  await withSettingsFixture(async ({ tx }) => {
    const chatId = `hub_settings_test_${randomUUID()}`;

    await assert.rejects(
      tx.savepoint(
        (attempt) => attempt`
        INSERT INTO inspiration_hub_settings (telegram_chat_id)
        VALUES (${chatId})
      `,
      ),
      hasPostgresCode("23503"),
    );
  });
});

test("a configured Hub chat cannot be deleted while the settings reference it", async () => {
  await withSettingsFixture(async ({ chatId, tx }) => {
    await tx`
      INSERT INTO inspiration_hub_settings (telegram_chat_id)
      VALUES (${chatId})
    `;

    await assert.rejects(
      tx.savepoint(
        (attempt) => attempt`
        DELETE FROM telegram_chats WHERE chat_id = ${chatId}
      `,
      ),
      hasPostgresCode("23503"),
    );

    const [result] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM telegram_chats WHERE chat_id = ${chatId}
    `;
    assert.equal(result.count, 1);
  });
});
