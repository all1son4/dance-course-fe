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
    offers: [
      {
        accessWorkflow: "telegram-bot",
        code: "standard",
        deliveryChannel: "telegram",
        externalOfferId: "off_test",
        isActive: true,
        productExternalId: "prd_test",
        sortOrder: 0,
        telegramAccessDurationDays: 30,
      },
    ],
    prices: [
      {
        amountMinor: 5_000,
        currency: "eur",
        externalOfferId: "off_test",
        isActive: true,
      },
    ],
    products: [
      {
        code: "test-course",
        defaultOfferExternalId: "off_test",
        externalProductId: "prd_test",
        isActive: true,
        slug: "test-course",
        type: "course",
      },
    ],
  },
  customerCount: 1,
  emailCampaignLeads: [
    {
      campaignKey: "first-touch",
      emailSendAttempts: 1,
      key: "lead_sensitive",
      locale: "en",
      status: "sent",
    },
  ],
  entitlements: [
    {
      accessKey: "primary",
      accessWorkflow: "telegram-bot",
      currentTokenId: "tgi_sensitive",
      deliveryChannel: "telegram",
      expiresAt: "2026-02-15T12:00:00.000Z",
      key: "pi_sensitive::primary",
      offerExternalId: "off_test",
      productExternalId: "prd_test",
      revokedAt: null,
      startsAt: "2026-01-15T12:30:00.000Z",
      status: "activated",
      telegramChatId: "-100123",
      telegramUserId: "tg-user-sensitive",
    },
  ],
  invoices: [
    {
      amountMinor: 5_000,
      currency: "eur",
      issuedAt: "2026-01-15T12:15:00.000Z",
      key: "FV/2026/01/1",
      paymentIntentId: "pi_sensitive",
    },
  ],
  monthlyReportRuns: [
    {
      csvSha256: "a".repeat(64),
      key: "sales:2026-01",
      reportFamily: "monthly-sales",
      rowCount: 1,
      status: "sent",
    },
  ],
  onlineGroupCampaigns: [{ status: "active" }],
  purchases: [
    {
      amountMinor: 5_000,
      catalogProductExternalId: "prd_test",
      checkoutCurrency: "eur",
      currency: "eur",
      customerAddressLineSnapshot: "Private street 1",
      customerCitySnapshot: "Private city",
      customerCountrySnapshot: "Private country",
      customerEmailSnapshot: "private@example.com",
      customerFullNameSnapshot: "Private Person",
      customerPostalCodeSnapshot: "00-001",
      customerTelegramUsernameSnapshot: "private_user",
      firstSeenAt: "2026-01-15T12:00:00.000Z",
      key: "pi_sensitive",
      latestEventId: "evt_sensitive",
      latestEventType: "payment_intent.succeeded",
      lessonLanguage: "en",
      offerExternalId: "off_test",
      offerLabelSnapshot: "Standard",
      outcome: "succeeded",
      productExternalId: "prd_test",
      productTitleSnapshot: "Private course",
      purchaseItemSnapshot: "Private course / Standard",
      source: "stripe",
      stripeStatus: "succeeded",
      succeededAt: "2026-01-15T12:00:00.000Z",
    },
  ],
  purchaseSideEffects: [
    {
      kind: "purchase_success_email",
      key: "pi_sensitive::purchase_success_email",
      status: "sent",
    },
    {
      key: "pi_sensitive::successful_customer_export",
      kind: "successful_customer_export",
      status: "pending",
    },
  ],
  renewalCampaigns: [{ status: "active" }],
  renewalVerifications: [{ status: "verified" }],
  stripeEvents: [
    {
      eventType: "payment_intent.succeeded",
      key: "evt_sensitive",
      outcome: "succeeded",
      paymentIntentId: "pi_sensitive",
      source: "runtime",
      status: "succeeded",
    },
  ],
  telegramAccessTokens: [
    {
      accessExpiresAt: "2026-02-15T12:00:00.000Z",
      chatId: "-100123",
      expiresAt: "2026-01-16T12:00:00.000Z",
      key: "tgi_sensitive",
      linkKind: "channel_invite",
      offerExternalId: "off_test",
      paymentIntentId: "pi_sensitive",
      productExternalId: "prd_test",
      status: "used",
      telegramUserId: "tg-user-sensitive",
      usedAt: "2026-01-15T12:30:00.000Z",
    },
  ],
  telegramUserBindings: [
    {
      accessExpiresAt: "2026-02-15T12:00:00.000Z",
      boundAt: "2026-01-15T12:30:00.000Z",
      key: "pi_sensitive::-100123",
      offerExternalId: "off_test",
      productExternalId: "prd_test",
      revokedAt: null,
      status: "active",
      telegramUserId: "tg-user-sensitive",
    },
  ],
});

const createSheetsSnapshot = (): SheetsReconciliationSnapshot => {
  const payment = emptyRecord(PAYMENT_SHEET_HEADERS) as PaymentSheetRecord;
  payment.payment_intent_id = "pi_sensitive";
  payment.customer_email = "private@example.com";
  payment.customer_full_name = "Private Person";
  payment.customer_nickname = "private_user";
  payment.customer_country = "Private country";
  payment.customer_address = "Private street 1";
  payment.customer_city = "Private city";
  payment.customer_postal_code = "00-001";
  payment.outcome = "succeeded";
  payment.status = "succeeded";
  payment.amount = "5000";
  payment.currency = "eur";
  payment.checkout_currency = "eur";
  payment.product_id = "prd_test";
  payment.product_title = "Private course";
  payment.offer_id = "off_test";
  payment.offer_label = "Standard";
  payment.purchase_item = "Private course / Standard";
  payment.lesson_language = "en";
  payment.latest_event_id = "evt_sensitive";
  payment.latest_event_type = "payment_intent.succeeded";
  payment.first_seen_at = "2026-01-15T12:00:00.000Z";
  payment.successful_customer_logged_at = "2026-01-15T12:00:00.000Z";
  payment.successful_customer_log_status = "pending:1768492800000:evt_embedded_sensitive";
  payment.email_delivery_status = "sent";
  payment.delivery_channel = "telegram";
  payment.access_workflow = "telegram-bot";
  payment.telegram_access_status = "activated";
  payment.telegram_token_id = "tgi_sensitive";
  payment.telegram_token_used_at = "2026-01-15T12:30:00.000Z";
  payment.telegram_user_id = "tg-user-sensitive";
  payment.telegram_channel_chat_id = "-100123";
  payment.telegram_access_expires_at = "2026-02-15T12:00:00.000Z";
  payment.invoice_number = "FV/2026/01/1";
  payment.invoice_issued_at = "2026-01-15T12:15:00.000Z";

  const stripeEvent = emptyRecord(STRIPE_EVENT_SHEET_HEADERS) as StripeEventSheetRecord;
  stripeEvent.event_id = "evt_sensitive";
  stripeEvent.event_type = "payment_intent.succeeded";
  stripeEvent.payment_intent_id = "pi_sensitive";
  stripeEvent.status = "succeeded";
  stripeEvent.outcome = "succeeded";

  const successfulCustomer = emptyRecord(
    SUCCESSFUL_CUSTOMERS_SHEET_HEADERS,
  ) as SuccessfulCustomersSheetRecord;
  successfulCustomer.payment_intent_id = "pi_sensitive";
  successfulCustomer.customer_email = "private@example.com";
  successfulCustomer.customer_full_name = "Private Person";
  successfulCustomer.customer_nickname = "private_user";
  successfulCustomer.customer_full_address = "Private street 1, Private city, 00-001";
  successfulCustomer.customer_country = "Private country";
  successfulCustomer.purchase_item = "Private course / Standard";
  successfulCustomer.product_id = "prd_test";
  successfulCustomer.product_title = "Private course";
  successfulCustomer.offer_id = "off_test";
  successfulCustomer.offer_label = "Standard";

  const token = emptyRecord(
    TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
  ) as TelegramAccessTokenSheetRecord;
  token.token_id = "tgi_sensitive";
  token.token_value = "https://t.me/+private-invite";
  token.customer_email = "private@example.com";
  token.payment_intent_id = "pi_sensitive";
  token.product_id = "prd_test";
  token.offer_id = "off_test";
  token.link_kind = "channel_invite";
  token.chat_id = "-100123";
  token.access_expires_at = "2026-02-15T12:00:00.000Z";
  token.status = "used";
  token.expires_at = "2026-01-16T12:00:00.000Z";
  token.used_at = "2026-01-15T12:30:00.000Z";
  token.telegram_user_id = "tg-user-sensitive";

  const binding = emptyRecord(
    TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
  ) as TelegramUserBindingSheetRecord;
  binding.payment_intent_id = "pi_sensitive";
  binding.chat_id = "-100123";
  binding.invite_link = "https://t.me/+private-invite";
  binding.product_id = "prd_test";
  binding.offer_id = "off_test";
  binding.telegram_user_id = "tg-user-sensitive";
  binding.bound_at = "2026-01-15T12:30:00.000Z";
  binding.access_expires_at = "2026-02-15T12:00:00.000Z";
  binding.status = "active";

  const monthlyRun = emptyRecord(
    MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
  ) as MonthlySalesReportRunSheetRecord;
  monthlyRun.report_key = "sales:2026-01";
  monthlyRun.report_family = "monthly-sales";
  monthlyRun.delivery_status = "sent";
  monthlyRun.delivered_to = "private@example.com";
  monthlyRun.row_count = "1";
  monthlyRun.csv_sha256 = "a".repeat(64);

  const emailLead = emptyRecord(
    EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
  ) as EmailCampaignLeadSheetRecord;
  emailLead.lead_id = "lead_sensitive";
  emailLead.campaign_key = "first-touch";
  emailLead.email_send_status = "sent";
  emailLead.email = "private@example.com";
  emailLead.locale = "en";
  emailLead.email_send_attempts = "1";

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
  assert.equal(report.metadata.reportSchemaVersion, 4);
  assert.equal(report.metadata.secretsIncluded, false);
  assert.equal(report.comparisons.payments.status, "ok");
  assert.ok(
    Object.values(report.rowComparisons).every(
      (comparison) => comparison.status === "ok",
    ),
  );
  assert.deepEqual(report.state.sheet.paymentSuccessfulCustomerExport, {
    pending: 1,
  });
  assert.deepEqual(
    report.conflictAnalysis.lifecycleDateDifferences.entitlements.revokedAt,
    {
      byMagnitude: {},
      differenceCount: 0,
    },
  );
  assert.equal(
    report.conflictAnalysis.activeAccessCoverage.telegramAccessTokens.databaseActiveCount,
    0,
  );
  assert.equal(
    report.conflictAnalysis.activeAccessCoverage.telegramUserBindings.databaseActiveCount,
    1,
  );
  assert.ok(report.reportFingerprintSha256.length === 64);

  for (const sensitiveValue of [
    "pi_sensitive",
    "evt_sensitive",
    "evt_embedded_sensitive",
    "tgi_sensitive",
    "lead_sensitive",
    "private@example.com",
    "Private Person",
    "Private street 1",
    "Private city",
    "tg-user-sensitive",
    "-100123",
    "https://t.me/+private-invite",
  ]) {
    assert.equal(serialized.includes(sensitiveValue), false);
  }
});

test("makes matched state differences fail without exposing compared values", () => {
  const sheets = createSheetsSnapshot();
  sheets.telegramAccessTokens[0].status = "revoked";

  const report = buildFixtureReport(createDatabaseSnapshot(), sheets);
  const comparison = report.rowComparisons.telegramAccessTokens;
  const serialized = JSON.stringify(report);

  assert.equal(report.status, "mismatch");
  assert.equal(report.comparisons.telegramAccessTokens.status, "ok");
  assert.equal(comparison.status, "mismatch");
  assert.equal(comparison.differenceCount, 1);
  assert.equal(comparison.differencesByField.status, 1);
  assert.deepEqual(comparison.differenceShapesByField.status, {
    "both-present-different": 1,
  });
  assert.equal(comparison.differenceKeyHashes[0]?.length, 64);
  assert.equal(serialized.includes("tgi_sensitive"), false);
});

test("treats sub-second Sheet timestamp precision loss as equivalent", () => {
  const sheets = createSheetsSnapshot();
  sheets.telegramAccessTokens[0].expires_at = "2026-01-16T12:00:00.999Z";

  const report = buildFixtureReport(createDatabaseSnapshot(), sheets);

  assert.equal(report.rowComparisons.telegramAccessTokens.status, "ok");
  assert.deepEqual(
    report.conflictAnalysis.lifecycleDateDifferences.telegramAccessTokens.expiresAt,
    {
      byMagnitude: {
        "under-one-second": 1,
      },
      differenceCount: 1,
    },
  );
});

test("keeps a genuinely empty product reference empty", () => {
  const database = createDatabaseSnapshot();
  const sheets = createSheetsSnapshot();
  database.purchases[0].catalogProductExternalId = "";
  database.purchases[0].productExternalId = "";
  sheets.payments[0].product_id = "";
  sheets.successfulCustomers[0].product_id = "";

  const report = buildFixtureReport(database, sheets);

  assert.equal(
    report.rowComparisons.payments.differencesByField.productExternalId,
    undefined,
  );
  assert.equal(
    report.rowComparisons.successfulCustomerSnapshots.differencesByField
      .productExternalId,
    undefined,
  );
  assert.equal(report.conflictAnalysis.productReferences.payments.differenceCount, 0);
  assert.equal(
    report.conflictAnalysis.productReferences.successfulCustomers.differenceCount,
    0,
  );
});

test("compares customer snapshots and catalog references with key hashes only", () => {
  const sheets = createSheetsSnapshot();
  sheets.payments[0].customer_email = "changed-private@example.com";
  sheets.payments[0].offer_id = "unknown-private-offer";

  const report = buildFixtureReport(createDatabaseSnapshot(), sheets);
  const customerComparison = report.rowComparisons.paymentCustomerSnapshots;
  const catalogComparison = report.rowComparisons.catalogReferences;
  const serialized = JSON.stringify(report);

  assert.equal(report.status, "mismatch");
  assert.equal(customerComparison.differencesByField.email, 1);
  assert.equal(catalogComparison.differencesByField.unknownOffer, 1);
  assert.equal(customerComparison.differenceKeyHashes[0]?.length, 64);
  assert.equal(catalogComparison.differenceKeyHashes[0]?.length, 64);
  assert.equal(serialized.includes("changed-private@example.com"), false);
  assert.equal(serialized.includes("unknown-private-offer"), false);
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
