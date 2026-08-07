import assert from "node:assert/strict";
import test from "node:test";

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

import {
  buildReconciliationBaseline,
  type DatabaseReconciliationSnapshot,
  type SheetsReconciliationSnapshot,
} from "./reconciliation-baseline";

const emptyRecord = <T extends readonly string[]>(headers: T) =>
  Object.fromEntries(headers.map((header) => [header, ""])) as Record<T[number], string>;

const createDatabaseSnapshot = (): DatabaseReconciliationSnapshot => ({
  catalog: {
    offers: [],
    prices: [],
    products: [],
  },
  customerCount: 1,
  emailCampaignLeads: [
    {
      campaignKey: "first-touch",
      key: "lead_sensitive",
      status: "sent",
    },
  ],
  entitlements: [
    {
      accessKey: "primary",
      status: "activated",
    },
  ],
  invoices: [{ key: "FV/2026/01/1" }],
  monthlyReportRuns: [{ key: "sales:2026-01", status: "sent" }],
  onlineGroupCampaigns: [{ status: "active" }],
  purchases: [
    {
      amountMinor: 5_000,
      currency: "eur",
      firstSeenAt: "2026-01-15T12:00:00.000Z",
      key: "pi_sensitive",
      outcome: "succeeded",
      productExternalId: "prd_test",
      source: "stripe",
      succeededAt: "2026-01-15T12:00:00.000Z",
    },
  ],
  purchaseSideEffects: [
    {
      kind: "purchase_success_email",
      status: "sent",
    },
  ],
  renewalCampaigns: [{ status: "active" }],
  renewalVerifications: [{ status: "verified" }],
  stripeEvents: [
    {
      eventType: "payment_intent.succeeded",
      key: "evt_sensitive",
      source: "runtime",
      status: "processed",
    },
  ],
  telegramAccessTokens: [
    {
      key: "tgi_sensitive",
      linkKind: "channel_invite",
      productExternalId: "prd_test",
      status: "used",
    },
  ],
  telegramUserBindings: [
    {
      key: "pi_sensitive::-100123",
      productExternalId: "prd_test",
      status: "active",
    },
  ],
});

const createSheetsSnapshot = (): SheetsReconciliationSnapshot => {
  const payment = emptyRecord(PAYMENT_SHEET_HEADERS) as PaymentSheetRecord;
  payment.payment_intent_id = "pi_sensitive";
  payment.customer_email = "private@example.com";
  payment.outcome = "succeeded";
  payment.amount = "5000";
  payment.currency = "eur";
  payment.first_seen_at = "2026-01-15T12:00:00.000Z";
  payment.successful_customer_logged_at = "2026-01-15T12:00:00.000Z";
  payment.successful_customer_log_status = "pending:1768492800000:evt_embedded_sensitive";
  payment.invoice_number = "FV/2026/01/1";

  const stripeEvent = emptyRecord(STRIPE_EVENT_SHEET_HEADERS) as StripeEventSheetRecord;
  stripeEvent.event_id = "evt_sensitive";
  stripeEvent.status = "processed";

  const successfulCustomer = emptyRecord(
    SUCCESSFUL_CUSTOMERS_SHEET_HEADERS,
  ) as SuccessfulCustomersSheetRecord;
  successfulCustomer.payment_intent_id = "pi_sensitive";
  successfulCustomer.customer_email = "private@example.com";

  const token = emptyRecord(
    TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
  ) as TelegramAccessTokenSheetRecord;
  token.token_id = "tgi_sensitive";
  token.token_value = "https://t.me/+private-invite";
  token.customer_email = "private@example.com";
  token.status = "used";

  const binding = emptyRecord(
    TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
  ) as TelegramUserBindingSheetRecord;
  binding.payment_intent_id = "pi_sensitive";
  binding.chat_id = "-100123";
  binding.invite_link = "https://t.me/+private-invite";
  binding.status = "active";

  const monthlyRun = emptyRecord(
    MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
  ) as MonthlySalesReportRunSheetRecord;
  monthlyRun.report_key = "sales:2026-01";
  monthlyRun.delivery_status = "sent";
  monthlyRun.delivered_to = "private@example.com";

  const emailLead = emptyRecord(
    EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
  ) as EmailCampaignLeadSheetRecord;
  emailLead.lead_id = "lead_sensitive";
  emailLead.campaign_key = "first-touch";
  emailLead.email_send_status = "sent";
  emailLead.email = "private@example.com";

  return {
    emailCampaignLeads: [emailLead],
    monthlyReportRuns: [monthlyRun],
    payments: [payment],
    stripeEvents: [stripeEvent],
    successfulCustomers: [successfulCustomer],
    telegramAccessTokens: [token],
    telegramUserBindings: [binding],
  };
};

const buildFixtureReport = (
  database = createDatabaseSnapshot(),
  sheets = createSheetsSnapshot(),
) =>
  buildReconciliationBaseline({
    database,
    options: {
      capturedAt: "2026-01-16T00:00:00.000Z",
      databaseEnvironment: "development",
      databaseVariableName: "DATABASE_DEV_DATABASE_URL",
      sampleLimit: 5,
    },
    sheets,
  });

test("builds a matching baseline without exposing identifiers or secrets", () => {
  const report = buildFixtureReport();
  const serialized = JSON.stringify(report);

  assert.equal(report.status, "ok");
  assert.equal(report.finance.matchesByCurrency, true);
  assert.equal(report.finance.matchesByCurrencyMonth, true);
  assert.equal(report.metadata.piiIncluded, false);
  assert.equal(report.metadata.reportSchemaVersion, 2);
  assert.equal(report.metadata.secretsIncluded, false);
  assert.equal(report.comparisons.payments.status, "ok");
  assert.deepEqual(report.state.sheet.paymentSuccessfulCustomerExport, {
    pending: 1,
  });
  assert.ok(report.reportFingerprintSha256.length === 64);

  for (const sensitiveValue of [
    "pi_sensitive",
    "evt_sensitive",
    "evt_embedded_sensitive",
    "tgi_sensitive",
    "lead_sensitive",
    "private@example.com",
    "https://t.me/+private-invite",
  ]) {
    assert.equal(serialized.includes(sensitiveValue), false);
  }
});

test("reports differences only as deterministic identifier hashes", () => {
  const sheets = createSheetsSnapshot();
  const extraPayment = {
    ...sheets.payments[0],
    payment_intent_id: "pi_only_in_sheet",
  };
  sheets.payments.push(extraPayment);

  const firstReport = buildFixtureReport(createDatabaseSnapshot(), sheets);
  const secondReport = buildFixtureReport(createDatabaseSnapshot(), sheets);
  const paymentComparison = firstReport.comparisons.payments;

  assert.equal(firstReport.status, "mismatch");
  assert.equal(paymentComparison.status, "mismatch");
  assert.equal(paymentComparison.differences.missingInDatabaseCount, 1);
  assert.equal(paymentComparison.differences.missingInDatabaseKeyHashes[0]?.length, 64);
  assert.deepEqual(firstReport.comparisons.payments, secondReport.comparisons.payments);
  assert.equal(JSON.stringify(firstReport).includes("pi_only_in_sheet"), false);
});

test("treats duplicate source keys as a mismatch", () => {
  const sheets = createSheetsSnapshot();
  sheets.telegramAccessTokens.push({ ...sheets.telegramAccessTokens[0] });

  const report = buildFixtureReport(createDatabaseSnapshot(), sheets);

  assert.equal(report.comparisons.telegramAccessTokens.status, "mismatch");
  assert.equal(report.comparisons.telegramAccessTokens.sheet.duplicateCount, 1);
  assert.equal(
    report.comparisons.telegramAccessTokens.sheet.duplicateKeyHashes[0]?.length,
    64,
  );
});
