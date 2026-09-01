import { domainRepositories } from "@/db/domain-repositories";
import type { AdminInviteLinkHistorySourceRecord } from "@/lib/google-sheets-schema";

export type AdminInviteLinkHistoryReadInput = {
  accessWorkflow: string;
  limit?: number;
};

export type AdminInviteLinkHistoryReadSource = {
  list: (
    input: AdminInviteLinkHistoryReadInput,
  ) => Promise<AdminInviteLinkHistorySourceRecord[]>;
};

export type AdminInviteLinkHistoryReadDependencies = {
  database: AdminInviteLinkHistoryReadSource;
};

export type AdminInviteLinkHistoryReadOptions = {
  dependencies?: AdminInviteLinkHistoryReadDependencies;
};

const defaultDependencies: AdminInviteLinkHistoryReadDependencies = {
  database: {
    list: domainRepositories.adminInviteLinkHistory.list,
  },
};

export const listAdminInviteLinkHistoryRecords = (
  input: AdminInviteLinkHistoryReadInput,
  options: AdminInviteLinkHistoryReadOptions = {},
) => (options.dependencies ?? defaultDependencies).database.list(input);
