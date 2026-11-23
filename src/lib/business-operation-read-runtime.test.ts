import assert from "node:assert/strict";
import test from "node:test";

import type { EmailCampaignLeadRecord } from "@/lib/email-campaign-record";
import type { MonthlySalesReportRunRecord } from "@/lib/monthly-sales-report-record";

import {
  type BusinessOperationReadDependencies,
  type BusinessOperationReadSource,
  findMonthlyReportRunRecord,
  listEmailCampaignLeadReadRecords,
} from "./business-operation-read-runtime";

const createMonthlyReport = (): MonthlySalesReportRunRecord => ({
  csv_sha256: "",
  delivered_at_utc: "2026-08-13T10:00:00.000Z",
  delivered_to: "owner@example.com",
  delivery_status: "sent",
  generated_at_utc: "2026-08-13T09:59:00.000Z",
  period_end_utc: "2026-08-01T00:00:00.000Z",
  period_start_utc: "2026-07-01T00:00:00.000Z",
  report_family: "monthly_sales",
  report_key: "monthly_sales:2026-07-01:2026-08-01",
  row_count: "3",
});

const createCampaignLead = (): EmailCampaignLeadRecord => ({
  campaign_key: "campaign_test",
  created_at: "2026-08-13T10:00:00.000Z",
  email: "customer@example.com",
  email_send_attempts: "0",
  email_send_status: "pending",
  email_sent_at: "",
  full_name: "Customer",
  lead_id: "lead_test",
  last_email_error: "",
  locale: "en",
  social_contact: "@customer",
});

const createSource = (
  overrides: Partial<BusinessOperationReadSource> = {},
): BusinessOperationReadSource => ({
  findMonthlyReportRun: async () => null,
  listCampaignLeads: async () => [],
  ...overrides,
});

const createDependencies = (
  database: Partial<BusinessOperationReadSource> = {},
): BusinessOperationReadDependencies => ({ database: createSource(database) });

test("always serves every business-operation read from PostgreSQL", async () => {
  const report = createMonthlyReport();
  const lead = createCampaignLead();
  const received = { reportKey: "" };
  const options = {
    dependencies: createDependencies({
      findMonthlyReportRun: async (reportKey) => {
        received.reportKey = reportKey;
        return report;
      },
      listCampaignLeads: async () => [lead],
    }),
  };

  assert.equal(await findMonthlyReportRunRecord(report.report_key, options), report);
  assert.deepEqual(await listEmailCampaignLeadReadRecords(options), [lead]);
  assert.deepEqual(received, { reportKey: report.report_key });
});

test("keeps missing PostgreSQL business records missing", async () => {
  const options = { dependencies: createDependencies() };

  assert.equal(await findMonthlyReportRunRecord("report_missing", options), null);
  assert.deepEqual(await listEmailCampaignLeadReadRecords(options), []);
});

test("fails closed when a PostgreSQL business read fails", async () => {
  const options = {
    dependencies: createDependencies({
      findMonthlyReportRun: async () => {
        throw new Error("database unavailable");
      },
    }),
  };

  await assert.rejects(
    findMonthlyReportRunRecord("monthly_sales:test", options),
    /database unavailable/u,
  );
});

test("campaign reads fail closed without an empty audience fallback", async () => {
  const fail = async () => {
    throw new Error("database unavailable");
  };
  const options = {
    dependencies: createDependencies({
      listCampaignLeads: fail,
    }),
  };
  await assert.rejects(
    listEmailCampaignLeadReadRecords(options),
    /database unavailable/u,
  );
});
