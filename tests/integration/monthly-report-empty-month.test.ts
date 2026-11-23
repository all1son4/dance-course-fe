import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { after, before } from "node:test";

import postgres from "postgres";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
// Read when the report module loads, so it is set before the dynamic import.
process.env.RESEND_REPLY_TO = "reports@example.test";
const client = postgres(databaseUrl, { max: 2, prepare: false });

// A month long before any fixture: no file of the suite writes sales into it.
const MONTH = "2001-01";
const REPORT_KEY = "monthly_sales:2001-01-01:2001-02-01";

let report: typeof import("@/lib/monthly-sales-report");
let applicationClient: ReturnType<typeof import("@/db/client").getDatabaseClient>;

before(async () => {
  report = await import("@/lib/monthly-sales-report");
  applicationClient = (await import("@/db/client")).getDatabaseClient();
});

after(async () => {
  await client`DELETE FROM monthly_report_runs WHERE report_key = ${REPORT_KEY}`;
  await Promise.all([client.end(), applicationClient.end()]);
});

test("a month without sales is recorded as skipped and sends nothing", async () => {
  const result = await report.generateAndDeliverMonthlySalesReport({
    referenceDate: new Date("2026-11-23T10:00:00.000Z"),
    reportMonth: MONTH,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.skippedReason, "empty");
  assert.equal(result.rowCount, 0);

  const [run] = await client<
    {
      csv_sha256: string;
      delivered_at_utc: Date | null;
      delivered_to: string;
      delivery_status: string;
      period_end_utc: Date;
      period_start_utc: Date;
      report_family: string;
      row_count: number;
    }[]
  >`SELECT csv_sha256, delivered_at_utc, delivered_to, delivery_status, period_end_utc,
      period_start_utc, report_family, row_count
    FROM monthly_report_runs WHERE report_key = ${REPORT_KEY}`;

  assert.ok(run);
  assert.equal(run.delivery_status, "skipped");
  assert.equal(run.delivered_at_utc, null);
  assert.equal(run.delivered_to, "reports@example.test");
  assert.equal(run.report_family, "monthly_sales");
  assert.equal(run.row_count, 0);
  assert.equal(run.csv_sha256, createHash("sha256").update(result.csv).digest("hex"));
  assert.equal(run.period_start_utc.toISOString(), "2000-12-31T23:00:00.000Z");
  assert.equal(run.period_end_utc.toISOString(), "2001-01-31T23:00:00.000Z");
});
