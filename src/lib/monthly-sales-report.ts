import { createHash } from "node:crypto";

import { and, asc, eq, gte, isNotNull, lt, ne } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { invoices, purchases, stripeEvents } from "@/db/schema";
import { escapeSpreadsheetCsvCell } from "@/lib/csv";
import { sendResendEmail } from "@/lib/email/resend";
import {
  findMonthlySalesReportRunByKey,
  type MonthlySalesReportRunSheetRecord,
  upsertMonthlySalesReportRun,
} from "@/lib/google-sheets";

const MONTHLY_SALES_REPORT_FAMILY = "monthly_sales";
const MONTHLY_SALES_REPORT_RECIPIENT = process.env.RESEND_REPLY_TO?.trim() ?? "";
const EARLIEST_MONTHLY_SALES_REPORT_START_UTC_ISO = "1970-01-01T00:00:00.000Z";
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
export type MonthlySalesReportMonthOption = {
  label: string;
  value: string;
};

type MonthlySalesReportSaleRecord = {
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
  stripeFeeAmountMinor: string;
  stripeNetAmountMinor: string;
};

type ExistingMonthlySalesReportRun = NonNullable<
  Awaited<ReturnType<typeof findMonthlySalesReportRunByKey>>
>;

const pad2 = (value: number) => String(value).padStart(2, "0");

const getUtcMonthValue = (date: Date) =>
  `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;

const capitalizeFirstLetter = (value: string) =>
  `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;

const toUtcDateIso = (date: Date) =>
  [date.getUTCFullYear(), pad2(date.getUTCMonth() + 1), pad2(date.getUTCDate())].join(
    "-",
  );

const formatAmount = (amountMinor: string, currency: string) => {
  const parsedAmountMinor = Number.parseInt(amountMinor, 10);
  const normalizedCurrency = currency.trim().toUpperCase();

  if (!Number.isFinite(parsedAmountMinor) || !normalizedCurrency) {
    return [amountMinor.trim(), normalizedCurrency].filter(Boolean).join(" ").trim();
  }

  const majorAmount = (parsedAmountMinor / 100).toFixed(2);

  return `${majorAmount} ${normalizedCurrency}`;
};

const parseReportMonth = (reportMonth: string) => {
  const match = /^(\d{4})-(\d{2})$/u.exec(reportMonth.trim());

  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);

  if (month < 1 || month > 12) {
    return null;
  }

  return {
    month,
    year,
  };
};

const formatReportMonthLabel = (monthValue: string) => {
  const parsedReportMonth = parseReportMonth(monthValue);

  if (!parsedReportMonth) {
    return monthValue;
  }

  const formatter = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    timeZone: "UTC",
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

  const selectedYear = parsedReportMonth?.year ?? referenceDate.getUTCFullYear();
  const selectedMonth = parsedReportMonth?.month ?? referenceDate.getUTCMonth() + 1;
  const selectedMonthValue = `${selectedYear}-${pad2(selectedMonth)}`;
  const currentMonthValue = getUtcMonthValue(referenceDate);

  if (selectedMonthValue > currentMonthValue) {
    throw new Error("future_monthly_sales_report_month");
  }

  const startDate = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1, 0, 0, 0, 0));
  const endDate =
    selectedMonthValue === currentMonthValue
      ? referenceDate
      : new Date(Date.UTC(selectedYear, selectedMonth, 1, 0, 0, 0, 0));

  return {
    endUtcIso: endDate.toISOString(),
    key: `${MONTHLY_SALES_REPORT_FAMILY}:${toUtcDateIso(startDate)}:${toUtcDateIso(endDate)}`,
    month: selectedMonthValue,
    startUtcIso: startDate.toISOString(),
  } satisfies MonthlySalesReportPeriod;
};

const buildCsv = (rows: string[][]) => {
  const headerRow = [
    "Дата продажи",
    "Номер инвойса",
    "ФИО / Email",
    "Страна покупки",
    "Что купили",
    "Сумма продажи",
    "Комиссия Stripe",
    "Сумма после комиссии",
  ];
  const csvRows = [headerRow, ...rows];

  return csvRows
    .map((row) => row.map((cell) => escapeSpreadsheetCsvCell(cell ?? "")).join(","))
    .join("\n");
};

const formatNullableAmount = (amountMinor: string, currency: string) =>
  amountMinor.trim() && currency.trim() ? formatAmount(amountMinor, currency) : "";

const formatPlnSaleAmount = ({
  amountMinor,
  currency,
  settlementAmountMinor,
  settlementCurrency,
}: {
  amountMinor: string;
  currency: string;
  settlementAmountMinor: string;
  settlementCurrency: string;
}) => {
  if (settlementAmountMinor.trim() && settlementCurrency.trim().toLowerCase() === "pln") {
    return formatAmount(settlementAmountMinor, settlementCurrency);
  }

  if (currency.trim().toLowerCase() === "pln") {
    return formatAmount(amountMinor, currency);
  }

  return "";
};

const formatCustomerIdentity = ({
  customerEmail,
  customerFullName,
}: {
  customerEmail: string;
  customerFullName: string;
}) => [customerFullName.trim(), customerEmail.trim()].filter(Boolean).join(" / ");

const buildCsvRows = (saleRecords: MonthlySalesReportSaleRecord[]) =>
  saleRecords.map((saleRecord) => [
    saleRecord.saleTimestampIso,
    saleRecord.invoiceNumber.trim(),
    formatCustomerIdentity(saleRecord),
    saleRecord.customerCountry.trim(),
    saleRecord.purchaseItem.trim(),
    formatPlnSaleAmount(saleRecord),
    formatNullableAmount(saleRecord.stripeFeeAmountMinor, saleRecord.settlementCurrency),
    formatNullableAmount(saleRecord.stripeNetAmountMinor, saleRecord.settlementCurrency),
  ]);

const shouldPreferSaleRecord = ({
  existingSaleRecord,
  nextSaleRecord,
}: {
  existingSaleRecord: MonthlySalesReportSaleRecord;
  nextSaleRecord: MonthlySalesReportSaleRecord;
}) => {
  const existingTimestamp = Date.parse(existingSaleRecord.saleTimestampIso);
  const nextTimestamp = Date.parse(nextSaleRecord.saleTimestampIso);

  return (
    Number.isFinite(nextTimestamp) &&
    (!Number.isFinite(existingTimestamp) || nextTimestamp < existingTimestamp)
  );
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

const dedupeSaleRecordsByPaymentIntent = (
  saleRecords: MonthlySalesReportSaleRecord[],
) => {
  const saleRecordByPaymentIntentId = new Map<string, MonthlySalesReportSaleRecord>();

  for (const saleRecord of saleRecords) {
    if (!saleRecord.paymentIntentId.trim()) {
      continue;
    }

    const existingSaleRecord = saleRecordByPaymentIntentId.get(
      saleRecord.paymentIntentId,
    );

    if (!existingSaleRecord) {
      saleRecordByPaymentIntentId.set(saleRecord.paymentIntentId, saleRecord);
      continue;
    }

    // Multiple processed Stripe events can join to one purchase; the earliest
    // valid event remains the canonical sale timestamp for a stable report.
    if (
      shouldPreferSaleRecord({
        existingSaleRecord,
        nextSaleRecord: saleRecord,
      })
    ) {
      saleRecordByPaymentIntentId.set(saleRecord.paymentIntentId, saleRecord);
    }
  }

  return Array.from(saleRecordByPaymentIntentId.values()).sort(compareSaleRecords);
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
    timeZone: "UTC",
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
  endUtcIso,
  generatedAtUtc,
  rowCount,
  startUtcIso,
  status,
}: {
  csvSha256: string;
  deliveredAtUtc: string;
  deliveredTo: string;
  endUtcIso: string;
  generatedAtUtc: string;
  rowCount: number;
  startUtcIso: string;
  status: "sent" | "skipped" | "failed";
}): MonthlySalesReportRunSheetRecord => ({
  csv_sha256: csvSha256,
  delivered_at_utc: deliveredAtUtc,
  delivered_to: deliveredTo,
  delivery_status: status,
  generated_at_utc: generatedAtUtc,
  period_end_utc: endUtcIso,
  period_start_utc: startUtcIso,
  report_family: MONTHLY_SALES_REPORT_FAMILY,
  report_key: `${MONTHLY_SALES_REPORT_FAMILY}:${startUtcIso.slice(0, 10)}:${endUtcIso.slice(0, 10)}`,
  row_count: String(rowCount),
});

const generateMonthlySalesReportContent = (
  saleRecords: MonthlySalesReportSaleRecord[],
) => {
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

export const isLastDayOfMonthUtc = (date: Date) =>
  date.getUTCDate() ===
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 0, 0, 0, 0),
  ).getUTCDate();

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
  const saleTimestamp = stripeEvents.stripeCreatedAt;
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
      stripeFeeAmountMinor: purchases.stripeFeeAmountMinor,
      stripeNetAmountMinor: purchases.stripeNetAmountMinor,
    })
    .from(purchases)
    .leftJoin(invoices, eq(invoices.purchaseId, purchases.id))
    .innerJoin(
      stripeEvents,
      and(
        eq(stripeEvents.paymentIntentId, purchases.paymentIntentId),
        eq(stripeEvents.eventType, "payment_intent.succeeded"),
      ),
    )
    .where(
      and(
        eq(purchases.outcome, "succeeded"),
        ne(purchases.source, "admin_offer_link"),
        eq(stripeEvents.processingStatus, "processed"),
        eq(stripeEvents.outcomeSnapshot, "succeeded"),
        isNotNull(saleTimestamp),
        gte(saleTimestamp, startDate),
        lt(saleTimestamp, endDate),
      ),
    )
    .orderBy(asc(saleTimestamp), asc(purchases.paymentIntentId));

  return dedupeSaleRecordsByPaymentIntent(
    rows.map((row) => ({
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
      stripeFeeAmountMinor:
        row.stripeFeeAmountMinor === null ? "" : String(row.stripeFeeAmountMinor),
      stripeNetAmountMinor:
        row.stripeNetAmountMinor === null ? "" : String(row.stripeNetAmountMinor),
    })),
  );
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

export const listAvailableMonthlySalesReportMonths = async (
  referenceDate: Date = new Date(),
): Promise<MonthlySalesReportMonthOption[]> => {
  const startUtcIso = EARLIEST_MONTHLY_SALES_REPORT_START_UTC_ISO;
  const endUtcIsoExclusive = referenceDate.toISOString();
  const saleRecords = await listSucceededSaleRecordsInUtcRange({
    endUtcIsoExclusive,
    startUtcIso,
  });
  const monthValues = Array.from(
    new Set(
      saleRecords
        .map((saleRecord) => {
          const saleDate = new Date(saleRecord.saleTimestampIso);

          if (Number.isNaN(saleDate.getTime())) {
            return "";
          }

          return getUtcMonthValue(saleDate);
        })
        .filter(Boolean),
    ),
  ).sort((left, right) => right.localeCompare(left));

  return monthValues.map((monthValue) => ({
    label: formatReportMonthLabel(monthValue),
    value: monthValue,
  }));
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
  const existingRun = await findMonthlySalesReportRunByKey(period.key);

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
    return buildEmptyMonthlySalesReportResult({
      csv,
      generatedAtUtc,
      period,
      reportRecipient,
      rowCount,
      sha256,
    });
  }

  try {
    const { attachments, html, subject, text } = buildEmailPayload({
      csv,
      endUtcIso: period.endUtcIso,
      month: period.month,
      rowCount,
      startUtcIso: period.startUtcIso,
    });

    await sendResendEmail({
      attachments,
      html,
      subject,
      text,
      to: reportRecipient,
    });

    await upsertMonthlySalesReportRun(
      buildMonthlySalesReportRunRecord({
        csvSha256: sha256,
        deliveredAtUtc: referenceDate.toISOString(),
        deliveredTo: reportRecipient,
        endUtcIso: period.endUtcIso,
        generatedAtUtc,
        rowCount,
        startUtcIso: period.startUtcIso,
        status: "sent",
      }),
    );

    return buildSentMonthlySalesReportResult({
      csv,
      generatedAtUtc,
      period,
      referenceDate,
      reportRecipient,
      rowCount,
      sha256,
    });
  } catch (error) {
    await upsertMonthlySalesReportRun(
      buildMonthlySalesReportRunRecord({
        csvSha256: sha256,
        deliveredAtUtc: "",
        deliveredTo: reportRecipient,
        endUtcIso: period.endUtcIso,
        generatedAtUtc,
        rowCount,
        startUtcIso: period.startUtcIso,
        status: "failed",
      }),
    );

    throw error;
  }
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
