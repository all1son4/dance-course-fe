import { createHash, randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import { recordMonthlyReportRunInDatabase } from "@/db/business-operation-jobs";
import { getDatabase } from "@/db/client";
import { invoices, purchases } from "@/db/schema";
import { getCanonicalSucceededStripeEvents } from "@/db/stripe-sales";
import {
  ACCOUNTING_TIME_ZONE,
  getAccountingCalendarDateValue,
  getAccountingDateTimeValue,
  getAccountingMonthRange,
  getAccountingMonthValue,
  getPreviousAccountingMonthValue,
  isFirstAccountingCalendarDay,
  parseAccountingMonthValue,
} from "@/lib/accounting-month";
import {
  enqueueMonthlyReportDelivery,
  processBusinessOperationOutboxJob,
} from "@/lib/business-operation-outbox";
import { findMonthlyReportRunRecord } from "@/lib/business-operation-read-runtime";
import { escapeSpreadsheetCsvCell } from "@/lib/csv";
import type { MonthlySalesReportRunSheetRecord } from "@/lib/google-sheets-schema";

const MONTHLY_SALES_REPORT_FAMILY = "monthly_sales";
const MONTHLY_SALES_REPORT_RECIPIENT = process.env.RESEND_REPLY_TO?.trim() ?? "";
const pendingMonthlySalesReportRuns = new Map<
  string,
  Promise<MonthlySalesReportRunResult>
>();

export type MonthlySalesReportPeriod = {
  endUtcIso: string;
  key: string;
  month: string;
  startUtcIso: string;
};

export type MonthlySalesReportRunResult = {
  csv: string;
  deliveredAtUtc: string | null;
  deliveredTo: string;
  endUtcIso: string;
  generatedAtUtc: string;
  isAlreadyDelivered: boolean;
  month: string;
  rowCount: number;
  sha256: string;
  skippedReason: "already_delivered" | "empty" | null;
  startUtcIso: string;
  status: "sent" | "skipped" | "failed";
};
export type MonthlySalesReportDeliveryResponse = Omit<MonthlySalesReportRunResult, "csv">;
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

type ExistingMonthlySalesReportRun = NonNullable<
  Awaited<ReturnType<typeof findMonthlyReportRunRecord>>
>;

const capitalizeFirstLetter = (value: string) =>
  `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;

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

export const parseReportMonth = parseAccountingMonthValue;

export const formatReportMonthLabel = (monthValue: string) => {
  const parsedReportMonth = parseReportMonth(monthValue);

  if (!parsedReportMonth) {
    return monthValue;
  }

  const formatter = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    timeZone: ACCOUNTING_TIME_ZONE,
    year: "numeric",
  });
  const date = new Date(
    Date.UTC(parsedReportMonth.year, parsedReportMonth.month - 1, 1, 0, 0, 0, 0),
  );
  const label = formatter.format(date);

  return capitalizeFirstLetter(label);
};

const getMonthlySalesReportPeriod = ({
  referenceDate,
  reportMonth,
}: {
  referenceDate: Date;
  reportMonth?: string;
}) => {
  const parsedReportMonth = reportMonth ? parseReportMonth(reportMonth) : null;

  if (reportMonth && !parsedReportMonth) {
    throw new Error("invalid_monthly_sales_report_month");
  }

  const currentMonthValue = getAccountingMonthValue(referenceDate);
  const selectedMonthValue = parsedReportMonth
    ? `${parsedReportMonth.year}-${String(parsedReportMonth.month).padStart(2, "0")}`
    : currentMonthValue;

  if (selectedMonthValue > currentMonthValue) {
    throw new Error("future_monthly_sales_report_month");
  }

  const monthRange = getAccountingMonthRange(selectedMonthValue);

  if (!monthRange) {
    throw new Error("invalid_monthly_sales_report_month");
  }

  const endDate =
    selectedMonthValue === currentMonthValue ? referenceDate : monthRange.end;
  const endDateValue =
    selectedMonthValue === currentMonthValue
      ? getAccountingCalendarDateValue(referenceDate)
      : monthRange.endDateValue;

  return {
    endUtcIso: endDate.toISOString(),
    key: `${MONTHLY_SALES_REPORT_FAMILY}:${monthRange.startDateValue}:${endDateValue}`,
    month: selectedMonthValue,
    startUtcIso: monthRange.start.toISOString(),
  } satisfies MonthlySalesReportPeriod;
};

const buildCsv = (rows: string[][]) => {
  const headerRow = [
    `Дата продажи (${ACCOUNTING_TIME_ZONE})`,
    "Номер инвойса",
    "ФИО / Email",
    "Страна покупки",
    "Что купили",
    "Оригинальная сумма (до конвертации Stripe)",
    "Сумма продажи (после конвертации Stripe)",
    "Комиссия Stripe",
    "Сумма после комиссии",
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

const formatCountry = (country: string) =>
  country.trim().toLocaleUpperCase("ru-RU") || "Не указана";

const formatCountryName = (country: string) => {
  if (!/^[A-Z]{2}$/u.test(country)) {
    return country;
  }

  try {
    return new Intl.DisplayNames(["ru"], { type: "region" }).of(country) ?? country;
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

  if (leftCountry === "Не указана" && rightCountry !== "Не указана") {
    return 1;
  }

  if (rightCountry === "Не указана" && leftCountry !== "Не указана") {
    return -1;
  }

  const countryDiff = leftCountry.localeCompare(rightCountry, "ru-RU");

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

const formatSaleCount = (count: number) => {
  const mod100 = count % 100;
  const mod10 = count % 10;

  if (mod100 >= 11 && mod100 <= 14) {
    return `${count} продаж`;
  }

  if (mod10 === 1) {
    return `${count} продажа`;
  }

  if (mod10 >= 2 && mod10 <= 4) {
    return `${count} продажи`;
  }

  return `${count} продаж`;
};

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
    `Итого по стране ${countryName} (${formatSaleCount(saleRecords.length)})`,
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
      affectedPaymentIntentIds: invalidPaymentIntentIds,
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

const compareSaleRecords = (
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

const formatReportMonthForSubject = (monthValue: string) =>
  formatReportMonthLabel(monthValue).toLocaleLowerCase("ru-RU");

const formatReportPeriodLabel = ({
  endUtcIso,
  startUtcIso,
}: {
  endUtcIso: string;
  startUtcIso: string;
}) => {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: ACCOUNTING_TIME_ZONE,
    year: "numeric",
  });
  const startDate = new Date(startUtcIso);
  const endDateExclusive = new Date(endUtcIso);
  const inclusiveEndDate = new Date(endDateExclusive.getTime() - 1);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDateExclusive.getTime()) ||
    inclusiveEndDate.getTime() < startDate.getTime()
  ) {
    return `${startUtcIso} - ${endUtcIso}`;
  }

  return `${formatter.format(startDate)} - ${formatter.format(inclusiveEndDate)}`;
};

const buildEmailSubject = ({ month }: { month: string }) =>
  `Отчет по продажам за ${formatReportMonthForSubject(month)}`;

const buildAttachmentFilename = (month: string) => `monthly-sales-report-${month}.csv`;

const buildCsvAttachmentContent = (csv: string) =>
  Buffer.from(`\uFEFF${csv}`, "utf8").toString("base64");

const buildEmailText = ({
  periodLabel,
  rowCount,
}: {
  periodLabel: string;
  rowCount: number;
}) =>
  [
    "Отчет по продажам",
    `Период: ${periodLabel}`,
    `Количество продаж: ${rowCount}`,
    "",
    "CSV-файл прикреплен к письму.",
  ].join("\n");

const buildEmailHtml = ({
  periodLabel,
  rowCount,
}: {
  periodLabel: string;
  rowCount: number;
}) =>
  [
    '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">',
    '<h2 style="margin:0 0 12px">Отчет по продажам</h2>',
    `<p style=\"margin:0 0 8px\"><b>Период:</b> ${periodLabel}</p>`,
    `<p style=\"margin:0 0 16px\"><b>Количество продаж:</b> ${rowCount}</p>`,
    '<p style="margin:0">CSV-файл прикреплен к письму.</p>',
    "</div>",
  ].join("");

const buildEmailPayload = ({
  csv,
  endUtcIso,
  month,
  rowCount,
  startUtcIso,
}: {
  csv: string;
  endUtcIso: string;
  month: string;
  rowCount: number;
  startUtcIso: string;
}) => {
  const periodLabel = formatReportPeriodLabel({
    endUtcIso,
    startUtcIso,
  });

  return {
    attachments: [
      {
        content: buildCsvAttachmentContent(csv),
        filename: buildAttachmentFilename(month),
      },
    ],
    html: buildEmailHtml({
      periodLabel,
      rowCount,
    }),
    subject: buildEmailSubject({
      month,
    }),
    text: buildEmailText({
      periodLabel,
      rowCount,
    }),
  };
};

const buildMonthlySalesReportRunRecord = ({
  csvSha256,
  deliveredAtUtc,
  deliveredTo,
  generatedAtUtc,
  period,
  rowCount,
  status,
}: {
  csvSha256: string;
  deliveredAtUtc: string;
  deliveredTo: string;
  generatedAtUtc: string;
  period: MonthlySalesReportPeriod;
  rowCount: number;
  status: "sent" | "skipped" | "failed";
}): MonthlySalesReportRunSheetRecord => ({
  csv_sha256: csvSha256,
  delivered_at_utc: deliveredAtUtc,
  delivered_to: deliveredTo,
  delivery_status: status,
  generated_at_utc: generatedAtUtc,
  period_end_utc: period.endUtcIso,
  period_start_utc: period.startUtcIso,
  report_family: MONTHLY_SALES_REPORT_FAMILY,
  report_key: period.key,
  row_count: String(rowCount),
});

const recordMonthlySalesReportRun = async (record: MonthlySalesReportRunSheetRecord) => {
  const deliveryStatus = record.delivery_status;

  if (
    deliveryStatus !== "failed" &&
    deliveryStatus !== "sent" &&
    deliveryStatus !== "skipped"
  ) {
    throw new Error("monthly_sales_report_delivery_status_invalid");
  }

  return recordMonthlyReportRunInDatabase({
    csvSha256: record.csv_sha256,
    deliveredAtUtc: record.delivered_at_utc ? new Date(record.delivered_at_utc) : null,
    deliveredTo: record.delivered_to,
    deliveryStatus,
    generatedAtUtc: new Date(record.generated_at_utc),
    periodEndUtc: new Date(record.period_end_utc),
    periodStartUtc: new Date(record.period_start_utc),
    reportFamily: record.report_family,
    reportKey: record.report_key,
    rowCount: Number.parseInt(record.row_count, 10) || 0,
  });
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

const buildAlreadyDeliveredMonthlySalesReportResult = ({
  existingRun,
  generatedAtUtc,
  period,
}: {
  existingRun: ExistingMonthlySalesReportRun;
  generatedAtUtc: string;
  period: MonthlySalesReportPeriod;
}) => ({
  csv: "",
  deliveredAtUtc: existingRun.delivered_at_utc || null,
  deliveredTo: existingRun.delivered_to,
  endUtcIso: period.endUtcIso,
  generatedAtUtc,
  isAlreadyDelivered: true,
  month: period.month,
  rowCount: Number.parseInt(existingRun.row_count, 10) || 0,
  sha256: existingRun.csv_sha256,
  skippedReason: "already_delivered" as const,
  startUtcIso: period.startUtcIso,
  status: "skipped" as const,
});

const buildEmptyMonthlySalesReportResult = ({
  csv,
  generatedAtUtc,
  period,
  reportRecipient,
  rowCount,
  sha256,
}: {
  csv: string;
  generatedAtUtc: string;
  period: MonthlySalesReportPeriod;
  reportRecipient: string;
  rowCount: number;
  sha256: string;
}) => ({
  csv,
  deliveredAtUtc: null,
  deliveredTo: reportRecipient,
  endUtcIso: period.endUtcIso,
  generatedAtUtc,
  isAlreadyDelivered: false,
  month: period.month,
  rowCount,
  sha256,
  skippedReason: "empty" as const,
  startUtcIso: period.startUtcIso,
  status: "skipped" as const,
});

const buildSentMonthlySalesReportResult = ({
  csv,
  generatedAtUtc,
  period,
  referenceDate,
  reportRecipient,
  rowCount,
  sha256,
}: {
  csv: string;
  generatedAtUtc: string;
  period: MonthlySalesReportPeriod;
  referenceDate: Date;
  reportRecipient: string;
  rowCount: number;
  sha256: string;
}) => ({
  csv,
  deliveredAtUtc: referenceDate.toISOString(),
  deliveredTo: reportRecipient,
  endUtcIso: period.endUtcIso,
  generatedAtUtc,
  isAlreadyDelivered: false,
  month: period.month,
  rowCount,
  sha256,
  skippedReason: null,
  startUtcIso: period.startUtcIso,
  status: "sent" as const,
});

export const getScheduledMonthlySalesReportPeriod = (
  date: Date,
): MonthlySalesReportPeriod | null => {
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (!isFirstAccountingCalendarDay(date)) {
    return null;
  }

  const previousMonth = getPreviousAccountingMonthValue(getAccountingMonthValue(date));

  if (!previousMonth) {
    throw new Error("invalid_previous_accounting_month");
  }

  return getMonthlySalesReportPeriod({
    referenceDate: date,
    reportMonth: previousMonth,
  });
};

export const getMonthlySalesReportPeriodForNow = (date: Date = new Date()) =>
  getMonthlySalesReportPeriod({
    referenceDate: date,
  });

const listSucceededSaleRecordsFromDatabaseInUtcRange = async ({
  endUtcIsoExclusive,
  startUtcIso,
}: {
  endUtcIsoExclusive: string;
  startUtcIso: string;
}): Promise<MonthlySalesReportSaleRecord[]> => {
  const startDate = new Date(startUtcIso);
  const endDate = new Date(endUtcIsoExclusive);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return [];
  }

  const db = getDatabase();
  const canonicalSucceededEvents = getCanonicalSucceededStripeEvents();
  const saleTimestamp = canonicalSucceededEvents.saleTimestamp;
  const rows = await db
    .select({
      amountMinor: purchases.amountMinor,
      currency: purchases.currency,
      customerCountrySnapshot: purchases.customerCountrySnapshot,
      customerEmailSnapshot: purchases.customerEmailSnapshot,
      customerFullNameSnapshot: purchases.customerFullNameSnapshot,
      invoiceNumber: invoices.invoiceNumber,
      offerLabelSnapshot: purchases.offerLabelSnapshot,
      paymentIntentId: purchases.paymentIntentId,
      productTitleSnapshot: purchases.productTitleSnapshot,
      purchaseItemSnapshot: purchases.purchaseItemSnapshot,
      settlementAmountMinor: purchases.settlementAmountMinor,
      settlementCurrency: purchases.settlementCurrency,
      saleTimestamp,
      stripeBalanceTransactionId: purchases.stripeBalanceTransactionId,
      stripeFeeAmountMinor: purchases.stripeFeeAmountMinor,
      stripeNetAmountMinor: purchases.stripeNetAmountMinor,
    })
    .from(purchases)
    .leftJoin(invoices, eq(invoices.purchaseId, purchases.id))
    .innerJoin(
      canonicalSucceededEvents,
      eq(canonicalSucceededEvents.paymentIntentId, purchases.paymentIntentId),
    )
    .where(
      and(
        eq(purchases.outcome, "succeeded"),
        eq(purchases.source, "stripe"),
        sql`${saleTimestamp} >= ${startDate.toISOString()}::timestamptz`,
        sql`${saleTimestamp} < ${endDate.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(asc(saleTimestamp), asc(purchases.paymentIntentId));

  return rows
    .map((row) => ({
      amountMinor: String(row.amountMinor),
      currency: row.currency,
      customerCountry: row.customerCountrySnapshot ?? "",
      customerEmail: row.customerEmailSnapshot ?? "",
      customerFullName: row.customerFullNameSnapshot ?? "",
      invoiceNumber: row.invoiceNumber ?? "",
      paymentIntentId: row.paymentIntentId,
      purchaseItem:
        row.purchaseItemSnapshot ??
        row.productTitleSnapshot ??
        row.offerLabelSnapshot ??
        "",
      saleTimestampIso: row.saleTimestamp?.toISOString() ?? "",
      settlementAmountMinor:
        row.settlementAmountMinor === null ? "" : String(row.settlementAmountMinor),
      settlementCurrency: row.settlementCurrency ?? "",
      stripeBalanceTransactionId: row.stripeBalanceTransactionId ?? "",
      stripeFeeAmountMinor:
        row.stripeFeeAmountMinor === null ? "" : String(row.stripeFeeAmountMinor),
      stripeNetAmountMinor:
        row.stripeNetAmountMinor === null ? "" : String(row.stripeNetAmountMinor),
    }))
    .sort(compareSaleRecords);
};

const listSucceededSaleRecordsInUtcRange = async ({
  endUtcIsoExclusive,
  startUtcIso,
}: {
  endUtcIsoExclusive: string;
  startUtcIso: string;
}) => {
  return listSucceededSaleRecordsFromDatabaseInUtcRange({
    endUtcIsoExclusive,
    startUtcIso,
  });
};

export const generateMonthlySalesReportCsvForMonth = async ({
  referenceDate = new Date(),
  reportMonth,
}: {
  referenceDate?: Date;
  reportMonth: string;
}) => {
  const period = getMonthlySalesReportPeriod({ referenceDate, reportMonth });
  const saleRecords = await listSucceededSaleRecordsInUtcRange({
    endUtcIsoExclusive: period.endUtcIso,
    startUtcIso: period.startUtcIso,
  });
  const { csv, rowCount, sha256 } = generateMonthlySalesReportContent(saleRecords);

  return {
    csv,
    filename: buildAttachmentFilename(period.month),
    month: period.month,
    rowCount,
    sha256,
  };
};

export const toMonthlySalesReportDeliveryResponse = (
  result: MonthlySalesReportRunResult,
): MonthlySalesReportDeliveryResponse => ({
  deliveredAtUtc: result.deliveredAtUtc,
  deliveredTo: result.deliveredTo,
  endUtcIso: result.endUtcIso,
  generatedAtUtc: result.generatedAtUtc,
  isAlreadyDelivered: result.isAlreadyDelivered,
  month: result.month,
  rowCount: result.rowCount,
  sha256: result.sha256,
  skippedReason: result.skippedReason,
  startUtcIso: result.startUtcIso,
  status: result.status,
});

const generateAndDeliverMonthlySalesReportInternal = async ({
  force,
  generatedAtUtc,
  period,
  referenceDate,
  reportRecipient,
}: {
  force: boolean;
  generatedAtUtc: string;
  period: MonthlySalesReportPeriod;
  referenceDate: Date;
  reportRecipient: string;
}) => {
  const existingRun = await findMonthlyReportRunRecord(period.key);

  if (!force && existingRun?.delivery_status === "sent") {
    return buildAlreadyDeliveredMonthlySalesReportResult({
      existingRun,
      generatedAtUtc,
      period,
    });
  }

  const saleRecords = await listSucceededSaleRecordsInUtcRange({
    endUtcIsoExclusive: period.endUtcIso,
    startUtcIso: period.startUtcIso,
  });
  const { csv, rowCount, sha256 } = generateMonthlySalesReportContent(saleRecords);

  if (rowCount === 0) {
    await recordMonthlySalesReportRun(
      buildMonthlySalesReportRunRecord({
        csvSha256: sha256,
        deliveredAtUtc: "",
        deliveredTo: reportRecipient,
        generatedAtUtc,
        period,
        rowCount,
        status: "skipped",
      }),
    );

    return buildEmptyMonthlySalesReportResult({
      csv,
      generatedAtUtc,
      period,
      reportRecipient,
      rowCount,
      sha256,
    });
  }

  const { attachments, html, subject, text } = buildEmailPayload({
    csv,
    endUtcIso: period.endUtcIso,
    month: period.month,
    rowCount,
    startUtcIso: period.startUtcIso,
  });
  const deduplicationKey = force
    ? `monthly-report:${period.key}:force:${randomUUID()}`
    : `monthly-report:${period.key}:${sha256}`;

  await enqueueMonthlyReportDelivery({
    deduplicationKey,
    email: {
      attachments,
      html,
      subject,
      text,
      to: reportRecipient,
    },
    force,
    report: {
      csvSha256: sha256,
      deliveredAtUtc: referenceDate.toISOString(),
      deliveredTo: reportRecipient,
      generatedAtUtc,
      periodEndUtc: period.endUtcIso,
      periodStartUtc: period.startUtcIso,
      reportFamily: MONTHLY_SALES_REPORT_FAMILY,
      reportKey: period.key,
      rowCount,
    },
  });

  const delivery = await processBusinessOperationOutboxJob(deduplicationKey);

  if (delivery.status === "retry" || delivery.status === "dead_letter") {
    throw delivery.error;
  }

  if (delivery.status === "empty") {
    const completedRun = await findMonthlyReportRunRecord(period.key);

    if (completedRun?.delivery_status !== "sent") {
      throw new Error("monthly_sales_report_delivery_in_progress");
    }
  }

  return buildSentMonthlySalesReportResult({
    csv,
    generatedAtUtc,
    period,
    referenceDate,
    reportRecipient,
    rowCount,
    sha256,
  });
};

export const generateAndDeliverMonthlySalesReport = async ({
  force = false,
  referenceDate = new Date(),
  reportMonth,
}: {
  force?: boolean;
  referenceDate?: Date;
  reportMonth?: string;
}) => {
  const reportRecipient = MONTHLY_SALES_REPORT_RECIPIENT;
  const generatedAtUtc = referenceDate.toISOString();
  const period = getMonthlySalesReportPeriod({
    referenceDate,
    reportMonth,
  });

  if (!reportRecipient) {
    throw new Error("missing_monthly_sales_report_recipient");
  }

  const pendingRun = pendingMonthlySalesReportRuns.get(period.key);

  if (pendingRun) {
    return pendingRun;
  }

  const reportRunPromise = generateAndDeliverMonthlySalesReportInternal({
    force,
    generatedAtUtc,
    period,
    referenceDate,
    reportRecipient,
  }).finally(() => {
    pendingMonthlySalesReportRuns.delete(period.key);
  });

  pendingMonthlySalesReportRuns.set(period.key, reportRunPromise);

  return reportRunPromise;
};
