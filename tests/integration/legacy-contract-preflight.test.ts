import assert from "node:assert/strict";
import test from "node:test";

import postgres from "postgres";

import { readLegacyContractPreflight } from "@/db/legacy-contract-preflight";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

test("contract preflight inventories synthetic legacy data without modifying it", async () => {
  const queries: string[] = [];
  const client = postgres(getRequiredTestDatabaseUrl(), {
    debug: (_connection, query) => queries.push(query),
    max: 1,
    prepare: false,
  });
  // max: 1 keeps temporary tables on this test's single connection, including
  // the read-only transaction. A reserved postgres.js client has no begin().
  const connection = client;

  try {
    // Connection-local tables keep exact counts independent of parallel tests.
    // LIKE preserves the actual column types and checks, without public-table FKs.
    for (const table of [
      "purchases",
      "purchase_side_effects",
      "access_entitlements",
      "telegram_access_tokens",
      "invoices",
      "data_backfill_runs",
    ]) {
      await connection`CREATE TEMP TABLE ${connection(table)}
        (LIKE ${connection(`public.${table}`)} INCLUDING ALL)`;
    }

    const empty = await readLegacyContractPreflight(connection);
    assert.equal(empty.inviteHistoryDateColumnPresent, true);
    assert.equal(empty.dataChecksPassed, true);
    assert.ok(Object.values(empty.inventory).every((count) => count === 0));

    const [purchase] = await connection<{ id: string }[]>`
      INSERT INTO purchases (payment_intent_id, amount_minor, currency, stripe_status,
        outcome, first_seen_at, customer_email_snapshot)
      VALUES ('pi_contract_fixture', 1000, 'pln', 'succeeded', 'succeeded',
        '2026-08-01T10:00:00Z', 'private-fixture@example.invalid') RETURNING id
    `;
    await connection`
      INSERT INTO purchase_side_effects (purchase_id, deduplication_key, kind,
        provider, status, sent_at)
      VALUES (${purchase.id}, 'contract_sent', 'successful_customer_export',
        'google_sheets', 'sent', '2026-08-02T10:00:00Z')
    `;
    await connection`
      INSERT INTO purchase_side_effects (deduplication_key, kind, provider, status, payload)
      VALUES ('contract_inert', 'successful_customer_export', NULL, 'pending', '{}'),
        ('contract_active', 'google_sheets_export', 'google_sheets', 'failed', '{"_outboxVersion":1}'),
        ('contract_unexpected', 'purchase_success_email', 'google_sheets', 'sent', '{}')
    `;
    await connection`
      INSERT INTO access_entitlements (purchase_id, access_workflow, current_token_id)
      VALUES (${purchase.id}, 'admin-offer-link', 'contract_token')
    `;
    await connection`
      INSERT INTO telegram_access_tokens (purchase_id, token_id, token_hash, token_value,
        link_kind, status, expires_at)
      VALUES (${purchase.id}, 'contract_token', 'contract_hash', 'private-bearer-fixture',
        'channel_invite', 'issued', '2026-10-01T00:00:00Z')
    `;
    await connection`
      INSERT INTO invoices (purchase_id, invoice_number, issued_at, sequence_year,
        sequence_month, sequence_number, amount_minor, currency, pdf_storage_key)
      VALUES (${purchase.id}, 'FV/2096/01/001', '2096-01-01T00:00:00Z',
        2096, 1, 1, 1000, 'pln', '')
    `;
    await connection`
      INSERT INTO data_backfill_runs (backfill_key, target_environment, source_capture_id,
        source_fingerprint, source_cut_off_at, source_row_counts, batch_size, stage, stats)
      VALUES ('contract', 'development', 'private-capture-fixture', ${"a".repeat(64)},
        '2026-08-01T00:00:00Z', '{}', 10, 'payments', '{}')
    `;

    const snapshot = async () => {
      const [row] = await connection`
        SELECT
          (SELECT jsonb_agg(t) FROM purchases t) AS purchases,
          (SELECT jsonb_agg(t) FROM purchase_side_effects t) AS effects,
          (SELECT jsonb_agg(t) FROM access_entitlements t) AS entitlements,
          (SELECT jsonb_agg(t) FROM telegram_access_tokens t) AS tokens,
          (SELECT jsonb_agg(t) FROM invoices t) AS invoices,
          (SELECT jsonb_agg(t) FROM data_backfill_runs t) AS backfills
      `;
      return row;
    };
    const before = await snapshot();
    queries.length = 0;
    const result = await readLegacyContractPreflight(connection);
    assert.ok(queries.some((query) => /repeatable read read only/iu.test(query)));
    assert.ok(
      queries.every((query) => !/\b(insert|update|delete|alter|drop)\b/iu.test(query)),
    );
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(result.inventory, {
      backfillRuns: 1,
      exportsWithLeases: 0,
      googleSheetsExports: 1,
      googleSheetsProviderRows: 3,
      incompleteBackfillRuns: 1,
      invoices: 1,
      invoicesWithPdfStorageKey: 1,
      purchaseExportTimestampDifferences: 1,
      successfulCustomerExports: 2,
      unexpectedGoogleSheetsProviders: 1,
      unversionedExportsNotTerminal: 1,
      versionedExportsNotTerminal: 1,
      visibleInviteHistoryTimestampDifferences: 1,
    });
    assert.equal(result.dataChecksPassed, false);
    assert.equal(result.dataBlockers.length, 6);
    assert.doesNotMatch(JSON.stringify(result), /private-|pi_contract_fixture/u);

    await connection`UPDATE purchases SET invite_history_created_at = '2026-08-02T10:00:00Z'`;
    const preserved = await readLegacyContractPreflight(connection);
    assert.equal(preserved.inventory.purchaseExportTimestampDifferences, 0);
    assert.equal(preserved.inventory.visibleInviteHistoryTimestampDifferences, 0);
    assert.ok(!preserved.dataBlockers.includes("preserve_purchase_export_timestamps"));
    assert.ok(
      !preserved.dataBlockers.includes("preserve_visible_invite_history_timestamps"),
    );

    await connection`UPDATE purchases SET invite_history_created_at = '2026-08-03T10:00:00Z'`;
    const conflicting = await readLegacyContractPreflight(connection);
    assert.equal(conflicting.inventory.purchaseExportTimestampDifferences, 1);
    assert.equal(conflicting.inventory.visibleInviteHistoryTimestampDifferences, 1);
    await connection`UPDATE purchases SET invite_history_created_at = NULL`;

    // A preflight must remain runnable on both live databases before migration
    // 0019 is applied, without pretending that its new column already exists.
    await connection`ALTER TABLE pg_temp.purchases DROP COLUMN invite_history_created_at`;
    const beforeExpand = await readLegacyContractPreflight(connection);
    assert.equal(beforeExpand.inviteHistoryDateColumnPresent, false);
    assert.deepEqual(beforeExpand.inventory, result.inventory);

    // An invisible token stops contributing to visible history, but its purchase
    // timestamp still needs preserving in case a new token is issued later.
    await connection`UPDATE telegram_access_tokens SET token_value = '  '`;
    const invisible = await readLegacyContractPreflight(connection);
    assert.equal(invisible.inventory.visibleInviteHistoryTimestampDifferences, 0);
    assert.equal(invisible.inventory.purchaseExportTimestampDifferences, 1);

    await connection`UPDATE purchase_side_effects SET sent_at = '2026-08-01T10:00:00Z'
      WHERE deduplication_key = 'contract_sent'`;
    assert.equal(
      (await readLegacyContractPreflight(connection)).inventory
        .purchaseExportTimestampDifferences,
      0,
    );

    await connection`UPDATE purchase_side_effects SET status = 'sent',
      lease_token = 'private-lease-fixture' WHERE deduplication_key = 'contract_active'`;
    const leased = await readLegacyContractPreflight(connection);
    assert.equal(leased.inventory.versionedExportsNotTerminal, 0);
    assert.equal(leased.inventory.exportsWithLeases, 1);
    assert.ok(leased.dataBlockers.includes("resolve_retired_export_jobs"));

    await connection`ALTER TABLE pg_temp.invoices DROP COLUMN pdf_storage_key`;
    await assert.rejects(readLegacyContractPreflight(connection), { code: "42703" });
  } finally {
    // Closing this backend also removes only these temporary tables.
    await client.end();
  }
});
