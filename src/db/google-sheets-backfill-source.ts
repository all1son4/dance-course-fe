import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
  type EmailCampaignLeadSheetRecord,
  MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
  type MonthlySalesReportRunSheetRecord,
  PAYMENT_SHEET_HEADERS,
  type PaymentSheetRecord,
  STRIPE_EVENT_SHEET_HEADERS,
  type StripeEventSheetRecord,
  SUCCESSFUL_CUSTOMERS_SHEET_HEADERS,
  type SuccessfulCustomersSheetRecord,
  TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
  TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
  type TelegramAccessTokenSheetRecord,
  type TelegramUserBindingSheetRecord,
} from "@/lib/google-sheets-schema";

export const GOOGLE_SHEETS_BACKFILL_KEY = "google-sheets-v1";
export const DEFAULT_GOOGLE_SHEETS_BACKFILL_BATCH_SIZE = 25;
export const MAX_GOOGLE_SHEETS_BACKFILL_BATCH_SIZE = 500;

export const GOOGLE_SHEETS_BACKFILL_STAGES = [
  "payments",
  "stripeEvents",
  "telegramAccessTokens",
  "telegramUserBindings",
  "monthlyReportRuns",
  "emailCampaignLeads",
] as const;

export type GoogleSheetsBackfillStage = (typeof GOOGLE_SHEETS_BACKFILL_STAGES)[number];
export type GoogleSheetsBackfillTarget = "development" | "production";

export type GoogleSheetsBackfillRecords = {
  emailCampaignLeads: EmailCampaignLeadSheetRecord[];
  monthlyReportRuns: MonthlySalesReportRunSheetRecord[];
  payments: PaymentSheetRecord[];
  stripeEvents: StripeEventSheetRecord[];
  successfulCustomers: SuccessfulCustomersSheetRecord[];
  telegramAccessTokens: TelegramAccessTokenSheetRecord[];
  telegramUserBindings: TelegramUserBindingSheetRecord[];
};

export type GoogleSheetsBackfillOperationCounts = {
  conflicts: number;
  inserted: number;
  skipped: number;
  updated: number;
};

export type GoogleSheetsBackfillStats = Record<
  GoogleSheetsBackfillStage,
  GoogleSheetsBackfillOperationCounts
>;

export type GoogleSheetsBackfillSource = {
  captureId: string;
  captureStartedAt: Date;
  cutOffAt: Date;
  fingerprint: string;
  records: GoogleSheetsBackfillRecords;
  rowCounts: Record<keyof GoogleSheetsBackfillRecords, number>;
  spreadsheetIdSha256: string;
  target: GoogleSheetsBackfillTarget;
};

type BackfillRecord = GoogleSheetsBackfillRecords[GoogleSheetsBackfillStage][number];

export type GoogleSheetsBackfillBatch = {
  completed: boolean;
  endIndex: number;
  nextRowIndex: number;
  nextStage: GoogleSheetsBackfillStage;
  records: Array<{ index: number; record: BackfillRecord }>;
  stage: GoogleSheetsBackfillStage;
  startIndex: number;
};

type SnapshotSheetDefinition = {
  headers: readonly string[];
  recordKey: keyof GoogleSheetsBackfillRecords;
  snapshotKey: string;
};

const SNAPSHOT_SHEET_DEFINITIONS: readonly SnapshotSheetDefinition[] = [
  { headers: PAYMENT_SHEET_HEADERS, recordKey: "payments", snapshotKey: "payments" },
  {
    headers: STRIPE_EVENT_SHEET_HEADERS,
    recordKey: "stripeEvents",
    snapshotKey: "stripeEvents",
  },
  {
    headers: SUCCESSFUL_CUSTOMERS_SHEET_HEADERS,
    recordKey: "successfulCustomers",
    snapshotKey: "successfulCustomers",
  },
  {
    headers: TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
    recordKey: "telegramAccessTokens",
    snapshotKey: "telegramAccessTokens",
  },
  {
    headers: TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
    recordKey: "telegramUserBindings",
    snapshotKey: "telegramUserBindings",
  },
  {
    headers: MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
    recordKey: "monthlyReportRuns",
    snapshotKey: "monthlySalesReportRuns",
  },
  {
    headers: EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
    recordKey: "emailCampaignLeads",
    snapshotKey: "emailCampaignLeads",
  },
];

const MAX_SNAPSHOT_FILE_BYTES = 64 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getRequiredString = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`snapshot_invalid_string:${field}`);
  }

  return value.trim();
};

const getRequiredDate = (value: unknown, field: string) => {
  const stringValue = getRequiredString(value, field);
  const timestamp = Date.parse(stringValue);

  if (!Number.isFinite(timestamp)) {
    throw new Error(`snapshot_invalid_date:${field}`);
  }

  return new Date(timestamp);
};

const getRequiredSha256 = (value: unknown, field: string) => {
  const sha256 = getRequiredString(value, field).toLowerCase();

  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error(`snapshot_invalid_sha256:${field}`);
  }

  return sha256;
};

const assertPrivateRegularFile = async (path: string) => {
  const file = await lstat(path);

  if (!file.isFile() || file.isSymbolicLink()) {
    throw new Error(`snapshot_source_not_regular_file:${path}`);
  }

  if ((file.mode & 0o077) !== 0) {
    throw new Error(`snapshot_source_permissions_too_broad:${path}`);
  }

  if (file.size > MAX_SNAPSHOT_FILE_BYTES) {
    throw new Error(`snapshot_source_too_large:${path}`);
  }
};

const parseJsonObject = (bytes: Buffer, field: string) => {
  let value: unknown;

  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`snapshot_invalid_json:${field}`);
  }

  if (!isObject(value)) {
    throw new Error(`snapshot_invalid_object:${field}`);
  }

  return value;
};

const assertStringArrayEqual = ({
  actual,
  expected,
  field,
}: {
  actual: unknown;
  expected: readonly string[];
  field: string;
}) => {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`snapshot_schema_mismatch:${field}`);
  }
};

const mapRowToRecord = <T extends string>(headers: readonly T[], row: string[]) =>
  Object.fromEntries(
    headers.map((header, index) => [header, row[index] ?? ""]),
  ) as Record<T, string>;

const parseSnapshotSheet = ({
  definition,
  sheet,
}: {
  definition: SnapshotSheetDefinition;
  sheet: unknown;
}) => {
  if (!isObject(sheet)) {
    throw new Error(`snapshot_sheet_invalid:${definition.snapshotKey}`);
  }

  if (sheet.key !== definition.snapshotKey) {
    throw new Error(`snapshot_sheet_key_mismatch:${definition.snapshotKey}`);
  }

  assertStringArrayEqual({
    actual: sheet.expectedColumns,
    expected: definition.headers,
    field: definition.snapshotKey,
  });

  if (!Array.isArray(sheet.values)) {
    throw new Error(`snapshot_sheet_values_invalid:${definition.snapshotKey}`);
  }

  const values = sheet.values.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.some((cell) => typeof cell !== "string")) {
      throw new Error(`snapshot_sheet_row_invalid:${definition.snapshotKey}:${rowIndex}`);
    }

    if (row.length > definition.headers.length) {
      throw new Error(
        `snapshot_sheet_row_too_wide:${definition.snapshotKey}:${rowIndex}`,
      );
    }

    return row as string[];
  });
  const records = values
    .slice(1)
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) => mapRowToRecord(definition.headers, row));

  if (
    sheet.columnCount !== definition.headers.length ||
    sheet.rowCount !== records.length
  ) {
    throw new Error(`snapshot_sheet_count_mismatch:${definition.snapshotKey}`);
  }

  return records;
};

const getManifestSourceEvidence = (manifest: Record<string, unknown>) => {
  const googleSheets = manifest.googleSheets;

  if (!isObject(googleSheets) || !isObject(googleSheets.file)) {
    throw new Error("snapshot_manifest_google_sheets_invalid");
  }

  if (
    getRequiredString(googleSheets.file.file, "googleSheets.file.file") !==
    "google-sheets.json"
  ) {
    throw new Error("snapshot_google_sheets_filename_mismatch");
  }

  if (!Array.isArray(googleSheets.sheetCounts)) {
    throw new Error("snapshot_manifest_sheet_counts_invalid");
  }

  const sheetCounts = new Map<string, number>();

  for (const item of googleSheets.sheetCounts) {
    if (!isObject(item)) {
      throw new Error("snapshot_manifest_sheet_count_invalid");
    }

    const key = getRequiredString(item.key, "googleSheets.sheetCounts.key");

    if (
      !Number.isInteger(item.rowCount) ||
      (item.rowCount as number) < 0 ||
      sheetCounts.has(key)
    ) {
      throw new Error(`snapshot_manifest_sheet_count_invalid:${key}`);
    }

    sheetCounts.set(key, item.rowCount as number);
  }

  return {
    sha256: getRequiredSha256(googleSheets.file.sha256, "googleSheets.file.sha256"),
    sheetCounts,
    spreadsheetIdSha256: getRequiredSha256(
      googleSheets.spreadsheetIdSha256,
      "googleSheets.spreadsheetIdSha256",
    ),
  };
};

export const loadGoogleSheetsBackfillSource = async ({
  directory,
  expectedTarget,
}: {
  directory: string;
  expectedTarget: GoogleSheetsBackfillTarget;
}): Promise<GoogleSheetsBackfillSource> => {
  const sourceDirectory = resolve(process.cwd(), directory);
  const manifestPath = join(sourceDirectory, "manifest.json");
  const sheetsPath = join(sourceDirectory, "google-sheets.json");

  await Promise.all([
    assertPrivateRegularFile(manifestPath),
    assertPrivateRegularFile(sheetsPath),
  ]);

  const [manifestBytes, sheetsBytes] = await Promise.all([
    readFile(manifestPath),
    readFile(sheetsPath),
  ]);
  const manifest = parseJsonObject(manifestBytes, "manifest");
  const snapshot = parseJsonObject(sheetsBytes, "google-sheets");

  if (manifest.schemaVersion !== 1 || snapshot.schemaVersion !== 1) {
    throw new Error("snapshot_schema_version_unsupported");
  }

  const target = getRequiredString(manifest.target, "target");

  if (target !== expectedTarget) {
    throw new Error(
      `snapshot_target_mismatch:expected:${expectedTarget}:actual:${target}`,
    );
  }

  if (target !== "development" && target !== "production") {
    throw new Error("snapshot_target_invalid");
  }

  const sourceEvidence = getManifestSourceEvidence(manifest);
  const fingerprint = createHash("sha256").update(sheetsBytes).digest("hex");

  if (fingerprint !== sourceEvidence.sha256) {
    throw new Error("snapshot_google_sheets_checksum_mismatch");
  }

  const spreadsheetIdSha256 = getRequiredSha256(
    snapshot.spreadsheetIdSha256,
    "spreadsheetIdSha256",
  );

  if (spreadsheetIdSha256 !== sourceEvidence.spreadsheetIdSha256) {
    throw new Error("snapshot_spreadsheet_fingerprint_mismatch");
  }

  if (!Array.isArray(snapshot.sheets)) {
    throw new Error("snapshot_sheets_invalid");
  }

  if (snapshot.sheets.length !== SNAPSHOT_SHEET_DEFINITIONS.length) {
    throw new Error("snapshot_sheet_set_mismatch");
  }

  const snapshotSheets = snapshot.sheets;
  const parsedRecords = Object.fromEntries(
    SNAPSHOT_SHEET_DEFINITIONS.map((definition) => {
      const matchingSheets = snapshotSheets.filter(
        (sheet) => isObject(sheet) && sheet.key === definition.snapshotKey,
      );

      if (matchingSheets.length !== 1) {
        throw new Error(`snapshot_sheet_occurrence_mismatch:${definition.snapshotKey}`);
      }

      return [
        definition.recordKey,
        parseSnapshotSheet({ definition, sheet: matchingSheets[0] }),
      ];
    }),
  ) as GoogleSheetsBackfillRecords;

  if (sourceEvidence.sheetCounts.size !== SNAPSHOT_SHEET_DEFINITIONS.length) {
    throw new Error("snapshot_manifest_sheet_set_mismatch");
  }

  for (const definition of SNAPSHOT_SHEET_DEFINITIONS) {
    if (
      sourceEvidence.sheetCounts.get(definition.snapshotKey) !==
      parsedRecords[definition.recordKey].length
    ) {
      throw new Error(`snapshot_manifest_sheet_count_mismatch:${definition.snapshotKey}`);
    }
  }

  const captureStartedAt = getRequiredDate(snapshot.captureStartedAt, "captureStartedAt");
  const captureCompletedAt = getRequiredDate(
    snapshot.captureCompletedAt,
    "captureCompletedAt",
  );
  const cutOffAt = getRequiredDate(manifest.cutOffAt, "cutOffAt");
  const captureWindow = manifest.captureWindow;

  if (!isObject(captureWindow)) {
    throw new Error("snapshot_manifest_capture_window_invalid");
  }

  const manifestCaptureStartedAt = getRequiredDate(
    captureWindow.startedAt,
    "captureWindow.startedAt",
  );
  const manifestCaptureCompletedAt = getRequiredDate(
    captureWindow.completedAt,
    "captureWindow.completedAt",
  );

  if (
    manifestCaptureStartedAt > captureStartedAt ||
    captureStartedAt > captureCompletedAt ||
    captureCompletedAt > manifestCaptureCompletedAt ||
    manifestCaptureCompletedAt.getTime() !== cutOffAt.getTime()
  ) {
    throw new Error("snapshot_capture_window_invalid");
  }

  return {
    captureId: getRequiredString(manifest.captureId, "captureId"),
    captureStartedAt,
    cutOffAt,
    fingerprint,
    records: parsedRecords,
    rowCounts: Object.fromEntries(
      Object.entries(parsedRecords).map(([key, records]) => [key, records.length]),
    ) as GoogleSheetsBackfillSource["rowCounts"],
    spreadsheetIdSha256,
    target,
  };
};

export const createEmptyGoogleSheetsBackfillStats = (): GoogleSheetsBackfillStats =>
  Object.fromEntries(
    GOOGLE_SHEETS_BACKFILL_STAGES.map((stage) => [
      stage,
      { conflicts: 0, inserted: 0, skipped: 0, updated: 0 },
    ]),
  ) as GoogleSheetsBackfillStats;

export const getGoogleSheetsBackfillStageRecords = (
  records: GoogleSheetsBackfillRecords,
  stage: GoogleSheetsBackfillStage,
) => records[stage] as BackfillRecord[];

export const getGoogleSheetsBackfillRecordKey = (
  stage: GoogleSheetsBackfillStage,
  record: BackfillRecord,
) => {
  const values = record as Record<string, string>;

  switch (stage) {
    case "payments":
      return values.payment_intent_id?.trim() ?? "";
    case "stripeEvents":
      return values.event_id?.trim() ?? "";
    case "telegramAccessTokens":
      return values.token_id?.trim() ?? "";
    case "telegramUserBindings": {
      const paymentIntentId = values.payment_intent_id?.trim() ?? "";
      const chatId = values.chat_id?.trim() ?? "";

      return paymentIntentId && chatId ? `${paymentIntentId}\u0000${chatId}` : "";
    }
    case "monthlyReportRuns":
      return values.report_key?.trim() ?? "";
    case "emailCampaignLeads":
      return values.lead_id?.trim() ?? "";
  }
};

export const getGoogleSheetsBackfillDuplicateIndexes = (
  records: GoogleSheetsBackfillRecords,
  stage: GoogleSheetsBackfillStage,
) => {
  const indexesByKey = new Map<string, number[]>();

  for (const [index, record] of getGoogleSheetsBackfillStageRecords(
    records,
    stage,
  ).entries()) {
    const key = getGoogleSheetsBackfillRecordKey(stage, record);

    if (!key) {
      continue;
    }

    const indexes = indexesByKey.get(key) ?? [];
    indexes.push(index);
    indexesByKey.set(key, indexes);
  }

  return new Set(
    Array.from(indexesByKey.values())
      .filter((indexes) => indexes.length > 1)
      .flat(),
  );
};

export const getGoogleSheetsBackfillPlan = (records: GoogleSheetsBackfillRecords) =>
  Object.fromEntries(
    GOOGLE_SHEETS_BACKFILL_STAGES.map((stage) => {
      const stageRecords = getGoogleSheetsBackfillStageRecords(records, stage);
      const duplicateIndexes = getGoogleSheetsBackfillDuplicateIndexes(records, stage);
      const missingKeys = stageRecords.filter(
        (record) => !getGoogleSheetsBackfillRecordKey(stage, record),
      ).length;

      return [
        stage,
        {
          conflicts: duplicateIndexes.size,
          missingKeys,
          rows: stageRecords.length,
          uniqueKeys: stageRecords.length - duplicateIndexes.size - missingKeys,
        },
      ];
    }),
  );

const getStageIndex = (stage: GoogleSheetsBackfillStage) => {
  const index = GOOGLE_SHEETS_BACKFILL_STAGES.indexOf(stage);

  if (index < 0) {
    throw new Error(`backfill_stage_invalid:${stage}`);
  }

  return index;
};

export const getNextGoogleSheetsBackfillBatch = ({
  batchSize,
  nextRowIndex,
  records,
  stage,
}: {
  batchSize: number;
  nextRowIndex: number;
  records: GoogleSheetsBackfillRecords;
  stage: GoogleSheetsBackfillStage;
}): GoogleSheetsBackfillBatch => {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("backfill_batch_size_invalid");
  }

  if (!Number.isInteger(nextRowIndex) || nextRowIndex < 0) {
    throw new Error("backfill_checkpoint_invalid");
  }

  let stageIndex = getStageIndex(stage);
  let rowIndex = nextRowIndex;

  while (stageIndex < GOOGLE_SHEETS_BACKFILL_STAGES.length) {
    const currentStage = GOOGLE_SHEETS_BACKFILL_STAGES[stageIndex];
    const stageRecords = getGoogleSheetsBackfillStageRecords(records, currentStage);

    if (rowIndex > stageRecords.length) {
      throw new Error(`backfill_checkpoint_out_of_range:${currentStage}`);
    }

    if (rowIndex < stageRecords.length) {
      const endIndex = Math.min(rowIndex + batchSize, stageRecords.length);
      const isLastBatchForStage = endIndex === stageRecords.length;
      let nextStageIndex = isLastBatchForStage ? stageIndex + 1 : stageIndex;

      while (
        nextStageIndex < GOOGLE_SHEETS_BACKFILL_STAGES.length &&
        getGoogleSheetsBackfillStageRecords(
          records,
          GOOGLE_SHEETS_BACKFILL_STAGES[nextStageIndex],
        ).length === 0
      ) {
        nextStageIndex += 1;
      }

      const completed = nextStageIndex === GOOGLE_SHEETS_BACKFILL_STAGES.length;
      const nextStage = completed
        ? currentStage
        : GOOGLE_SHEETS_BACKFILL_STAGES[nextStageIndex];

      return {
        completed,
        endIndex,
        nextRowIndex: isLastBatchForStage ? 0 : endIndex,
        nextStage,
        records: stageRecords
          .slice(rowIndex, endIndex)
          .map((record, offset) => ({ index: rowIndex + offset, record })),
        stage: currentStage,
        startIndex: rowIndex,
      };
    }

    stageIndex += 1;
    rowIndex = 0;
  }

  const lastStage = GOOGLE_SHEETS_BACKFILL_STAGES.at(-1);

  if (!lastStage) {
    throw new Error("backfill_stage_set_empty");
  }

  return {
    completed: true,
    endIndex: 0,
    nextRowIndex: 0,
    nextStage: lastStage,
    records: [],
    stage: lastStage,
    startIndex: 0,
  };
};
