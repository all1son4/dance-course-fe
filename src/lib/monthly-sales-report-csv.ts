import { createHash } from "node:crypto";

import { ACCOUNTING_TIME_ZONE, getAccountingDateTimeValue } from "@/lib/accounting-month";
import { escapeSpreadsheetCsvCell } from "@/lib/csv";

/*
 * The monthly sales report's CSV: pure functions from confirmed sale records to the
 * file the accountant receives (rows by country, totals, Stripe settlement checks).
 */

export type MonthlySalesReportSaleRecord = {
  amountMinor: string;
  currency: string;
  customerCountry: string;
  customerEmail: string;
  customerFullName: string;
  invoiceNumber: string;
  paymentIntentId: string;
  purchaseItem: string;
  saleTimestampIso: string;
  settlementAmountMinor: string;
  settlementCurrency: string;
  stripeBalanceTransactionId: string;
  stripeFeeAmountMinor: string;
  stripeNetAmountMinor: string;
};

const parseMinorAmount = (amountMinor: string) => {
  const normalizedAmountMinor = amountMinor.trim();

  if (!/^-?\d+$/u.test(normalizedAmountMinor)) {
    throw new Error("monthly_sales_report_stripe_data_incomplete");
  }

  return BigInt(normalizedAmountMinor);
};

const formatAmount = (amountMinor: string | bigint, currency: string) => {
  const parsedAmountMinor =
    typeof amountMinor === "bigint" ? amountMinor : parseMinorAmount(amountMinor);
  const normalizedCurrency = currency.trim().toUpperCase();

  if (!normalizedCurrency) {
    throw new Error("monthly_sales_report_stripe_data_incomplete");
  }

  const zero = BigInt(0);
  const minorUnitsPerMajor = BigInt(100);
  const sign = parsedAmountMinor < zero ? "-" : "";
  const absoluteAmountMinor =
    parsedAmountMinor < zero ? -parsedAmountMinor : parsedAmountMinor;
  const majorAmount = absoluteAmountMinor / minorUnitsPerMajor;
  const fractionalAmount = String(absoluteAmountMinor % minorUnitsPerMajor).padStart(
    2,
    "0",
  );

  return `${sign}${majorAmount}.${fractionalAmount} ${normalizedCurrency}`;
};

const buildCsv = (rows: string[][]) => {
  const headerRow = [
    `Sale date (${ACCOUNTING_TIME_ZONE})`,
    "Invoice number",
    "Name / Email",
    "Country of purchase",
    "Item",
    "Original amount (before Stripe conversion)",
    "Sale amount (after Stripe conversion)",
    "Stripe fee",
    "Net amount (after Stripe fee)",
  ];
  const csvRows = [headerRow, ...rows];

  return csvRows
    .map((row) => row.map((cell) => escapeSpreadsheetCsvCell(cell ?? "")).join(","))
    .join("\n");
};

const formatCustomerIdentity = ({
  customerEmail,
  customerFullName,
}: {
  customerEmail: string;
  customerFullName: string;
}) => [customerFullName.trim(), customerEmail.trim()].filter(Boolean).join(" / ");

const formatAccountingSaleTimestamp = (saleTimestampIso: string) => {
  const saleDate = new Date(saleTimestampIso);

  return Number.isNaN(saleDate.getTime())
    ? saleTimestampIso
    : getAccountingDateTimeValue(saleDate);
};

// The CSV goes to accounting and is always in English.
const COUNTRY_NOT_SPECIFIED = "Not specified";

const formatCountry = (country: string) =>
  country.trim().toLocaleUpperCase("en-US") || COUNTRY_NOT_SPECIFIED;

const formatCountryName = (country: string) => {
  if (!/^[A-Z]{2}$/u.test(country)) {
    return country;
  }

  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(country) ?? country;
  } catch {
    return country;
  }
};

const compareCountrySaleRecords = (
  left: MonthlySalesReportSaleRecord,
  right: MonthlySalesReportSaleRecord,
) => {
  const leftCountry = formatCountry(left.customerCountry);
  const rightCountry = formatCountry(right.customerCountry);

  if (leftCountry === COUNTRY_NOT_SPECIFIED && rightCountry !== COUNTRY_NOT_SPECIFIED) {
    return 1;
  }

  if (rightCountry === COUNTRY_NOT_SPECIFIED && leftCountry !== COUNTRY_NOT_SPECIFIED) {
    return -1;
  }

  const countryDiff = leftCountry.localeCompare(rightCountry, "en-US");

  return countryDiff || compareSaleRecords(left, right);
};

const formatSaleCsvRow = (saleRecord: MonthlySalesReportSaleRecord) => [
  formatAccountingSaleTimestamp(saleRecord.saleTimestampIso),
  saleRecord.invoiceNumber.trim(),
  formatCustomerIdentity(saleRecord),
  formatCountry(saleRecord.customerCountry),
  saleRecord.purchaseItem.trim(),
  formatAmount(saleRecord.amountMinor, saleRecord.currency),
  formatAmount(saleRecord.settlementAmountMinor, saleRecord.settlementCurrency),
  formatAmount(saleRecord.stripeFeeAmountMinor, saleRecord.settlementCurrency),
  formatAmount(saleRecord.stripeNetAmountMinor, saleRecord.settlementCurrency),
];

const formatSaleCount = (count: number) => `${count} ${count === 1 ? "sale" : "sales"}`;

const buildCountryTotalCsvRow = (
  country: string,
  saleRecords: MonthlySalesReportSaleRecord[],
) => {
  const countryName = formatCountryName(country);
  const totals = saleRecords.reduce(
    (result, saleRecord) => ({
      feeMinor: result.feeMinor + parseMinorAmount(saleRecord.stripeFeeAmountMinor),
      grossMinor: result.grossMinor + parseMinorAmount(saleRecord.settlementAmountMinor),
      netMinor: result.netMinor + parseMinorAmount(saleRecord.stripeNetAmountMinor),
    }),
    {
      feeMinor: BigInt(0),
      grossMinor: BigInt(0),
      netMinor: BigInt(0),
    },
  );

  return [
    "",
    "",
    "",
    country,
    `Total for ${countryName} (${formatSaleCount(saleRecords.length)})`,
    "",
    formatAmount(totals.grossMinor, "pln"),
    formatAmount(totals.feeMinor, "pln"),
    formatAmount(totals.netMinor, "pln"),
  ];
};

const validateStripeFinancialData = (saleRecords: MonthlySalesReportSaleRecord[]) => {
  const invalidPaymentIntentIds: string[] = [];

  for (const saleRecord of saleRecords) {
    const paymentIntentId = saleRecord.paymentIntentId.trim();
    const balanceTransactionId = saleRecord.stripeBalanceTransactionId.trim();

    try {
      const originalAmountMinor = parseMinorAmount(saleRecord.amountMinor);
      const settlementAmountMinor = parseMinorAmount(saleRecord.settlementAmountMinor);
      const feeAmountMinor = parseMinorAmount(saleRecord.stripeFeeAmountMinor);
      const netAmountMinor = parseMinorAmount(saleRecord.stripeNetAmountMinor);
      const originalCurrency = saleRecord.currency.trim().toLowerCase();
      const settlementCurrency = saleRecord.settlementCurrency.trim().toLowerCase();

      if (
        !paymentIntentId.startsWith("pi_") ||
        !balanceTransactionId.startsWith("txn_") ||
        !["eur", "pln"].includes(originalCurrency) ||
        settlementCurrency !== "pln" ||
        originalAmountMinor < BigInt(0) ||
        settlementAmountMinor < BigInt(0) ||
        feeAmountMinor < BigInt(0) ||
        netAmountMinor < BigInt(0) ||
        (originalCurrency === "pln" && originalAmountMinor !== settlementAmountMinor) ||
        settlementAmountMinor !== feeAmountMinor + netAmountMinor
      ) {
        invalidPaymentIntentIds.push(paymentIntentId || "missing_payment_intent_id");
      }
    } catch {
      invalidPaymentIntentIds.push(paymentIntentId || "missing_payment_intent_id");
    }
  }

  if (invalidPaymentIntentIds.length > 0) {
    console.error("Monthly sales report rejected incomplete Stripe financial data", {
      affectedCount: invalidPaymentIntentIds.length,
    });
    throw new Error("monthly_sales_report_stripe_data_incomplete");
  }
};

const buildCsvRows = (saleRecords: MonthlySalesReportSaleRecord[]) => {
  const rows: string[][] = [];
  let currentCountry = "";
  let currentCountrySaleRecords: MonthlySalesReportSaleRecord[] = [];

  for (const saleRecord of [...saleRecords].sort(compareCountrySaleRecords)) {
    const country = formatCountry(saleRecord.customerCountry);

    if (currentCountry && country !== currentCountry) {
      rows.push(buildCountryTotalCsvRow(currentCountry, currentCountrySaleRecords));
      currentCountrySaleRecords = [];
    }

    currentCountry = country;
    currentCountrySaleRecords.push(saleRecord);
    rows.push(formatSaleCsvRow(saleRecord));
  }

  if (currentCountry) {
    rows.push(buildCountryTotalCsvRow(currentCountry, currentCountrySaleRecords));
  }

  return rows;
};

export const compareSaleRecords = (
  left: MonthlySalesReportSaleRecord,
  right: MonthlySalesReportSaleRecord,
) => {
  const leftTimestamp = Date.parse(left.saleTimestampIso);
  const rightTimestamp = Date.parse(right.saleTimestampIso);
  const timestampDiff =
    (Number.isFinite(leftTimestamp) ? leftTimestamp : 0) -
    (Number.isFinite(rightTimestamp) ? rightTimestamp : 0);

  return timestampDiff || left.paymentIntentId.localeCompare(right.paymentIntentId);
};

export const generateMonthlySalesReportContent = (
  saleRecords: MonthlySalesReportSaleRecord[],
) => {
  validateStripeFinancialData(saleRecords);
  const csvRows = buildCsvRows(saleRecords);
  const csv = buildCsv(csvRows);
  const sha256 = createHash("sha256").update(csv).digest("hex");
  const rowCount = saleRecords.length;

  return {
    csv,
    rowCount,
    sha256,
  };
};
