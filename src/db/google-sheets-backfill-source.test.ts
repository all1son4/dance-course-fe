import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
  MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
  PAYMENT_SHEET_HEADERS,
  STRIPE_EVENT_SHEET_HEADERS,
  SUCCESSFUL_CUSTOMERS_SHEET_HEADERS,
  TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
  TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
} from "@/lib/google-sheets-schema";

import {
  createEmptyGoogleSheetsBackfillStats,
  getGoogleSheetsBackfillDuplicateIndexes,
  getGoogleSheetsBackfillPlan,
  getNextGoogleSheetsBackfillBatch,
  type GoogleSheetsBackfillRecords,
  loadGoogleSheetsBackfillSource,
} from "./google-sheets-backfill-source";

const SHEET_DEFINITIONS = [
  { headers: PAYMENT_SHEET_HEADERS, key: "payments" },
  { headers: STRIPE_EVENT_SHEET_HEADERS, key: "stripeEvents" },
  { headers: SUCCESSFUL_CUSTOMERS_SHEET_HEADERS, key: "successfulCustomers" },
  { headers: TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS, key: "telegramAccessTokens" },
  { headers: TELEGRAM_USER_BINDINGS_SHEET_HEADERS, key: "telegramUserBindings" },
  { headers: MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS, key: "monthlySalesReportRuns" },
  { headers: EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS, key: "emailCampaignLeads" },
] as const;

const createRow = (headers: readonly string[], values: Record<string, string>) =>
  headers.map((header) => values[header] ?? "");

const createSnapshot = () => ({
  captureCompletedAt: "2026-08-11T11:25:01.000Z",
  captureStartedAt: "2026-08-11T11:24:56.000Z",
  schemaVersion: 1,
  sheets: SHEET_DEFINITIONS.map(({ headers, key }) => {
    const rows =
      key === "payments"
        ? [
            createRow(headers, { payment_intent_id: "pi_first" }),
            createRow(headers, { payment_intent_id: "pi_second" }),
          ]
        : [];

    return {
      columnCount: headers.length,
      expectedColumns: headers,
      key,
      rowCount: rows.length,
      title: key,
      values: [Array.from(headers), ...rows],
    };
  }),
  spreadsheetIdSha256: "a".repeat(64),
});

const writeSnapshotFixture = async ({
  tamperChecksum = false,
  target = "production",
}: {
  tamperChecksum?: boolean;
  target?: "development" | "production";
} = {}) => {
  const directory = await mkdtemp(join(tmpdir(), "backfill-source-test-"));
  const snapshot = createSnapshot();
  const snapshotBytes = Buffer.from(`${JSON.stringify(snapshot)}\n`, "utf8");
  const sha256 = createHash("sha256").update(snapshotBytes).digest("hex");
  const manifest = {
    captureId: `${target}-fixture`,
    captureWindow: {
      completedAt: "2026-08-11T11:25:02.000Z",
      startedAt: "2026-08-11T11:24:55.000Z",
    },
    cutOffAt: "2026-08-11T11:25:02.000Z",
    googleSheets: {
      file: {
        file: "google-sheets.json",
        sha256: tamperChecksum ? "b".repeat(64) : sha256,
      },
      sheetCounts: snapshot.sheets.map(({ key, rowCount }) => ({ key, rowCount })),
      spreadsheetIdSha256: "a".repeat(64),
    },
    schemaVersion: 1,
    target,
  };

  await Promise.all([
    writeFile(join(directory, "google-sheets.json"), snapshotBytes, { mode: 0o600 }),
    writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest)}\n`, {
      mode: 0o600,
    }),
  ]);
  await chmod(directory, 0o700);

  return directory;
};

test("loads only a target-matched immutable DATA-01 source", async () => {
  const directory = await writeSnapshotFixture();

  try {
    const source = await loadGoogleSheetsBackfillSource({
      directory,
      expectedTarget: "production",
    });

    assert.equal(source.captureId, "production-fixture");
    assert.equal(source.records.payments.length, 2);
    assert.equal(source.records.payments[0]?.payment_intent_id, "pi_first");
    assert.equal(source.rowCounts.successfulCustomers, 0);
    assert.match(source.fingerprint, /^[a-f0-9]{64}$/u);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("rejects a snapshot checksum or target mismatch", async () => {
  const tamperedDirectory = await writeSnapshotFixture({ tamperChecksum: true });
  const developmentDirectory = await writeSnapshotFixture({ target: "development" });

  try {
    await assert.rejects(
      loadGoogleSheetsBackfillSource({
        directory: tamperedDirectory,
        expectedTarget: "production",
      }),
      /snapshot_google_sheets_checksum_mismatch/u,
    );
    await assert.rejects(
      loadGoogleSheetsBackfillSource({
        directory: developmentDirectory,
        expectedTarget: "production",
      }),
      /snapshot_target_mismatch/u,
    );
  } finally {
    await Promise.all([
      rm(tamperedDirectory, { force: true, recursive: true }),
      rm(developmentDirectory, { force: true, recursive: true }),
    ]);
  }
});

test("builds deterministic duplicate-safe batches and resumable checkpoints", () => {
  const records = {
    emailCampaignLeads: [],
    monthlyReportRuns: [],
    payments: [
      { payment_intent_id: "pi_duplicate" },
      { payment_intent_id: "pi_unique" },
      { payment_intent_id: "pi_duplicate" },
    ],
    stripeEvents: [{ event_id: "evt_after_payments" }],
    successfulCustomers: [],
    telegramAccessTokens: [],
    telegramUserBindings: [],
  } as unknown as GoogleSheetsBackfillRecords;
  const duplicateIndexes = getGoogleSheetsBackfillDuplicateIndexes(records, "payments");

  assert.deepEqual(Array.from(duplicateIndexes), [0, 2]);
  assert.deepEqual(getGoogleSheetsBackfillPlan(records).payments, {
    conflicts: 2,
    missingKeys: 0,
    rows: 3,
    uniqueKeys: 1,
  });

  const firstBatch = getNextGoogleSheetsBackfillBatch({
    batchSize: 2,
    nextRowIndex: 0,
    records,
    stage: "payments",
  });
  const resumedBatch = getNextGoogleSheetsBackfillBatch({
    batchSize: 2,
    nextRowIndex: firstBatch.nextRowIndex,
    records,
    stage: firstBatch.nextStage,
  });
  const nextStageBatch = getNextGoogleSheetsBackfillBatch({
    batchSize: 2,
    nextRowIndex: resumedBatch.nextRowIndex,
    records,
    stage: resumedBatch.nextStage,
  });

  assert.deepEqual(
    firstBatch.records.map(({ index }) => index),
    [0, 1],
  );
  assert.equal(resumedBatch.stage, "payments");
  assert.deepEqual(
    resumedBatch.records.map(({ index }) => index),
    [2],
  );
  assert.equal(nextStageBatch.stage, "stripeEvents");
  assert.equal(nextStageBatch.completed, true);
});

test("creates independent insert, update, skip, and conflict counters", () => {
  const stats = createEmptyGoogleSheetsBackfillStats();

  stats.payments.inserted += 1;
  stats.payments.updated += 2;
  stats.payments.skipped += 3;
  stats.payments.conflicts += 4;

  assert.deepEqual(stats.payments, {
    conflicts: 4,
    inserted: 1,
    skipped: 3,
    updated: 2,
  });
  assert.deepEqual(stats.stripeEvents, {
    conflicts: 0,
    inserted: 0,
    skipped: 0,
    updated: 0,
  });
});
