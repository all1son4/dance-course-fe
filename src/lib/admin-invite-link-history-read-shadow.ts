import { createHash } from "node:crypto";

import type { AdminInviteLinkHistorySourceRecord } from "@/lib/google-sheets-schema";

export type AdminInviteLinkHistoryShadowComparison = {
  differingFields: string[];
  keyHash: string;
  recordType: "admin_invite_link_history";
  status: "match" | "mismatch" | "database_missing" | "sheets_missing";
};

const COMPARISON_FIELDS = [
  "accessUrl",
  "adminLabel",
  "createdAt",
  "lessonLanguage",
  "offerLabel",
  "productTitle",
  "purchaseItem",
  "tokenExpiresAt",
  "tokenUsedAt",
] as const satisfies readonly (keyof AdminInviteLinkHistorySourceRecord)[];

const TIMESTAMP_FIELDS = new Set(["createdAt", "tokenExpiresAt", "tokenUsedAt"]);

const normalizeValue = (field: string, value: string) => {
  const normalizedValue = value.trim();

  if (TIMESTAMP_FIELDS.has(field)) {
    const timestamp = Date.parse(normalizedValue);

    if (Number.isFinite(timestamp)) {
      return new Date(Math.floor(timestamp / 1000) * 1000).toISOString();
    }
  }

  return normalizedValue;
};

const hashKey = (value: string) => createHash("sha256").update(value).digest("hex");

export const compareAdminInviteLinkHistoryRecords = ({
  databaseRecords,
  key,
  sheetsRecords,
}: {
  databaseRecords: AdminInviteLinkHistorySourceRecord[];
  key: string;
  sheetsRecords: AdminInviteLinkHistorySourceRecord[];
}): AdminInviteLinkHistoryShadowComparison => {
  const base = {
    differingFields: [] as string[],
    keyHash: hashKey(key),
    recordType: "admin_invite_link_history" as const,
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

  const getIdentity = (record: AdminInviteLinkHistorySourceRecord) =>
    record.accessUrl.trim();
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

    for (const field of COMPARISON_FIELDS) {
      if (
        normalizeValue(field, databaseRecord[field]) !==
        normalizeValue(field, sheetsRecord[field])
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

export const reportAdminInviteLinkHistoryShadowComparison = (
  comparison: AdminInviteLinkHistoryShadowComparison,
) => {
  if (comparison.status !== "match") {
    console.warn("Admin invite-link history read shadow mismatch", comparison);
  }
};

export const reportAdminInviteLinkHistoryShadowFailure = (error: unknown) => {
  console.warn("Admin invite-link history read shadow comparison failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    recordType: "admin_invite_link_history",
  });
};
