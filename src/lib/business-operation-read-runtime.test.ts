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
  type BusinessOperationReadShadowComparison,
  type BusinessOperationReadSource,
  findEmailCampaignLeadRecord,
  findInvoicePaymentRecordByIntentId,
  findMonthlyReportRunRecord,
  getBusinessOperationReadRuntime,
  listEmailCampaignLeadReadRecords,
  listInvoicePaymentRecords,
} from "./business-operation-read-runtime";

const fromHeaders = <Header extends string>(headers: readonly Header[]) =>
  Object.fromEntries(headers.map((header) => [header, ""])) as Record<Header, string>;

const createInvoicePayment = (
  overrides: Partial<PaymentSheetRecord> = {},
): PaymentSheetRecord => ({
  ...fromHeaders(PAYMENT_SHEET_HEADERS),
  invoice_issued_at: "2026-08-13T10:00:00.000Z",
  invoice_number: "FV/2026/08/001",
  payment_intent_id: "pi_invoice",
  ...overrides,
});

const createMonthlyReport = (
  overrides: Partial<MonthlySalesReportRunSheetRecord> = {},
): MonthlySalesReportRunSheetRecord => ({
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
  ...overrides,
});

const createCampaignLead = (
  overrides: Partial<EmailCampaignLeadSheetRecord> = {},
): EmailCampaignLeadSheetRecord => ({
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
  ...overrides,
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

const createDependencies = ({
  database = {},
  legacy = {},
  sheets = {},
}: {
  database?: Partial<BusinessOperationReadSource>;
  legacy?: Partial<BusinessOperationReadSource>;
  sheets?: Partial<BusinessOperationReadSource>;
} = {}): BusinessOperationReadDependencies => ({
  database: createSource(database),
  legacy: createSource(legacy),
  sheets: createSource(sheets),
});

test("selects business-operation read modes without changing write selection", () => {
  assert.equal(getBusinessOperationReadRuntime({}), "legacy");
  assert.equal(
    getBusinessOperationReadRuntime({ DB_BUSINESS_OPERATIONS_MODE: "shadow" }),
    "shadow",
  );
  assert.equal(
    getBusinessOperationReadRuntime({ DB_BUSINESS_OPERATIONS_MODE: "database" }),
    "database",
  );
  assert.throws(
    () => getBusinessOperationReadRuntime({ DB_BUSINESS_OPERATIONS_MODE: "invalid" }),
    /DB_BUSINESS_OPERATIONS_MODE must be one of/u,
  );
});

test("database mode serves every READ-04 record without legacy or Sheets calls", async () => {
  const invoice = createInvoicePayment();
  const report = createMonthlyReport();
  const lead = createCampaignLead();
  let nonDatabaseCalls = 0;
  const forbiddenSource = createSource({
    findCampaignLead: async () => {
      nonDatabaseCalls += 1;
      return lead;
    },
    findInvoicePaymentByIntentId: async () => {
      nonDatabaseCalls += 1;
      return invoice;
    },
    findMonthlyReportRun: async () => {
      nonDatabaseCalls += 1;
      return report;
    },
    listCampaignLeads: async () => {
      nonDatabaseCalls += 1;
      return [lead];
    },
    listInvoicePayments: async () => {
      nonDatabaseCalls += 1;
      return [invoice];
    },
  });
  const dependencies: BusinessOperationReadDependencies = {
    database: createSource({
      findCampaignLead: async () => lead,
      findInvoicePaymentByIntentId: async () => invoice,
      findMonthlyReportRun: async () => report,
      listCampaignLeads: async () => [lead],
      listInvoicePayments: async () => [invoice],
    }),
    legacy: forbiddenSource,
    sheets: forbiddenSource,
  };
  const options = {
    dependencies,
    environment: { DB_BUSINESS_OPERATIONS_MODE: "database" },
  };

  assert.equal(await findInvoicePaymentRecordByIntentId("pi_invoice", options), invoice);
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
  assert.equal(nonDatabaseCalls, 0);
});

test("database mode keeps missing records missing and fails closed on DB errors", async () => {
  let legacyCalls = 0;
  const dependencies = createDependencies({
    legacy: {
      findInvoicePaymentByIntentId: async () => {
        legacyCalls += 1;
        return createInvoicePayment();
      },
    },
  });
  const options = {
    dependencies,
    environment: { DB_BUSINESS_OPERATIONS_MODE: "database" },
  };

  assert.equal(await findInvoicePaymentRecordByIntentId("pi_missing", options), null);
  dependencies.database.findInvoicePaymentByIntentId = async () => {
    throw new Error("database unavailable");
  };
  await assert.rejects(
    findInvoicePaymentRecordByIntentId("pi_invoice", options),
    /database unavailable/u,
  );
  assert.equal(legacyCalls, 0);
});

test("legacy mode preserves the current result without shadow queries", async () => {
  const primary = createCampaignLead({ full_name: "Legacy primary" });
  let databaseCalls = 0;
  let sheetsCalls = 0;
  const result = await findEmailCampaignLeadRecord(
    { campaignKey: primary.campaign_key, email: primary.email },
    {
      dependencies: createDependencies({
        database: {
          findCampaignLead: async () => {
            databaseCalls += 1;
            return null;
          },
        },
        legacy: { findCampaignLead: async () => primary },
        sheets: {
          findCampaignLead: async () => {
            sheetsCalls += 1;
            return null;
          },
        },
      }),
      environment: { DB_BUSINESS_OPERATIONS_MODE: "legacy" },
    },
  );

  assert.equal(result, primary);
  assert.equal(databaseCalls, 0);
  assert.equal(sheetsCalls, 0);
});

test("shadow singles preserve legacy results and emit sanitized drift metadata", async () => {
  const primaryInvoice = createInvoicePayment({ invoice_number: "legacy-primary" });
  const primaryReport = createMonthlyReport({ delivery_status: "skipped" });
  const primaryLead = createCampaignLead({ full_name: "Legacy Primary" });
  const comparisons: BusinessOperationReadShadowComparison[] = [];
  const dependencies = createDependencies({
    database: {
      findCampaignLead: async () =>
        createCampaignLead({
          created_at: "2026-08-13T10:00:00.900Z",
          email: "CUSTOMER@EXAMPLE.COM",
          full_name: "Database Secret Name",
        }),
      findInvoicePaymentByIntentId: async () =>
        createInvoicePayment({ invoice_issued_at: "2026-08-13T10:00:00.900Z" }),
      findMonthlyReportRun: async () =>
        createMonthlyReport({ delivered_to: "OWNER@EXAMPLE.COM", row_count: "4" }),
    },
    legacy: {
      findCampaignLead: async () => primaryLead,
      findInvoicePaymentByIntentId: async () => primaryInvoice,
      findMonthlyReportRun: async () => primaryReport,
    },
    sheets: {
      findCampaignLead: async () =>
        createCampaignLead({
          created_at: "2026-08-13T10:00:00.100Z",
          full_name: "Sheets Secret Name",
        }),
      findInvoicePaymentByIntentId: async () =>
        createInvoicePayment({ invoice_issued_at: "2026-08-13T10:00:00.100Z" }),
      findMonthlyReportRun: async () => createMonthlyReport({ row_count: "3" }),
    },
  });
  const options = {
    dependencies,
    environment: { DB_BUSINESS_OPERATIONS_MODE: "shadow" },
    onShadowComparison: (comparison: BusinessOperationReadShadowComparison) =>
      comparisons.push(comparison),
  };

  assert.equal(
    await findInvoicePaymentRecordByIntentId("pi_private_lookup", options),
    primaryInvoice,
  );
  assert.equal(
    await findMonthlyReportRunRecord("private_report_key", options),
    primaryReport,
  );
  assert.equal(
    await findEmailCampaignLeadRecord(
      { campaignKey: "private_campaign", email: "private@example.com" },
      options,
    ),
    primaryLead,
  );

  assert.equal(comparisons[0].status, "match");
  assert.deepEqual(comparisons[1].differingFields, ["row_count"]);
  assert.deepEqual(comparisons[2].differingFields, ["full_name"]);
  assert.ok(comparisons.every(({ keyHash }) => /^[a-f0-9]{64}$/u.test(keyHash)));
  assert.doesNotMatch(
    JSON.stringify(comparisons),
    /private_lookup|private_report_key|private_campaign|private@example|Secret Name/u,
  );
});

test("shadow collections ignore order and compare only invoice-bearing payments", async () => {
  const invoice = createInvoicePayment();
  const secondInvoice = createInvoicePayment({
    invoice_number: "FV/2026/08/002",
    payment_intent_id: "pi_second",
  });
  const paymentWithoutInvoice = createInvoicePayment({
    invoice_issued_at: "",
    invoice_number: "",
    payment_intent_id: "pi_unrelated",
  });
  const firstLead = createCampaignLead();
  const secondLead = createCampaignLead({ lead_id: "lead_second" });
  const comparisons: BusinessOperationReadShadowComparison[] = [];
  const options = {
    dependencies: createDependencies({
      database: {
        listCampaignLeads: async () => [firstLead, secondLead],
        listInvoicePayments: async () => [invoice, secondInvoice],
      },
      legacy: {
        listCampaignLeads: async () => [firstLead],
        listInvoicePayments: async () => [invoice],
      },
      sheets: {
        listCampaignLeads: async () => [secondLead, firstLead],
        listInvoicePayments: async () => [paymentWithoutInvoice, secondInvoice, invoice],
      },
    }),
    environment: { DB_BUSINESS_OPERATIONS_MODE: "shadow" },
    onShadowComparison: (comparison: BusinessOperationReadShadowComparison) =>
      comparisons.push(comparison),
  };

  assert.deepEqual(await listInvoicePaymentRecords(options), [invoice]);
  assert.deepEqual(await listEmailCampaignLeadReadRecords(options), [firstLead]);
  assert.ok(comparisons.every(({ status }) => status === "match"));
});

test("shadow comparison failures never alter the legacy response", async (context) => {
  const primary = createMonthlyReport();
  context.mock.method(console, "warn", () => undefined);

  const result = await findMonthlyReportRunRecord(primary.report_key, {
    dependencies: createDependencies({
      database: {
        findMonthlyReportRun: async () => {
          throw new Error("shadow database unavailable");
        },
      },
      legacy: { findMonthlyReportRun: async () => primary },
    }),
    environment: { DB_BUSINESS_OPERATIONS_MODE: "shadow" },
  });

  assert.equal(result, primary);
});
