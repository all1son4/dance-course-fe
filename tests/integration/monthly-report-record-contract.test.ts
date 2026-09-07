import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { recordMonthlyReportRunInDatabase } from "@/db/business-operation-jobs";
import { getDatabaseClient } from "@/db/client";
import { findMonthlyReportRunRecord } from "@/lib/business-operation-read-runtime";
import { generateMonthlySalesReportCsvForMonth } from "@/lib/monthly-sales-report";
import type { MonthlySalesReportRunRecord } from "@/lib/monthly-sales-report-record";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
const client = postgres(databaseUrl, { max: 4, prepare: false });
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

test("monthly report projection preserves all ten fields, zero rows and delivery states", async () => {
  const reportKey = `monthly-report-contract:${randomUUID()}`;
  const csvSha256 = createHash("sha256").update("fixture CSV").digest("hex");
  try {
    assert.equal(await findMonthlyReportRunRecord(reportKey), null);
    assert.equal(await findMonthlyReportRunRecord("  "), null);

    for (const status of ["skipped", "failed", "sent"] as const) {
      const expected: MonthlySalesReportRunRecord = {
        report_key: reportKey,
        report_family: "monthly_sales",
        period_start_utc: "2026-07-31T22:00:00.000Z",
        period_end_utc: "2026-08-31T22:00:00.000Z",
        generated_at_utc: "2026-09-01T03:00:00.000Z",
        delivery_status: status,
        delivered_at_utc: status === "sent" ? "2026-09-01T03:01:00.000Z" : "",
        delivered_to: status === "sent" ? "accountant@example.test" : "",
        row_count: status === "skipped" ? "0" : "3",
        csv_sha256: status === "skipped" ? "" : csvSha256,
      };
      await recordMonthlyReportRunInDatabase({
        reportKey,
        reportFamily: expected.report_family,
        periodStartUtc: new Date(expected.period_start_utc),
        periodEndUtc: new Date(expected.period_end_utc),
        generatedAtUtc: new Date(expected.generated_at_utc),
        deliveryStatus: status,
        deliveredAtUtc: expected.delivered_at_utc
          ? new Date(expected.delivered_at_utc)
          : null,
        deliveredTo: expected.delivered_to,
        rowCount: Number(expected.row_count),
        csvSha256: expected.csv_sha256,
      });
      assert.deepEqual(await findMonthlyReportRunRecord(` ${reportKey} `), expected);
    }
  } finally {
    await client`DELETE FROM monthly_report_runs WHERE report_key = ${reportKey}`;
  }
});

test("monthly CSV includes the first and last sale of the Warsaw month only once", async (context) => {
  const runId = randomUUID();
  // A separate fixture month avoids interference with other parallel integration tests.
  const cases = [
    { at: "2042-07-31T21:59:59.000Z", item: "fixture-before-start" },
    { at: "2042-07-31T22:00:00.000Z", item: "fixture-at-start" },
    { at: "2042-08-31T21:59:59.000Z", item: "fixture-before-end" },
    { at: "2042-08-31T22:00:00.000Z", item: "fixture-at-end" },
  ];
  const paymentIds = cases.map((_, index) => `pi_report_contract_${runId}_${index}`);
  const fetchMock = context.mock.method(globalThis, "fetch", async () => {
    throw new Error("Report generation must not call a provider");
  });
  try {
    for (const [index, fixture] of cases.entries()) {
      const paymentIntentId = paymentIds[index];
      const [purchase] = await client<{ id: string }[]>`
        INSERT INTO purchases (
          payment_intent_id, amount_minor, currency, stripe_status, outcome,
          source, purchase_item_snapshot
        ) VALUES (${paymentIntentId}, 5000, 'pln', 'succeeded', 'succeeded', 'stripe', ${fixture.item})
        RETURNING id
      `;
      assert.ok(purchase);
      await client`
        INSERT INTO stripe_events (
          stripe_event_id, event_type, payment_intent_id, purchase_id,
          stripe_created_at, processing_status, processed_at, outcome_snapshot, payload
        ) VALUES (
          ${`evt_report_contract_${runId}_${index}`}, 'payment_intent.succeeded',
          ${paymentIntentId}, ${purchase.id}, ${fixture.at}, 'processed',
          ${fixture.at}, 'succeeded', '{}'::jsonb
        )
      `;
      if (index === 1) {
        await client`
          INSERT INTO stripe_events (
            stripe_event_id, event_type, payment_intent_id, purchase_id,
            stripe_created_at, processing_status, processed_at, outcome_snapshot, payload
          ) VALUES (
            ${`evt_report_contract_${runId}_duplicate`}, 'payment_intent.succeeded',
            ${paymentIntentId}, ${purchase.id}, '2042-08-01T08:00:00.000Z', 'processed',
            '2042-08-01T08:00:00.000Z', 'succeeded', '{}'::jsonb
          )
        `;
      }
    }
    const report = await generateMonthlySalesReportCsvForMonth({
      referenceDate: new Date("2042-09-01T03:00:00.000Z"),
      reportMonth: "2042-08",
    });
    const expectedCsv = [
      "Дата продажи (Europe/Warsaw),Номер инвойса,ФИО / Email,Страна покупки,Что купили,Сумма продажи,Комиссия Stripe,Сумма после комиссии",
      "2042-08-01 00:00:00,,,,fixture-at-start,50.00 PLN,,",
      "2042-08-31 23:59:59,,,,fixture-before-end,50.00 PLN,,",
    ].join("\n");
    assert.equal(report.rowCount, 2);
    assert.equal(report.csv, expectedCsv);
    assert.equal(report.sha256, createHash("sha256").update(expectedCsv).digest("hex"));
    assert.equal(fetchMock.mock.callCount(), 0);
  } finally {
    await client`DELETE FROM stripe_events WHERE payment_intent_id IN (${paymentIds[0]}, ${paymentIds[1]}, ${paymentIds[2]}, ${paymentIds[3]})`;
    await client`DELETE FROM purchases WHERE payment_intent_id IN (${paymentIds[0]}, ${paymentIds[1]}, ${paymentIds[2]}, ${paymentIds[3]})`;
  }
});
