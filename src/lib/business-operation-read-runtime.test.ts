import assert from "node:assert/strict";
import test from "node:test";

import {
  EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
  type EmailCampaignLeadSheetRecord,
  MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
  type MonthlySalesReportRunSheetRecord,
  PAYMENT_SHEET_HEADERS,
  type PaymentSheetRecord,
} from "@/lib/google-sheets-schema";

import {
  type BusinessOperationReadDependencies,
  type BusinessOperationReadSource,
  findEmailCampaignLeadRecord,
  findInvoicePaymentRecordByIntentId,
  findMonthlyReportRunRecord,
  listEmailCampaignLeadReadRecords,
  listInvoicePaymentRecords,
} from "./business-operation-read-runtime";

const fromHeaders = <Header extends string>(headers: readonly Header[]) =>
  Object.fromEntries(headers.map((header) => [header, ""])) as Record<Header, string>;

const createInvoicePayment = (): PaymentSheetRecord => ({
  ...fromHeaders(PAYMENT_SHEET_HEADERS),
  invoice_issued_at: "2026-08-13T10:00:00.000Z",
  invoice_number: "FV/2026/08/001",
  payment_intent_id: "pi_invoice",
});

const createMonthlyReport = (): MonthlySalesReportRunSheetRecord => ({
  ...fromHeaders(MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS),
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

const createCampaignLead = (): EmailCampaignLeadSheetRecord => ({
  ...fromHeaders(EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS),
  campaign_key: "campaign_test",
  created_at: "2026-08-13T10:00:00.000Z",
  email: "customer@example.com",
  email_send_attempts: "0",
  email_send_status: "pending",
  full_name: "Customer",
  lead_id: "lead_test",
  locale: "en",
  social_contact: "@customer",
});

const createSource = (
  overrides: Partial<BusinessOperationReadSource> = {},
): BusinessOperationReadSource => ({
  findCampaignLead: async () => null,
  findInvoicePaymentByIntentId: async () => null,
  findMonthlyReportRun: async () => null,
  listCampaignLeads: async () => [],
  listInvoicePayments: async () => [],
  ...overrides,
});

const createDependencies = (
  database: Partial<BusinessOperationReadSource> = {},
): BusinessOperationReadDependencies => ({ database: createSource(database) });

test("always serves every business-operation read from PostgreSQL", async () => {
  const invoice = createInvoicePayment();
  const report = createMonthlyReport();
  const lead = createCampaignLead();
  const received = {
    campaign: null as { campaignKey: string; email: string } | null,
    invoiceIntent: "",
    reportKey: "",
  };
  const options = {
    dependencies: createDependencies({
      findCampaignLead: async (input) => {
        received.campaign = input;
        return lead;
      },
      findInvoicePaymentByIntentId: async (paymentIntentId) => {
        received.invoiceIntent = paymentIntentId;
        return invoice;
      },
      findMonthlyReportRun: async (reportKey) => {
        received.reportKey = reportKey;
        return report;
      },
      listCampaignLeads: async () => [lead],
      listInvoicePayments: async () => [invoice],
    }),
  };

  assert.equal(
    await findInvoicePaymentRecordByIntentId(invoice.payment_intent_id, options),
    invoice,
  );
  assert.deepEqual(await listInvoicePaymentRecords(options), [invoice]);
  assert.equal(await findMonthlyReportRunRecord(report.report_key, options), report);
  assert.equal(
    await findEmailCampaignLeadRecord(
      { campaignKey: lead.campaign_key, email: lead.email },
      options,
    ),
    lead,
  );
  assert.deepEqual(await listEmailCampaignLeadReadRecords(options), [lead]);
  assert.deepEqual(received, {
    campaign: { campaignKey: lead.campaign_key, email: lead.email },
    invoiceIntent: invoice.payment_intent_id,
    reportKey: report.report_key,
  });
});

test("keeps missing PostgreSQL business records missing", async () => {
  const options = { dependencies: createDependencies() };

  assert.equal(await findInvoicePaymentRecordByIntentId("pi_missing", options), null);
  assert.equal(await findMonthlyReportRunRecord("report_missing", options), null);
  assert.equal(
    await findEmailCampaignLeadRecord(
      { campaignKey: "campaign", email: "missing@example.com" },
      options,
    ),
    null,
  );
  assert.deepEqual(await listInvoicePaymentRecords(options), []);
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
