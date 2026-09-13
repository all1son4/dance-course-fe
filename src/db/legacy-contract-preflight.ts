import type postgres from "postgres";

export type LegacyContractInventory = {
  backfillRuns: number;
  exportsWithLeases: number;
  googleSheetsExports: number;
  googleSheetsProviderRows: number;
  incompleteBackfillRuns: number;
  invoices: number;
  invoicesWithPdfStorageKey: number;
  purchaseExportTimestampDifferences: number;
  successfulCustomerExports: number;
  unexpectedGoogleSheetsProviders: number;
  unversionedExportsNotTerminal: number;
  versionedExportsNotTerminal: number;
  visibleInviteHistoryTimestampDifferences: number;
};

export const summarizeLegacyContractInventory = (inventory: LegacyContractInventory) => {
  if (
    Object.values(inventory).some((count) => !Number.isSafeInteger(count) || count < 0)
  ) {
    throw new Error("legacy_contract_inventory_invalid_count");
  }

  const dataBlockers: string[] = [];

  if (inventory.purchaseExportTimestampDifferences > 0) {
    dataBlockers.push("preserve_purchase_export_timestamps");
  }
  if (inventory.visibleInviteHistoryTimestampDifferences > 0) {
    dataBlockers.push("preserve_visible_invite_history_timestamps");
  }
  if (inventory.versionedExportsNotTerminal > 0 || inventory.exportsWithLeases > 0) {
    dataBlockers.push("resolve_retired_export_jobs");
  }
  if (inventory.unexpectedGoogleSheetsProviders > 0) {
    dataBlockers.push("review_unexpected_google_sheets_provider");
  }
  if (inventory.incompleteBackfillRuns > 0) {
    dataBlockers.push("resolve_incomplete_backfill_runs");
  }
  if (inventory.invoicesWithPdfStorageKey > 0) {
    dataBlockers.push("preserve_invoice_pdf_storage_keys");
  }

  return {
    dataBlockers,
    dataChecksPassed: dataBlockers.length === 0,
    inventory,
    scope: "pre-contract data audit only; not deletion or release approval" as const,
  };
};

// Use one read-only snapshot. This does not claim jobs, change flags, preserve
// timestamps, or authorize cleanup. It deliberately requires the pre-contract schema.
export const readLegacyContractPreflight = async (client: Pick<postgres.Sql, "begin">) =>
  client.begin("isolation level repeatable read read only", async (transaction) => {
    await transaction`SET LOCAL statement_timeout = '15s'`;
    await transaction`SET LOCAL lock_timeout = '2s'`;

    // The same preflight must work both before and after the additive migration.
    // Resolve the table through search_path, just like the queries below (also
    // supports connection-local integration fixtures). Never infer missing data.
    const [column] = await transaction<{ present: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'purchases'::regclass
          AND attname = 'invite_history_created_at'
          AND NOT attisdropped
      ) AS present
    `;
    const inviteHistoryDateColumnPresent = column?.present === true;
    const preservedDate = inviteHistoryDateColumnPresent
      ? transaction`purchase.invite_history_created_at`
      : transaction`NULL::timestamptz`;

    const [inventory] = await transaction<LegacyContractInventory[]>`
      WITH retired_exports AS (
        SELECT * FROM purchase_side_effects
        WHERE kind IN ('successful_customer_export', 'google_sheets_export')
      ), timestamp_differences AS (
        SELECT purchase.id
        FROM purchases purchase
        INNER JOIN purchase_side_effects effect
          ON effect.purchase_id = purchase.id
          AND effect.kind = 'successful_customer_export'
        WHERE effect.sent_at IS NOT NULL
          AND effect.sent_at IS DISTINCT FROM
            COALESCE(${preservedDate}, purchase.first_seen_at, purchase.updated_at)
      )
      SELECT
        (SELECT count(*)::int FROM retired_exports
          WHERE kind = 'successful_customer_export') AS "successfulCustomerExports",
        (SELECT count(*)::int FROM retired_exports
          WHERE kind = 'google_sheets_export') AS "googleSheetsExports",
        (SELECT count(*)::int FROM purchase_side_effects
          WHERE provider = 'google_sheets') AS "googleSheetsProviderRows",
        (SELECT count(*)::int FROM purchase_side_effects
          WHERE provider = 'google_sheets'
            AND kind NOT IN ('successful_customer_export', 'google_sheets_export'))
          AS "unexpectedGoogleSheetsProviders",
        (SELECT count(*)::int FROM retired_exports
          WHERE payload @> '{"_outboxVersion":1}'::jsonb
            AND status NOT IN ('sent', 'skipped')) AS "versionedExportsNotTerminal",
        (SELECT count(*)::int FROM retired_exports
          WHERE NOT (payload @> '{"_outboxVersion":1}'::jsonb)
            AND status NOT IN ('sent', 'skipped')) AS "unversionedExportsNotTerminal",
        (SELECT count(*)::int FROM retired_exports
          WHERE lease_token IS NOT NULL OR lease_expires_at IS NOT NULL)
          AS "exportsWithLeases",
        (SELECT count(*)::int FROM timestamp_differences)
          AS "purchaseExportTimestampDifferences",
        (SELECT count(*)::int FROM purchases purchase
          INNER JOIN access_entitlements entitlement
            ON entitlement.purchase_id = purchase.id AND entitlement.access_key = 'primary'
          INNER JOIN telegram_access_tokens token
            ON token.token_id = entitlement.current_token_id
          INNER JOIN purchase_side_effects effect
            ON effect.purchase_id = purchase.id AND effect.kind = 'successful_customer_export'
          WHERE NULLIF(BTRIM(entitlement.access_workflow), '') IS NOT NULL
            AND NULLIF(BTRIM(purchase.payment_intent_id), '') IS NOT NULL
            AND NULLIF(BTRIM(token.token_value), '') IS NOT NULL
            AND effect.sent_at IS NOT NULL
            AND effect.sent_at IS DISTINCT FROM
              COALESCE(${preservedDate}, purchase.first_seen_at, purchase.updated_at, token.created_at))
          AS "visibleInviteHistoryTimestampDifferences",
        (SELECT count(*)::int FROM invoices) AS "invoices",
        (SELECT count(*)::int FROM invoices WHERE pdf_storage_key IS NOT NULL)
          AS "invoicesWithPdfStorageKey",
        (SELECT count(*)::int FROM data_backfill_runs) AS "backfillRuns",
        (SELECT count(*)::int FROM data_backfill_runs
          WHERE status <> 'completed' OR completed_at IS NULL) AS "incompleteBackfillRuns"
    `;

    if (!inventory) {
      throw new Error("legacy_contract_inventory_missing");
    }

    return {
      capturedAt: new Date().toISOString(),
      inviteHistoryDateColumnPresent,
      ...summarizeLegacyContractInventory(inventory),
    };
  });
