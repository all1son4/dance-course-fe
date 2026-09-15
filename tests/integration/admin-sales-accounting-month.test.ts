import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getAdminPurchasesOverview, listAdminSalesMonths } from "@/db/admin-sales";
import { getDatabaseClient } from "@/db/client";
import {
  countOutstandingPolishTerminalSales,
  setPolishSaleTerminalRecorded,
} from "@/db/polish-terminal-sales";
import { generateMonthlySalesReportCsvForMonth } from "@/lib/monthly-sales-report";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, {
  max: 4,
  prepare: false,
});
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

test("loads and orders distinct Warsaw accounting months", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const augustPaymentIntentId = `pi_admin_sales_august_${suffix}`;
  const septemberPaymentIntentId = `pi_admin_sales_september_${suffix}`;

  try {
    await client`
      INSERT INTO purchases (
        payment_intent_id,
        amount_minor,
        currency,
        stripe_status,
        outcome,
        source,
        succeeded_at,
        first_seen_at,
        created_at,
        updated_at
      ) VALUES
        (
          ${augustPaymentIntentId},
          1000,
          'pln',
          'succeeded',
          'succeeded',
          'stripe',
          '2026-08-31T21:59:59.000Z',
          '2026-08-31T21:59:59.000Z',
          '2026-08-31T21:59:59.000Z',
          '2026-08-31T21:59:59.000Z'
        ),
        (
          ${septemberPaymentIntentId},
          2000,
          'pln',
          'succeeded',
          'succeeded',
          'stripe',
          '2026-08-31T22:00:00.000Z',
          '2026-08-31T22:00:00.000Z',
          '2026-08-31T22:00:00.000Z',
          '2026-08-31T22:00:00.000Z'
        )
    `;
    await client`
      INSERT INTO stripe_events (
        stripe_event_id,
        event_type,
        payment_intent_id,
        stripe_created_at,
        processing_status,
        processed_at,
        outcome_snapshot,
        payload
      ) VALUES
        (
          ${`evt_${augustPaymentIntentId}`},
          'payment_intent.succeeded',
          ${augustPaymentIntentId},
          '2026-08-31T21:59:59.000Z',
          'processed',
          '2026-08-31T21:59:59.000Z',
          'succeeded',
          '{}'::jsonb
        ),
        (
          ${`evt_${septemberPaymentIntentId}`},
          'payment_intent.succeeded',
          ${septemberPaymentIntentId},
          '2026-08-31T22:00:00.000Z',
          'processed',
          '2026-08-31T22:00:00.000Z',
          'succeeded',
          '{}'::jsonb
        )
    `;

    const months = await listAdminSalesMonths();
    const augustOverview = await getAdminPurchasesOverview({
      monthValue: "2026-08",
      searchQuery: augustPaymentIntentId,
    });
    const septemberOverview = await getAdminPurchasesOverview({
      monthValue: "2026-09",
      searchQuery: septemberPaymentIntentId,
    });

    assert.ok(months.includes("2026-08"));
    assert.ok(months.includes("2026-09"));
    assert.ok(months.indexOf("2026-09") < months.indexOf("2026-08"));
    assert.equal(augustOverview.purchases[0]?.paymentIntentId, augustPaymentIntentId);
    assert.equal(
      septemberOverview.purchases[0]?.paymentIntentId,
      septemberPaymentIntentId,
    );
  } finally {
    await client`
      DELETE FROM stripe_events
      WHERE payment_intent_id IN (${augustPaymentIntentId}, ${septemberPaymentIntentId})
    `;
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id IN (${augustPaymentIntentId}, ${septemberPaymentIntentId})
    `;
  }
});

test("uses the exact report ledger for monthly Stripe gross, fee and net", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const plnPaymentIntentId = `pi_admin_summary_pln_${suffix}`;
  const eurPaymentIntentId = `pi_admin_summary_eur_${suffix}`;
  const failedPaymentIntentId = `pi_admin_summary_failed_${suffix}`;
  const unconfirmedPaymentIntentId = `pi_admin_summary_unconfirmed_${suffix}`;
  try {
    await client`
      INSERT INTO purchases (
        payment_intent_id,
        purchase_item_snapshot,
        customer_country_snapshot,
        amount_minor,
        currency,
        settlement_amount_minor,
        settlement_currency,
        stripe_fee_amount_minor,
        stripe_net_amount_minor,
        stripe_balance_transaction_id,
        stripe_status,
        outcome,
        source,
        succeeded_at,
        first_seen_at,
        created_at,
        updated_at
      ) VALUES
        (
          ${plnPaymentIntentId}, 'PLN product', 'PL', 10000, 'pln', 10000, 'pln',
          300, 9700, ${`txn_${plnPaymentIntentId}`}, 'succeeded', 'succeeded',
          'stripe', '2041-08-10T09:00:00.000Z', '2041-08-10T09:00:00.000Z',
          '2041-08-10T09:00:00.000Z', '2041-08-10T09:00:00.000Z'
        ),
        (
          ${eurPaymentIntentId}, 'EUR product', 'PL', 5000, 'eur', 21800, 'pln',
          900, 20900, ${`txn_${eurPaymentIntentId}`}, 'succeeded', 'succeeded',
          'stripe', '2041-09-01T00:00:00.000Z', '2041-09-01T00:00:00.000Z',
          '2041-09-01T00:00:00.000Z', '2041-09-01T00:00:00.000Z'
        ),
        (
          ${failedPaymentIntentId}, 'Failed product', 'PL', 5000, 'eur', NULL, NULL,
          NULL, NULL, NULL, 'failed', 'failed', 'stripe', NULL,
          '2041-08-15T10:00:00.000Z', '2041-08-15T10:00:00.000Z',
          '2041-08-15T10:00:00.000Z'
        ),
        (
          ${unconfirmedPaymentIntentId}, 'Unconfirmed product', 'PL', 10000, 'pln',
          10000, 'pln', 300, 9700, ${`txn_${unconfirmedPaymentIntentId}`},
          'succeeded', 'succeeded', 'stripe', '2041-08-20T10:00:00.000Z',
          '2041-08-20T10:00:00.000Z', '2041-08-20T10:00:00.000Z',
          '2041-08-20T10:00:00.000Z'
        )
    `;
    await client`
      INSERT INTO stripe_events (
        stripe_event_id,
        event_type,
        payment_intent_id,
        stripe_created_at,
        processing_status,
        processed_at,
        outcome_snapshot,
        payload
      ) VALUES
        (
          ${`evt_${plnPaymentIntentId}`}, 'payment_intent.succeeded',
          ${plnPaymentIntentId}, '2041-08-10T09:00:00.000Z', 'processed',
          '2041-08-10T09:00:01.000Z', 'succeeded', '{}'::jsonb
        ),
        (
          ${`evt_${eurPaymentIntentId}`}, 'payment_intent.succeeded',
          ${eurPaymentIntentId}, '2041-08-31T21:59:59.000Z', 'processed',
          '2041-08-31T22:00:01.000Z', 'succeeded', '{}'::jsonb
        ),
        (
          ${`evt_${eurPaymentIntentId}_duplicate`}, 'payment_intent.succeeded',
          ${eurPaymentIntentId}, '2041-09-01T08:00:00.000Z', 'processed',
          '2041-09-01T08:00:01.000Z', 'succeeded', '{}'::jsonb
        )
    `;

    const overview = await getAdminPurchasesOverview({
      monthValue: "2041-08",
      searchQuery: "",
    });
    const report = await generateMonthlySalesReportCsvForMonth({
      referenceDate: new Date("2041-09-02T00:00:00.000Z"),
      reportMonth: "2041-08",
    });

    assert.equal(overview.summary.salesCount, report.rowCount);
    assert.equal(overview.summary.salesCount, 2);
    assert.equal(overview.summary.plnTotalMinor, 10000);
    assert.equal(overview.summary.eurTotalMinor, 5000);
    assert.equal(overview.summary.grossTotalMinor, 31800);
    assert.equal(overview.summary.feeTotalMinor, 1200);
    assert.equal(overview.summary.netTotalMinor, 30600);
    assert.equal(overview.summary.stripeFinancialDataComplete, true);
    assert.equal(overview.summary.failedAttempts, 1);
    assert.equal(overview.summary.unconfirmedSalesCount, 1);
    assert.equal(overview.purchases.length, 3);
    assert.match(
      report.csv,
      /Итого по стране Польша \(2 продажи\),,318\.00 PLN,12\.00 PLN,306\.00 PLN/u,
    );
  } finally {
    await client`
      DELETE FROM stripe_events
      WHERE payment_intent_id IN (
        ${plnPaymentIntentId},
        ${eurPaymentIntentId},
        ${failedPaymentIntentId},
        ${unconfirmedPaymentIntentId}
      )
    `;
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id IN (
        ${plnPaymentIntentId},
        ${eurPaymentIntentId},
        ${failedPaymentIntentId},
        ${unconfirmedPaymentIntentId}
      )
    `;
  }
});

test("hides partial financial totals when Stripe data is incomplete", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const paymentIntentId = `pi_admin_summary_incomplete_${suffix}`;

  try {
    await client`
      INSERT INTO purchases (
        payment_intent_id,
        amount_minor,
        currency,
        stripe_status,
        outcome,
        source,
        succeeded_at,
        first_seen_at,
        created_at,
        updated_at
      ) VALUES (
        ${paymentIntentId}, 5000, 'eur', 'succeeded', 'succeeded', 'stripe',
        '2041-07-10T10:00:00.000Z', '2041-07-10T10:00:00.000Z',
        '2041-07-10T10:00:00.000Z', '2041-07-10T10:00:00.000Z'
      )
    `;
    await client`
      INSERT INTO stripe_events (
        stripe_event_id,
        event_type,
        payment_intent_id,
        stripe_created_at,
        processing_status,
        processed_at,
        outcome_snapshot,
        payload
      ) VALUES (
        ${`evt_${paymentIntentId}`}, 'payment_intent.succeeded', ${paymentIntentId},
        '2041-07-10T10:00:00.000Z', 'processed', '2041-07-10T10:00:01.000Z',
        'succeeded', '{}'::jsonb
      )
    `;

    const overview = await getAdminPurchasesOverview({
      monthValue: "2041-07",
      searchQuery: "",
    });

    assert.equal(overview.summary.salesCount, 1);
    assert.equal(overview.summary.settledCount, 0);
    assert.equal(overview.summary.stripeFinancialDataComplete, false);
    assert.equal(overview.summary.grossTotalMinor, null);
    assert.equal(overview.summary.feeTotalMinor, null);
    assert.equal(overview.summary.netTotalMinor, null);
    assert.equal(overview.summary.grossTotalLabel, "");
    await assert.rejects(
      generateMonthlySalesReportCsvForMonth({
        referenceDate: new Date("2041-08-02T00:00:00.000Z"),
        reportMonth: "2041-07",
      }),
      { message: "monthly_sales_report_stripe_data_incomplete" },
    );
  } finally {
    await client`
      DELETE FROM stripe_events WHERE payment_intent_id = ${paymentIntentId}
    `;
    await client`DELETE FROM purchases WHERE payment_intent_id = ${paymentIntentId}`;
  }
});

test("tracks terminal entry only for successful Polish Stripe sales", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const polishPaymentIntentId = `pi_terminal_poland_${suffix}`;
  const nonPolishPaymentIntentId = `pi_terminal_germany_${suffix}`;
  const failedPolishPaymentIntentId = `pi_terminal_failed_${suffix}`;
  const soldAt = "2042-04-12T10:00:00.000Z";

  try {
    await client`
      INSERT INTO purchases (
        payment_intent_id,
        customer_country_snapshot,
        amount_minor,
        currency,
        stripe_status,
        outcome,
        source,
        succeeded_at,
        first_seen_at,
        created_at,
        updated_at
      ) VALUES
        (
          ${polishPaymentIntentId}, 'PL', 2500, 'pln', 'succeeded', 'succeeded',
          'stripe', ${soldAt}, ${soldAt}, ${soldAt}, ${soldAt}
        ),
        (
          ${nonPolishPaymentIntentId}, 'DE', 2500, 'pln', 'succeeded', 'succeeded',
          'stripe', ${soldAt}, ${soldAt}, ${soldAt}, ${soldAt}
        ),
        (
          ${failedPolishPaymentIntentId}, 'Polska', 2500, 'pln', 'failed', 'failed',
          'stripe', NULL, ${soldAt}, ${soldAt}, ${soldAt}
        )
    `;

    const overviewBefore = await getAdminPurchasesOverview({
      monthValue: "2042-04",
      searchQuery: polishPaymentIntentId,
    });

    assert.equal(overviewBefore.purchases[0]?.isPolish, true);
    assert.equal(overviewBefore.purchases[0]?.terminalRecordedAtIso, "");
    assert.equal(await countOutstandingPolishTerminalSales("2042-04"), 1);

    const recordedAt = new Date("2042-04-20T08:15:00.000Z");
    const recorded = await setPolishSaleTerminalRecorded({
      now: recordedAt,
      paymentIntentId: polishPaymentIntentId,
      terminalRecorded: true,
    });

    assert.equal(recorded?.terminalRecordedAt?.toISOString(), recordedAt.toISOString());
    assert.equal(await countOutstandingPolishTerminalSales("2042-04"), 0);

    const overviewAfter = await getAdminPurchasesOverview({
      monthValue: "2042-04",
      searchQuery: polishPaymentIntentId,
    });

    assert.equal(
      overviewAfter.purchases[0]?.terminalRecordedAtIso,
      recordedAt.toISOString(),
    );
    assert.equal(
      await setPolishSaleTerminalRecorded({
        paymentIntentId: nonPolishPaymentIntentId,
        terminalRecorded: true,
      }),
      null,
    );
    assert.equal(
      await setPolishSaleTerminalRecorded({
        paymentIntentId: failedPolishPaymentIntentId,
        terminalRecorded: true,
      }),
      null,
    );

    const cleared = await setPolishSaleTerminalRecorded({
      paymentIntentId: polishPaymentIntentId,
      terminalRecorded: false,
    });

    assert.equal(cleared?.terminalRecordedAt, null);
    assert.equal(await countOutstandingPolishTerminalSales("2042-04"), 1);
  } finally {
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id IN (
        ${polishPaymentIntentId},
        ${nonPolishPaymentIntentId},
        ${failedPolishPaymentIntentId}
      )
    `;
  }
});
