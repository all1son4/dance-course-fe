import { getDomainPersistenceMode } from "@/db/domain-persistence";
import { domainRepositories } from "@/db/domain-repositories";
import {
  findEmailCampaignLeadByCampaignAndEmail as findLegacyEmailCampaignLead,
  findMonthlySalesReportRunByKey as findLegacyMonthlyReportRun,
  findPaymentRecordByIntentId as findLegacyInvoicePayment,
  listEmailCampaignLeadRecords as listLegacyCampaignLeads,
  listPaymentRecords as listLegacyInvoicePayments,
} from "@/lib/google-sheets";
import type {
  EmailCampaignLeadSheetRecord,
  MonthlySalesReportRunSheetRecord,
  PaymentSheetRecord,
} from "@/lib/google-sheets-schema";

import {
  type BusinessOperationReadShadowComparison,
  compareCampaignLeadCollections,
  compareCampaignLeadRecords,
  compareInvoiceCollections,
  compareInvoiceRecords,
  compareMonthlyReportRecords,
  reportBusinessOperationShadowComparison,
  reportBusinessOperationShadowFailure,
} from "./business-operation-read-shadow";

export type { BusinessOperationReadShadowComparison } from "./business-operation-read-shadow";

type CampaignLead = EmailCampaignLeadSheetRecord | null;
type InvoicePayment = PaymentSheetRecord | null;
type MonthlyReportRun = MonthlySalesReportRunSheetRecord | null;

export type BusinessOperationReadSource = {
  findCampaignLead: (input: {
    campaignKey: string;
    email: string;
  }) => Promise<CampaignLead>;
  findInvoicePaymentByIntentId: (paymentIntentId: string) => Promise<InvoicePayment>;
  findMonthlyReportRun: (reportKey: string) => Promise<MonthlyReportRun>;
  listCampaignLeads: () => Promise<EmailCampaignLeadSheetRecord[]>;
  listInvoicePayments: () => Promise<PaymentSheetRecord[]>;
};

export type BusinessOperationReadDependencies = {
  database: BusinessOperationReadSource;
  legacy: BusinessOperationReadSource;
  sheets: BusinessOperationReadSource;
};

export type BusinessOperationReadOptions = {
  dependencies?: BusinessOperationReadDependencies;
  environment?: Readonly<Record<string, string | undefined>>;
  onShadowComparison?: (comparison: BusinessOperationReadShadowComparison) => void;
};

const defaultDependencies: BusinessOperationReadDependencies = {
  database: {
    findCampaignLead: domainRepositories.businessOperationReads.findCampaignLead,
    findInvoicePaymentByIntentId: domainRepositories.paymentReads.findByPaymentIntentId,
    findMonthlyReportRun: domainRepositories.businessOperationReads.findMonthlyReportRun,
    listCampaignLeads: domainRepositories.businessOperationReads.listCampaignLeads,
    listInvoicePayments: domainRepositories.businessOperationReads.listInvoicePayments,
  },
  legacy: {
    findCampaignLead: (input) => findLegacyEmailCampaignLead(input),
    findInvoicePaymentByIntentId: (paymentIntentId) =>
      findLegacyInvoicePayment(paymentIntentId, { cacheTtlMs: 0 }),
    findMonthlyReportRun: (reportKey) => findLegacyMonthlyReportRun(reportKey),
    listCampaignLeads: () => listLegacyCampaignLeads({ cacheTtlMs: 0 }),
    listInvoicePayments: () => listLegacyInvoicePayments({ cacheTtlMs: 0 }),
  },
  sheets: {
    findCampaignLead: (input) =>
      findLegacyEmailCampaignLead({ ...input, source: "sheets" }),
    findInvoicePaymentByIntentId: (paymentIntentId) =>
      findLegacyInvoicePayment(paymentIntentId, {
        cacheTtlMs: 0,
        source: "sheets",
      }),
    findMonthlyReportRun: (reportKey) =>
      findLegacyMonthlyReportRun(reportKey, { source: "sheets" }),
    listCampaignLeads: () => listLegacyCampaignLeads({ cacheTtlMs: 0, source: "sheets" }),
    listInvoicePayments: () =>
      listLegacyInvoicePayments({ cacheTtlMs: 0, source: "sheets" }),
  },
};

export const getBusinessOperationReadRuntime = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
) => getDomainPersistenceMode("businessOperations", environment);

const withDefaults = (options: BusinessOperationReadOptions = {}) => ({
  dependencies: options.dependencies ?? defaultDependencies,
  environment: options.environment ?? process.env,
  onShadowComparison:
    options.onShadowComparison ?? reportBusinessOperationShadowComparison,
});

const readSingle = async <RecordType extends object>({
  compare,
  databaseRead,
  environment,
  key,
  legacyRead,
  onShadowComparison,
  recordType,
  sheetsRead,
}: {
  compare: (
    databaseRecord: RecordType | null,
    sheetsRecord: RecordType | null,
    key: string,
  ) => BusinessOperationReadShadowComparison;
  databaseRead: () => Promise<RecordType | null>;
  environment: Readonly<Record<string, string | undefined>>;
  key: string;
  legacyRead: () => Promise<RecordType | null>;
  onShadowComparison: (comparison: BusinessOperationReadShadowComparison) => void;
  recordType: BusinessOperationReadShadowComparison["recordType"];
  sheetsRead: () => Promise<RecordType | null>;
}) => {
  const mode = getBusinessOperationReadRuntime(environment);

  if (mode === "database") {
    return databaseRead();
  }

  const primaryRecord = await legacyRead();

  if (mode === "shadow") {
    try {
      const [databaseRecord, sheetsRecord] = await Promise.all([
        databaseRead(),
        sheetsRead(),
      ]);

      onShadowComparison(compare(databaseRecord, sheetsRecord, key));
    } catch (error) {
      reportBusinessOperationShadowFailure(recordType, error);
    }
  }

  return primaryRecord;
};

const readCollection = async <RecordType extends object>({
  compare,
  databaseRead,
  environment,
  key,
  legacyRead,
  onShadowComparison,
  recordType,
  sheetsRead,
}: {
  compare: (input: {
    databaseRecords: RecordType[];
    key: string;
    sheetsRecords: RecordType[];
  }) => BusinessOperationReadShadowComparison;
  databaseRead: () => Promise<RecordType[]>;
  environment: Readonly<Record<string, string | undefined>>;
  key: string;
  legacyRead: () => Promise<RecordType[]>;
  onShadowComparison: (comparison: BusinessOperationReadShadowComparison) => void;
  recordType: BusinessOperationReadShadowComparison["recordType"];
  sheetsRead: () => Promise<RecordType[]>;
}) => {
  const mode = getBusinessOperationReadRuntime(environment);

  if (mode === "database") {
    return databaseRead();
  }

  const primaryRecords = await legacyRead();

  if (mode === "shadow") {
    try {
      const [databaseRecords, sheetsRecords] = await Promise.all([
        databaseRead(),
        sheetsRead(),
      ]);

      onShadowComparison(compare({ databaseRecords, key, sheetsRecords }));
    } catch (error) {
      reportBusinessOperationShadowFailure(recordType, error);
    }
  }

  return primaryRecords;
};

export const findInvoicePaymentRecordByIntentId = (
  paymentIntentId: string,
  options?: BusinessOperationReadOptions,
) => {
  const runtime = withDefaults(options);

  return readSingle({
    compare: compareInvoiceRecords,
    databaseRead: () =>
      runtime.dependencies.database.findInvoicePaymentByIntentId(paymentIntentId),
    environment: runtime.environment,
    key: `invoice:payment:${paymentIntentId}`,
    legacyRead: () =>
      runtime.dependencies.legacy.findInvoicePaymentByIntentId(paymentIntentId),
    onShadowComparison: runtime.onShadowComparison,
    recordType: "invoice",
    sheetsRead: () =>
      runtime.dependencies.sheets.findInvoicePaymentByIntentId(paymentIntentId),
  });
};

export const listInvoicePaymentRecords = (options?: BusinessOperationReadOptions) => {
  const runtime = withDefaults(options);

  return readCollection({
    compare: compareInvoiceCollections,
    databaseRead: () => runtime.dependencies.database.listInvoicePayments(),
    environment: runtime.environment,
    key: "invoice:all",
    legacyRead: () => runtime.dependencies.legacy.listInvoicePayments(),
    onShadowComparison: runtime.onShadowComparison,
    recordType: "invoice",
    sheetsRead: () => runtime.dependencies.sheets.listInvoicePayments(),
  });
};

export const findMonthlyReportRunRecord = (
  reportKey: string,
  options?: BusinessOperationReadOptions,
) => {
  const runtime = withDefaults(options);

  return readSingle({
    compare: compareMonthlyReportRecords,
    databaseRead: () => runtime.dependencies.database.findMonthlyReportRun(reportKey),
    environment: runtime.environment,
    key: `monthly_report:${reportKey}`,
    legacyRead: () => runtime.dependencies.legacy.findMonthlyReportRun(reportKey),
    onShadowComparison: runtime.onShadowComparison,
    recordType: "monthly_report",
    sheetsRead: () => runtime.dependencies.sheets.findMonthlyReportRun(reportKey),
  });
};

export const findEmailCampaignLeadRecord = (
  input: { campaignKey: string; email: string },
  options?: BusinessOperationReadOptions,
) => {
  const runtime = withDefaults(options);
  const key = `campaign_lead:${input.campaignKey}:${input.email}`;

  return readSingle({
    compare: compareCampaignLeadRecords,
    databaseRead: () => runtime.dependencies.database.findCampaignLead(input),
    environment: runtime.environment,
    key,
    legacyRead: () => runtime.dependencies.legacy.findCampaignLead(input),
    onShadowComparison: runtime.onShadowComparison,
    recordType: "campaign_lead",
    sheetsRead: () => runtime.dependencies.sheets.findCampaignLead(input),
  });
};

export const listEmailCampaignLeadReadRecords = (
  options?: BusinessOperationReadOptions,
) => {
  const runtime = withDefaults(options);

  return readCollection({
    compare: compareCampaignLeadCollections,
    databaseRead: () => runtime.dependencies.database.listCampaignLeads(),
    environment: runtime.environment,
    key: "campaign_lead:all",
    legacyRead: () => runtime.dependencies.legacy.listCampaignLeads(),
    onShadowComparison: runtime.onShadowComparison,
    recordType: "campaign_lead",
    sheetsRead: () => runtime.dependencies.sheets.listCampaignLeads(),
  });
};
