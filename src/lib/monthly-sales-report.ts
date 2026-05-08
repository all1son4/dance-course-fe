import { createHash } from "node:crypto";

import { sendResendEmail } from "@/lib/email/resend";
import {
  findMonthlySalesReportRunByKey,
  listSucceededPaymentRecordsInUtcRange,
  type MonthlySalesReportRunSheetRecord,
  type PaymentSheetRecord,
  upsertMonthlySalesReportRun,
} from "@/lib/google-sheets";

const MONTHLY_SALES_REPORT_FAMILY = "monthly_sales";
const MONTHLY_SALES_REPORT_RECIPIENT = process.env.RESEND_REPLY_TO?.trim() ?? "";

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

const pad2 = (value: number) => String(value).padStart(2, "0");

const getUtcMonthValue = (date: Date) =>
  `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;

const capitalizeFirstLetter = (value: string) =>
  `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;

const toUtcDateIso = (date: Date) =>
  [date.getUTCFullYear(), pad2(date.getUTCMonth() + 1), pad2(date.getUTCDate())].join(
    "-",
  );

const escapeCsvCell = (value: string) => {
  const normalizedValue = value.replace(/\r?\n/gu, " ").trim();

  if (/[";,]/u.test(normalizedValue)) {
    return `"${normalizedValue.replaceAll('"', '""')}"`;
  }

  return normalizedValue;
};

const formatAmount = (amountMinor: string, currency: string) => {
  const parsedAmountMinor = Number.parseInt(amountMinor, 10);
  const normalizedCurrency = currency.trim().toUpperCase();

  if (!Number.isFinite(parsedAmountMinor) || !normalizedCurrency) {
    return [amountMinor.trim(), normalizedCurrency].filter(Boolean).join(" ").trim();
  }

  const majorAmount = (parsedAmountMinor / 100).toFixed(2);

  return `${majorAmount} ${normalizedCurrency}`;
};

const getCountryDisplayName = (country: string) => {
  const normalizedCountry = country.trim().toUpperCase();

  if (!/^[A-Z]{2}$/u.test(normalizedCountry)) {
    return country.trim();
  }

  try {
    return (
      new Intl.DisplayNames(["en"], {
        type: "region",
      }).of(normalizedCountry) ?? normalizedCountry
    );
  } catch {
    return normalizedCountry;
  }
};

const getSaleTimestampIso = (paymentRecord: PaymentSheetRecord) =>
  paymentRecord.successful_customer_logged_at.trim() ||
  paymentRecord.updated_at.trim() ||
  paymentRecord.first_seen_at.trim() ||
  "";

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
  const headerRow = ["ФИО", "Страна продажи", "Дата продажи", "Сумма продажи"];
  const csvRows = [headerRow, ...rows];

  return csvRows
    .map((row) => row.map((cell) => escapeCsvCell(cell ?? "")).join(","))
    .join("\n");
};

const buildCsvRows = (paymentRecords: PaymentSheetRecord[]) =>
  paymentRecords.map((paymentRecord) => [
    paymentRecord.customer_full_name.trim(),
    getCountryDisplayName(paymentRecord.customer_country),
    getSaleTimestampIso(paymentRecord),
    formatAmount(paymentRecord.amount, paymentRecord.currency),
  ]);

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

export const isLastDayOfMonthUtc = (date: Date) =>
  date.getUTCDate() ===
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 0, 0, 0, 0),
  ).getUTCDate();

export const getMonthlySalesReportPeriodForNow = (date: Date = new Date()) =>
  getMonthlySalesReportPeriod({
    referenceDate: date,
  });

export const listAvailableMonthlySalesReportMonths = async (
  referenceDate: Date = new Date(),
): Promise<MonthlySalesReportMonthOption[]> => {
  const startUtcIso = "1970-01-01T00:00:00.000Z";
  const endUtcIsoExclusive = referenceDate.toISOString();
  const paymentRecords = await listSucceededPaymentRecordsInUtcRange({
    endUtcIsoExclusive,
    startUtcIso,
  });
  const monthValues = Array.from(
    new Set(
      paymentRecords
        .map((paymentRecord) => {
          const saleDate = new Date(getSaleTimestampIso(paymentRecord));

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

  const existingRun = await findMonthlySalesReportRunByKey(period.key);

  if (!force && existingRun?.delivery_status === "sent") {
    return {
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
    };
  }

  const paymentRecords = await listSucceededPaymentRecordsInUtcRange({
    endUtcIsoExclusive: period.endUtcIso,
    startUtcIso: period.startUtcIso,
  });
  const csvRows = buildCsvRows(paymentRecords);
  const csv = buildCsv(csvRows);
  const sha256 = createHash("sha256").update(csv).digest("hex");
  const rowCount = paymentRecords.length;

  if (rowCount === 0) {
    return {
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
    };
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

    return {
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
    };
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
