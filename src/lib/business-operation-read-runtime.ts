import { domainRepositories } from "@/db/domain-repositories";
import type { EmailCampaignLeadRecord } from "@/lib/email-campaign-record";
import type { MonthlySalesReportRunRecord } from "@/lib/monthly-sales-report-record";

type MonthlyReportRun = MonthlySalesReportRunRecord | null;

export type BusinessOperationReadSource = {
  findMonthlyReportRun: (reportKey: string) => Promise<MonthlyReportRun>;
  listCampaignLeads: () => Promise<EmailCampaignLeadRecord[]>;
};

export type BusinessOperationReadDependencies = {
  database: BusinessOperationReadSource;
};

export type BusinessOperationReadOptions = {
  dependencies?: BusinessOperationReadDependencies;
};

const defaultDependencies: BusinessOperationReadDependencies = {
  database: {
    findMonthlyReportRun: domainRepositories.businessOperationReads.findMonthlyReportRun,
    listCampaignLeads: domainRepositories.businessOperationReads.listCampaignLeads,
  },
};

const getDatabaseSource = (options: BusinessOperationReadOptions = {}) =>
  (options.dependencies ?? defaultDependencies).database;

export const findMonthlyReportRunRecord = (
  reportKey: string,
  options?: BusinessOperationReadOptions,
) => getDatabaseSource(options).findMonthlyReportRun(reportKey);

export const listEmailCampaignLeadReadRecords = (
  options?: BusinessOperationReadOptions,
) => getDatabaseSource(options).listCampaignLeads();
