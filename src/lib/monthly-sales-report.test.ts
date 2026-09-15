import assert from "node:assert/strict";
import test from "node:test";

import {
  generateMonthlySalesReportContent,
  type MonthlySalesReportSaleRecord,
} from "./monthly-sales-report";

const createSaleRecord = (
  overrides: Partial<MonthlySalesReportSaleRecord> = {},
): MonthlySalesReportSaleRecord => ({
  amountMinor: "22000",
  currency: "pln",
  customerCountry: "PL",
  customerEmail: "buyer@example.test",
  customerFullName: "Test Buyer",
  invoiceNumber: "FV/2026/08/001",
  paymentIntentId: "pi_test_1",
  purchaseItem: "Dance course",
  saleTimestampIso: "2026-08-10T10:00:00.000Z",
  settlementAmountMinor: "22000",
  settlementCurrency: "pln",
  stripeBalanceTransactionId: "txn_test_1",
  stripeFeeAmountMinor: "900",
  stripeNetAmountMinor: "21100",
  ...overrides,
});

test("monthly report groups countries with gross, fee and net PLN totals", () => {
  const saleRecords = [
    createSaleRecord({
      amountMinor: "5000",
      currency: "eur",
      invoiceNumber: "FV/2026/08/003",
      paymentIntentId: "pi_pl_eur",
      saleTimestampIso: "2026-08-10T10:00:00.000Z",
      stripeBalanceTransactionId: "txn_pl_eur",
    }),
    createSaleRecord({
      amountMinor: "6000",
      currency: "eur",
      customerCountry: "de",
      invoiceNumber: "FV/2026/08/001",
      paymentIntentId: "pi_de_eur",
      saleTimestampIso: "2026-08-01T10:00:00.000Z",
      settlementAmountMinor: "26000",
      stripeBalanceTransactionId: "txn_de_eur",
      stripeFeeAmountMinor: "1000",
      stripeNetAmountMinor: "25000",
    }),
    createSaleRecord({
      invoiceNumber: "FV/2026/08/002",
      paymentIntentId: "pi_pl_pln",
      saleTimestampIso: "2026-08-10T09:00:00.000Z",
      stripeBalanceTransactionId: "txn_pl_pln",
    }),
  ];

  const result = generateMonthlySalesReportContent(saleRecords);
  const rows = result.csv.split("\n");

  assert.equal(result.rowCount, 3);
  assert.equal(rows.length, 6);
  assert.equal(
    rows[1],
    "2026-08-01 12:00:00,FV/2026/08/001,Test Buyer / buyer@example.test,DE,Dance course,60.00 EUR,260.00 PLN,10.00 PLN,250.00 PLN",
  );
  assert.equal(
    rows[2],
    ",,,DE,Итого по стране Германия (1 продажа),,260.00 PLN,10.00 PLN,250.00 PLN",
  );
  assert.equal(
    rows[3],
    "2026-08-10 11:00:00,FV/2026/08/002,Test Buyer / buyer@example.test,PL,Dance course,220.00 PLN,220.00 PLN,9.00 PLN,211.00 PLN",
  );
  assert.equal(
    rows[4],
    "2026-08-10 12:00:00,FV/2026/08/003,Test Buyer / buyer@example.test,PL,Dance course,50.00 EUR,220.00 PLN,9.00 PLN,211.00 PLN",
  );
  assert.equal(
    rows[5],
    ",,,PL,Итого по стране Польша (2 продажи),,440.00 PLN,18.00 PLN,422.00 PLN",
  );
});

test("monthly report rejects missing or inconsistent Stripe financial evidence", (context) => {
  context.mock.method(console, "error", () => undefined);

  assert.throws(
    () =>
      generateMonthlySalesReportContent([
        createSaleRecord({ stripeBalanceTransactionId: "" }),
      ]),
    { message: "monthly_sales_report_stripe_data_incomplete" },
  );
  assert.throws(
    () =>
      generateMonthlySalesReportContent([
        createSaleRecord({ settlementAmountMinor: "22001" }),
      ]),
    { message: "monthly_sales_report_stripe_data_incomplete" },
  );
  assert.throws(
    () =>
      generateMonthlySalesReportContent([
        createSaleRecord({ settlementCurrency: "eur" }),
      ]),
    { message: "monthly_sales_report_stripe_data_incomplete" },
  );
  assert.throws(
    () =>
      generateMonthlySalesReportContent([
        createSaleRecord({
          settlementAmountMinor: "21000",
          stripeNetAmountMinor: "20100",
        }),
      ]),
    { message: "monthly_sales_report_stripe_data_incomplete" },
  );
  assert.throws(
    () =>
      generateMonthlySalesReportContent([
        createSaleRecord({
          stripeFeeAmountMinor: "23000",
          stripeNetAmountMinor: "-1000",
        }),
      ]),
    { message: "monthly_sales_report_stripe_data_incomplete" },
  );
});
