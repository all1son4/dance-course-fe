import { domainRepositories } from "@/db/domain-repositories";
import type {
  EmailCampaignLeadSheetRecord,
  MonthlySalesReportRunSheetRecord,
  PaymentSheetRecord,
} from "@/lib/google-sheets-schema";

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
};

export type BusinessOperationReadOptions = {
  dependencies?: BusinessOperationReadDependencies;
};

const defaultDependencies: BusinessOperationReadDependencies = {
  database: {
    findCampaignLead: domainRepositories.businessOperationReads.findCampaignLead,
    findInvoicePaymentByIntentId: domainRepositories.paymentReads.findByPaymentIntentId,
    findMonthlyReportRun: domainRepositories.businessOperationReads.findMonthlyReportRun,
    listCampaignLeads: domainRepositories.businessOperationReads.listCampaignLeads,
    listInvoicePayments: domainRepositories.businessOperationReads.listInvoicePayments,
  },
};

const getDatabaseSource = (options: BusinessOperationReadOptions = {}) =>
  (options.dependencies ?? defaultDependencies).database;

export const findInvoicePaymentRecordByIntentId = (
  paymentIntentId: string,
  options?: BusinessOperationReadOptions,
) => getDatabaseSource(options).findInvoicePaymentByIntentId(paymentIntentId);

export const listInvoicePaymentRecords = (options?: BusinessOperationReadOptions) =>
  getDatabaseSource(options).listInvoicePayments();

export const findMonthlyReportRunRecord = (
  reportKey: string,
  options?: BusinessOperationReadOptions,
) => getDatabaseSource(options).findMonthlyReportRun(reportKey);

export const findEmailCampaignLeadRecord = (
  input: { campaignKey: string; email: string },
  options?: BusinessOperationReadOptions,
) => getDatabaseSource(options).findCampaignLead(input);

export const listEmailCampaignLeadReadRecords = (
  options?: BusinessOperationReadOptions,
) => getDatabaseSource(options).listCampaignLeads();
