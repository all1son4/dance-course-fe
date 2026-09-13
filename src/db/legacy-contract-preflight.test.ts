import assert from "node:assert/strict";
import test from "node:test";

import {
  type LegacyContractInventory,
  summarizeLegacyContractInventory,
} from "./legacy-contract-preflight";

const emptyInventory: LegacyContractInventory = {
  backfillRuns: 0,
  exportsWithLeases: 0,
  googleSheetsExports: 0,
  googleSheetsProviderRows: 0,
  incompleteBackfillRuns: 0,
  invoices: 0,
  invoicesWithPdfStorageKey: 0,
  purchaseExportTimestampDifferences: 0,
  successfulCustomerExports: 0,
  unexpectedGoogleSheetsProviders: 0,
  unversionedExportsNotTerminal: 0,
  versionedExportsNotTerminal: 0,
  visibleInviteHistoryTimestampDifferences: 0,
};

test("contract inventory is not release approval, even when data checks pass", () => {
  const result = summarizeLegacyContractInventory({
    ...emptyInventory,
    backfillRuns: 1,
    successfulCustomerExports: 29,
    unversionedExportsNotTerminal: 7,
  });
  assert.equal(result.dataChecksPassed, true);
  assert.deepEqual(result.dataBlockers, []);
  assert.match(result.scope, /not deletion or release approval/u);
  assert.equal(result.inventory.unversionedExportsNotTerminal, 7);
});

test("contract inventory stops for each preservation or active-work blocker", () => {
  const cases: [keyof LegacyContractInventory, string][] = [
    ["purchaseExportTimestampDifferences", "preserve_purchase_export_timestamps"],
    [
      "visibleInviteHistoryTimestampDifferences",
      "preserve_visible_invite_history_timestamps",
    ],
    ["versionedExportsNotTerminal", "resolve_retired_export_jobs"],
    ["exportsWithLeases", "resolve_retired_export_jobs"],
    ["unexpectedGoogleSheetsProviders", "review_unexpected_google_sheets_provider"],
    ["incompleteBackfillRuns", "resolve_incomplete_backfill_runs"],
    ["invoicesWithPdfStorageKey", "preserve_invoice_pdf_storage_keys"],
  ];
  for (const [field, blocker] of cases) {
    const result = summarizeLegacyContractInventory({ ...emptyInventory, [field]: 1 });
    assert.equal(result.dataChecksPassed, false, field);
    assert.deepEqual(result.dataBlockers, [blocker], field);
  }
});

test("contract inventory rejects invalid counts instead of declaring success", () => {
  for (const invoices of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => summarizeLegacyContractInventory({ ...emptyInventory, invoices }),
      /legacy_contract_inventory_invalid_count/u,
    );
  }
});
