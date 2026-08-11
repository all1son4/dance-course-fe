import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { promisify } from "node:util";

import postgres from "postgres";

import {
  EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
  MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
  PAYMENT_SHEET_HEADERS,
  STRIPE_EVENT_SHEET_HEADERS,
  SUCCESSFUL_CUSTOMERS_SHEET_HEADERS,
  TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
  TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
} from "@/lib/google-sheets-schema";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const execFileAsync = promisify(execFile);
const testDatabaseUrl = getRequiredTestDatabaseUrl();
const client = postgres(testDatabaseUrl, {
  max: 2,
  prepare: false,
});

after(async () => {
  await client.end();
});

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

const writeBackfillSource = async (paymentIntentIds: string[]) => {
  const directory = await mkdtemp(join(tmpdir(), "backfill-integration-"));
  const spreadsheetIdSha256 = "c".repeat(64);
  const snapshot = {
    captureCompletedAt: "2026-08-11T11:22:06.000Z",
    captureStartedAt: "2026-08-11T11:22:01.000Z",
    schemaVersion: 1,
    sheets: SHEET_DEFINITIONS.map(({ headers, key }) => {
      const rows =
        key === "payments"
          ? paymentIntentIds.map((paymentIntentId, index) =>
              createRow(headers, {
                amount: String(10_000 + index),
                currency: "pln",
                first_seen_at: `2026-08-0${index + 1}T10:00:00.000Z`,
                outcome: "succeeded",
                payment_intent_id: paymentIntentId,
                status: "succeeded",
                updated_at: `2026-08-0${index + 1}T10:01:00.000Z`,
              }),
            )
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
    spreadsheetIdSha256,
  };
  const sheetsBytes = Buffer.from(`${JSON.stringify(snapshot)}\n`, "utf8");
  const sheetsSha256 = createHash("sha256").update(sheetsBytes).digest("hex");
  const captureId = `development-integration-${randomUUID()}`;
  const manifest = {
    captureId,
    captureWindow: {
      completedAt: "2026-08-11T11:22:07.000Z",
      startedAt: "2026-08-11T11:22:00.000Z",
    },
    cutOffAt: "2026-08-11T11:22:07.000Z",
    googleSheets: {
      file: {
        file: "google-sheets.json",
        sha256: sheetsSha256,
      },
      sheetCounts: snapshot.sheets.map(({ key, rowCount }) => ({ key, rowCount })),
      spreadsheetIdSha256,
    },
    schemaVersion: 1,
    target: "development",
  };

  await Promise.all([
    writeFile(join(directory, "google-sheets.json"), sheetsBytes, { mode: 0o600 }),
    writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest)}\n`, {
      mode: 0o600,
    }),
  ]);
  await chmod(directory, 0o700);

  return {
    captureId,
    directory,
    sheetsSha256,
  };
};

const runBackfill = async ({
  directory,
  maxBatches,
}: {
  directory: string;
  maxBatches?: number;
}) => {
  const args = [
    "src/db/backfill-google-sheets.ts",
    "--write",
    "--target=development",
    "--confirmation=backfill-development",
    "--batch-size=1",
    `--source-dir=${directory}`,
  ];

  if (maxBatches !== undefined) {
    args.push(`--max-batches=${maxBatches}`);
  }

  return execFileAsync(join(process.cwd(), "node_modules/.bin/tsx"), args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_DEV_UNPOOLED: testDatabaseUrl,
      DATABASE_ENV: "development",
      NODE_ENV: "test",
    },
    timeout: 20_000,
  });
};

test("commits each bounded batch with its checkpoint and resumes safely", async () => {
  const suffix = randomUUID();
  const paymentIntentIds = [
    `pi_backfill_resume_first_${suffix}`,
    `pi_backfill_resume_second_${suffix}`,
  ];
  const source = await writeBackfillSource(paymentIntentIds);

  try {
    const firstRun = await runBackfill({
      directory: source.directory,
      maxBatches: 1,
    });
    const [pausedCheckpoint] = await client<
      {
        next_row_index: number;
        stats: Record<string, Record<string, number>>;
        status: string;
      }[]
    >`
      SELECT next_row_index, stats, status
      FROM data_backfill_runs
      WHERE source_fingerprint = ${source.sheetsSha256}
    `;
    const [firstPurchaseCount] = await client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM purchases
      WHERE payment_intent_id IN ${client(paymentIntentIds)}
    `;

    assert.match(firstRun.stderr, /"status":"paused"/u);
    assert.equal(pausedCheckpoint?.status, "running");
    assert.equal(pausedCheckpoint?.next_row_index, 1);
    assert.equal(pausedCheckpoint?.stats.payments?.inserted, 1);
    assert.equal(firstPurchaseCount?.count, 1);

    const resumedRun = await runBackfill({ directory: source.directory });
    const [completedCheckpoint] = await client<
      { stats: Record<string, Record<string, number>>; status: string }[]
    >`
      SELECT stats, status
      FROM data_backfill_runs
      WHERE source_fingerprint = ${source.sheetsSha256}
    `;
    const [completedPurchaseCount] = await client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM purchases
      WHERE payment_intent_id IN ${client(paymentIntentIds)}
    `;

    assert.match(resumedRun.stderr, /"status":"completed"/u);
    assert.equal(completedCheckpoint?.status, "completed");
    assert.equal(completedCheckpoint?.stats.payments?.inserted, 2);
    assert.equal(completedPurchaseCount?.count, 2);

    const replayRun = await runBackfill({ directory: source.directory });
    const [replayedPurchaseCount] = await client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM purchases
      WHERE payment_intent_id IN ${client(paymentIntentIds)}
    `;

    assert.match(replayRun.stderr, /"status":"already_completed"/u);
    assert.equal(replayedPurchaseCount?.count, 2);
  } finally {
    await client`
      DELETE FROM data_backfill_runs
      WHERE source_fingerprint = ${source.sheetsSha256}
    `;
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id IN ${client(paymentIntentIds)}
    `;
    await rm(source.directory, { force: true, recursive: true });
  }
});

test("records a conflict instead of overwriting a newer database row", async () => {
  const paymentIntentId = `pi_backfill_newer_database_${randomUUID()}`;
  const source = await writeBackfillSource([paymentIntentId]);

  await client`
    INSERT INTO purchases (
      payment_intent_id,
      amount_minor,
      currency,
      stripe_status,
      outcome,
      first_seen_at,
      updated_at
    ) VALUES (
      ${paymentIntentId},
      999,
      'pln',
      'succeeded',
      'succeeded',
      '2026-08-01T10:00:00Z',
      '2026-08-12T10:00:00Z'
    )
  `;

  try {
    const result = await runBackfill({ directory: source.directory });
    const [purchase] = await client<{ amount_minor: number }[]>`
      SELECT amount_minor
      FROM purchases
      WHERE payment_intent_id = ${paymentIntentId}
    `;
    const [checkpoint] = await client<
      { stats: Record<string, Record<string, number>>; status: string }[]
    >`
      SELECT stats, status
      FROM data_backfill_runs
      WHERE source_fingerprint = ${source.sheetsSha256}
    `;
    const [entitlementCount] = await client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM access_entitlements AS entitlement
      INNER JOIN purchases AS purchase ON purchase.id = entitlement.purchase_id
      WHERE purchase.payment_intent_id = ${paymentIntentId}
    `;

    assert.match(result.stderr, /"status":"completed"/u);
    assert.equal(checkpoint?.status, "completed");
    assert.equal(checkpoint?.stats.payments?.conflicts, 1);
    assert.equal(checkpoint?.stats.payments?.updated, 0);
    assert.equal(purchase?.amount_minor, 999);
    assert.equal(entitlementCount?.count, 0);
  } finally {
    await client`
      DELETE FROM data_backfill_runs
      WHERE source_fingerprint = ${source.sheetsSha256}
    `;
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id = ${paymentIntentId}
    `;
    await rm(source.directory, { force: true, recursive: true });
  }
});
