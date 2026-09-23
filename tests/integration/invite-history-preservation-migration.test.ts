import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import postgres from "postgres";

import { getDeclaredMigrationPhase } from "@/db/migration-policy";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const migrationSource = readFileSync(
  "drizzle/0019_invite_history_created_at.sql",
  "utf8",
);
const migrationStatements = migrationSource.split("--> statement-breakpoint");

test("expand migration preserves exact dates, is non-overwriting and rejects conflicts atomically", async () => {
  assert.equal(getDeclaredMigrationPhase(migrationSource), "expand");
  const client = postgres(getRequiredTestDatabaseUrl(), { max: 1, prepare: false });

  try {
    // Reconstruct only the pre-expand tables on this connection. Other test
    // processes keep using public tables; no shared schema is altered here.
    await client`CREATE TEMP TABLE purchases (LIKE public.purchases INCLUDING ALL)`;
    await client`ALTER TABLE pg_temp.purchases DROP COLUMN invite_history_created_at`;
    await client`CREATE TEMP TABLE purchase_side_effects (LIKE public.purchase_side_effects INCLUDING ALL)`;
    await client`ALTER TABLE pg_temp.purchase_side_effects
      DROP CONSTRAINT purchase_side_effects_retired_values_check`;

    const purchaseIds: string[] = [];
    for (const name of [
      "microseconds",
      "without_export",
      "pending_export",
      "same_date",
      "other_kind",
    ]) {
      const [purchase] = await client<{ id: string }[]>`
        INSERT INTO purchases (payment_intent_id, amount_minor, currency, stripe_status,
          outcome, first_seen_at, succeeded_at, created_at, updated_at)
        VALUES (${`pi_preserve_${name}`}, 1250, 'pln', 'succeeded', 'succeeded',
          '2026-08-01T08:00:00.000123Z', '2026-08-01T08:01:00.000456Z',
          '2026-08-01T08:00:00.000123Z', '2026-09-01T10:00:00.000789Z') RETURNING id
      `;
      purchaseIds.push(purchase.id);
    }
    await client`
      INSERT INTO purchase_side_effects (purchase_id, deduplication_key, kind, status, sent_at)
      VALUES (${purchaseIds[0]}, 'precise', 'successful_customer_export', 'sent', '2026-08-02T11:00:00.123456+02:00'),
        (${purchaseIds[2]}, 'pending', 'successful_customer_export', 'pending', NULL),
        (${purchaseIds[3]}, 'same', 'successful_customer_export', 'sent', '2026-08-01T08:00:00.000123Z'),
        (${purchaseIds[4]}, 'other', 'purchase_success_email', 'sent', '2026-08-03T10:00:00Z')
    `;

    const unchangedFields = () => client`
      SELECT to_jsonb(purchase) - 'invite_history_created_at' AS fields
      FROM purchases purchase ORDER BY purchase.id
    `;
    const before = await unchangedFields();
    const effectsBefore =
      await client`SELECT to_jsonb(effect) AS fields FROM purchase_side_effects effect ORDER BY id`;

    await client.begin(async (transaction) => {
      for (const statement of migrationStatements) {
        await transaction.unsafe(statement);
      }
    });
    assert.deepEqual(await unchangedFields(), before);
    assert.deepEqual(
      await client`SELECT to_jsonb(effect) AS fields FROM purchase_side_effects effect ORDER BY id`,
      effectsBefore,
    );

    const [counts] = await client<{ preserved: number; different: number }[]>`
      SELECT count(*) FILTER (WHERE purchase.invite_history_created_at IS NOT NULL)::int AS preserved,
        count(*) FILTER (WHERE purchase.invite_history_created_at IS DISTINCT FROM effect.sent_at)::int AS different
      FROM purchases purchase
      LEFT JOIN purchase_side_effects effect
        ON effect.purchase_id = purchase.id AND effect.kind = 'successful_customer_export'
    `;
    assert.deepEqual(counts, { preserved: 2, different: 0 });
    const [precise] = await client<{ microseconds: number }[]>`
      SELECT extract(microseconds FROM invite_history_created_at)::int AS microseconds
      FROM purchases WHERE id = ${purchaseIds[0]}
    `;
    assert.equal(precise.microseconds, 123456);

    // Repeat just the data/verification statements; the migration journal keeps
    // the additive DDL once-only. A second backfill must update zero rows.
    await client.begin(async (transaction) => {
      const result = await transaction.unsafe(migrationStatements[1]);
      assert.equal(result.count, 0);
      await transaction.unsafe(migrationStatements[2]);
    });

    // Do not overwrite an existing conflicting timestamp. If another eligible
    // row is filled in the same transaction, verification must roll it back too.
    await client`UPDATE purchases SET invite_history_created_at = '2026-08-04T00:00:00Z' WHERE id = ${purchaseIds[0]}`;
    await client`UPDATE purchase_side_effects SET sent_at = '2026-08-04T00:00:00Z', status = 'sent' WHERE purchase_id = ${purchaseIds[2]}`;
    const snapshot =
      await client`SELECT id, invite_history_created_at FROM purchases ORDER BY id`;
    await assert.rejects(
      client.begin(async (transaction) => {
        for (const statement of migrationStatements.slice(1)) {
          await transaction.unsafe(statement);
        }
      }),
      /invite_history_timestamp_preservation_mismatch/u,
    );
    assert.deepEqual(
      await client`SELECT id, invite_history_created_at FROM purchases ORDER BY id`,
      snapshot,
    );
    assert.deepEqual(await unchangedFields(), before);
  } finally {
    await client.end();
  }
});
