import { createHash } from "node:crypto";

import {
  EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
  type EmailCampaignLeadSheetRecord,
  MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
  type MonthlySalesReportRunSheetRecord,
  type PaymentSheetRecord,
} from "@/lib/google-sheets-schema";

export type BusinessOperationReadShadowComparison = {
  differingFields: string[];
  keyHash: string;
  recordType: "campaign_lead" | "invoice" | "monthly_report";
  status: "match" | "mismatch" | "database_missing" | "sheets_missing";
};

const INVOICE_COMPARISON_FIELDS = [
  "payment_intent_id",
  "invoice_number",
  "invoice_issued_at",
] as const satisfies readonly (keyof PaymentSheetRecord)[];

const TIMESTAMP_FIELDS = new Set([
  "created_at",
  "delivered_at_utc",
  "email_sent_at",
  "generated_at_utc",
  "invoice_issued_at",
  "period_end_utc",
  "period_start_utc",
]);

const normalizeValue = (field: string, value: string) => {
  const normalizedValue = value.trim();

  if (field === "email" || field === "delivered_to") {
    return normalizedValue.toLowerCase();
  }

  if (TIMESTAMP_FIELDS.has(field)) {
    const timestamp = Date.parse(normalizedValue);

    if (Number.isFinite(timestamp)) {
      return new Date(Math.floor(timestamp / 1000) * 1000).toISOString();
    }
  }

  return normalizedValue;
};

const hashKey = (value: string) => createHash("sha256").update(value).digest("hex");

const compareRecords = <RecordType extends object>({
  databaseRecord,
  fields,
  key,
  recordType,
  sheetsRecord,
}: {
  databaseRecord: RecordType | null;
  fields: readonly (keyof RecordType & string)[];
  key: string;
  recordType: BusinessOperationReadShadowComparison["recordType"];
  sheetsRecord: RecordType | null;
}): BusinessOperationReadShadowComparison => {
  const base = {
    differingFields: [] as string[],
    keyHash: hashKey(key),
    recordType,
  };

  if (!databaseRecord && !sheetsRecord) {
    return { ...base, status: "match" };
  }

  if (!databaseRecord) {
    return { ...base, status: "database_missing" };
  }

  if (!sheetsRecord) {
    return { ...base, status: "sheets_missing" };
  }

  const differingFields = fields.filter(
    (field) =>
      normalizeValue(field, String(databaseRecord[field] ?? "")) !==
      normalizeValue(field, String(sheetsRecord[field] ?? "")),
  );

  return {
    ...base,
    differingFields,
    status: differingFields.length === 0 ? "match" : "mismatch",
  };
};

export const compareInvoiceRecords = (
  databaseRecord: PaymentSheetRecord | null,
  sheetsRecord: PaymentSheetRecord | null,
  key: string,
) =>
  compareRecords({
    databaseRecord,
    fields: INVOICE_COMPARISON_FIELDS,
    key,
    recordType: "invoice",
    sheetsRecord,
  });

export const compareMonthlyReportRecords = (
  databaseRecord: MonthlySalesReportRunSheetRecord | null,
  sheetsRecord: MonthlySalesReportRunSheetRecord | null,
  key: string,
) =>
  compareRecords({
    databaseRecord,
    fields: MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
    key,
    recordType: "monthly_report",
    sheetsRecord,
  });

export const compareCampaignLeadRecords = (
  databaseRecord: EmailCampaignLeadSheetRecord | null,
  sheetsRecord: EmailCampaignLeadSheetRecord | null,
  key: string,
) =>
  compareRecords({
    databaseRecord,
    fields: EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
    key,
    recordType: "campaign_lead",
    sheetsRecord,
  });

const compareCollections = <RecordType extends object>({
  databaseRecords,
  fields,
  getIdentity,
  key,
  recordType,
  sheetsRecords,
}: {
  databaseRecords: RecordType[];
  fields: readonly (keyof RecordType & string)[];
  getIdentity: (record: RecordType) => string;
  key: string;
  recordType: BusinessOperationReadShadowComparison["recordType"];
  sheetsRecords: RecordType[];
}): BusinessOperationReadShadowComparison => {
  const base = {
    differingFields: [] as string[],
    keyHash: hashKey(key),
    recordType,
  };

  if (databaseRecords.length === 0 && sheetsRecords.length === 0) {
    return { ...base, status: "match" };
  }

  if (databaseRecords.length === 0) {
    return { ...base, status: "database_missing" };
  }

  if (sheetsRecords.length === 0) {
    return { ...base, status: "sheets_missing" };
  }

  const databaseByIdentity = new Map(
    databaseRecords.map((record) => [getIdentity(record), record]),
  );
  const sheetsByIdentity = new Map(
    sheetsRecords.map((record) => [getIdentity(record), record]),
  );
  const differingFields = new Set<string>();

  if (
    databaseRecords.length !== sheetsRecords.length ||
    databaseByIdentity.size !== sheetsByIdentity.size
  ) {
    differingFields.add("record_count");
  }

  const identities = new Set([...databaseByIdentity.keys(), ...sheetsByIdentity.keys()]);

  for (const identity of identities) {
    const databaseRecord = databaseByIdentity.get(identity);
    const sheetsRecord = sheetsByIdentity.get(identity);

    if (!databaseRecord || !sheetsRecord) {
      differingFields.add("record_keys");
      continue;
    }

    for (const field of fields) {
      if (
        normalizeValue(field, String(databaseRecord[field] ?? "")) !==
        normalizeValue(field, String(sheetsRecord[field] ?? ""))
      ) {
        differingFields.add(field);
      }
    }
  }

  return {
    ...base,
    differingFields: [...differingFields].sort(),
    status: differingFields.size === 0 ? "match" : "mismatch",
  };
};

export const compareInvoiceCollections = ({
  databaseRecords,
  key,
  sheetsRecords,
}: {
  databaseRecords: PaymentSheetRecord[];
  key: string;
  sheetsRecords: PaymentSheetRecord[];
}) => {
  const hasInvoice = (record: PaymentSheetRecord) =>
    Boolean(record.invoice_number.trim() || record.invoice_issued_at.trim());

  return compareCollections({
    databaseRecords: databaseRecords.filter(hasInvoice),
    fields: INVOICE_COMPARISON_FIELDS,
    getIdentity: (record) => record.payment_intent_id.trim(),
    key,
    recordType: "invoice",
    sheetsRecords: sheetsRecords.filter(hasInvoice),
  });
};

export const compareCampaignLeadCollections = ({
  databaseRecords,
  key,
  sheetsRecords,
}: {
  databaseRecords: EmailCampaignLeadSheetRecord[];
  key: string;
  sheetsRecords: EmailCampaignLeadSheetRecord[];
}) =>
  compareCollections({
    databaseRecords,
    fields: EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
    getIdentity: (record) => record.lead_id.trim(),
    key,
    recordType: "campaign_lead",
    sheetsRecords,
  });

export const reportBusinessOperationShadowComparison = (
  comparison: BusinessOperationReadShadowComparison,
) => {
  if (comparison.status !== "match") {
    console.warn("Business operation read shadow mismatch", comparison);
  }
};

export const reportBusinessOperationShadowFailure = (
  recordType: BusinessOperationReadShadowComparison["recordType"],
  error: unknown,
) => {
  console.warn("Business operation read shadow comparison failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    recordType,
  });
};
