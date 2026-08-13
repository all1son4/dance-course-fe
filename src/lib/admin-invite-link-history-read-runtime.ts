import { getDomainPersistenceMode } from "@/db/domain-persistence";
import { domainRepositories } from "@/db/domain-repositories";
import {
  findAdminInviteLinkHistorySourceRecords as findLegacyAdminInviteLinkHistoryRecords,
  GoogleSheetsError,
  isGoogleSheetsRateLimitError,
} from "@/lib/google-sheets";
import type { AdminInviteLinkHistorySourceRecord } from "@/lib/google-sheets-schema";

import {
  type AdminInviteLinkHistoryShadowComparison,
  compareAdminInviteLinkHistoryRecords,
  reportAdminInviteLinkHistoryShadowComparison,
  reportAdminInviteLinkHistoryShadowFailure,
} from "./admin-invite-link-history-read-shadow";

export type { AdminInviteLinkHistoryShadowComparison } from "./admin-invite-link-history-read-shadow";

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
  legacy: AdminInviteLinkHistoryReadSource;
  sheets: AdminInviteLinkHistoryReadSource;
};

export type AdminInviteLinkHistoryReadOptions = {
  dependencies?: AdminInviteLinkHistoryReadDependencies;
  environment?: Readonly<Record<string, string | undefined>>;
  onShadowComparison?: (comparison: AdminInviteLinkHistoryShadowComparison) => void;
};

const defaultDependencies: AdminInviteLinkHistoryReadDependencies = {
  database: {
    list: domainRepositories.adminInviteLinkHistory.list,
  },
  legacy: {
    list: (input) => findLegacyAdminInviteLinkHistoryRecords(input),
  },
  sheets: {
    list: (input) =>
      findLegacyAdminInviteLinkHistoryRecords({ ...input, source: "sheets" }),
  },
};

export const getAdminInviteLinkHistoryReadRuntime = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
) => getDomainPersistenceMode("businessOperations", environment);

export const listAdminInviteLinkHistoryRecords = async (
  input: AdminInviteLinkHistoryReadInput,
  options: AdminInviteLinkHistoryReadOptions = {},
) => {
  const dependencies = options.dependencies ?? defaultDependencies;
  const environment = options.environment ?? process.env;
  const mode = getAdminInviteLinkHistoryReadRuntime(environment);

  if (mode === "database") {
    return dependencies.database.list(input);
  }

  const primaryRecords = await dependencies.legacy.list(input);

  if (mode === "shadow") {
    try {
      const [databaseRecords, sheetsRecords] = await Promise.all([
        dependencies.database.list(input),
        dependencies.sheets.list(input),
      ]);
      const limitKey = input.limit === undefined ? "all" : String(input.limit);
      const comparison = compareAdminInviteLinkHistoryRecords({
        databaseRecords,
        key: `admin_invite_link_history:${input.accessWorkflow}:${limitKey}`,
        sheetsRecords,
      });

      (options.onShadowComparison ?? reportAdminInviteLinkHistoryShadowComparison)(
        comparison,
      );
    } catch (error) {
      reportAdminInviteLinkHistoryShadowFailure(error);
    }
  }

  return primaryRecords;
};

export const isAdminInviteLinkHistoryRateLimitError = (
  error: unknown,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) =>
  getAdminInviteLinkHistoryReadRuntime(environment) !== "database" &&
  isGoogleSheetsRateLimitError(error);

export const getAdminInviteLinkHistoryProviderErrorDetails = (
  error: unknown,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) => {
  if (
    getAdminInviteLinkHistoryReadRuntime(environment) === "database" ||
    !(error instanceof GoogleSheetsError)
  ) {
    return null;
  }

  return {
    details: error.details,
    errorCode: error.code,
    status: error.status,
  };
};
