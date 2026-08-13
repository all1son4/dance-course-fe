import { createHash } from "node:crypto";

import {
  type PaymentSheetRecord,
  TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
  TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
  type TelegramAccessTokenSheetRecord,
  type TelegramUserBindingSheetRecord,
} from "@/lib/google-sheets-schema";

export type TelegramAccessReadShadowComparison = {
  differingFields: string[];
  keyHash: string;
  recordType: "payment_access" | "telegram_access_token" | "telegram_user_binding";
  status: "match" | "mismatch" | "database_missing" | "sheets_missing";
};

const PAYMENT_ACCESS_FIELDS = [
  "payment_intent_id",
  "product_id",
  "offer_id",
  "delivery_channel",
  "access_workflow",
  "telegram_access_status",
  "telegram_token_id",
  "telegram_token_expires_at",
  "telegram_token_used_at",
  "telegram_user_id",
  "telegram_username",
  "telegram_channel_chat_id",
  "telegram_access_expires_at",
  "telegram_access_revoked_at",
  "telegram_inspiration_chat_id",
  "telegram_inspiration_access_expires_at",
] as const satisfies readonly (keyof PaymentSheetRecord)[];

const TIMESTAMP_FIELDS = new Set([
  "access_expires_at",
  "bound_at",
  "created_at",
  "expires_at",
  "last_seen_at",
  "revoked_at",
  "telegram_access_expires_at",
  "telegram_access_revoked_at",
  "telegram_inspiration_access_expires_at",
  "telegram_token_expires_at",
  "telegram_token_used_at",
  "used_at",
]);

const normalizeValue = (field: string, value: string) => {
  const normalizedValue = value.trim();

  if (field === "customer_email") {
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

const getRecordValue = (record: object, field: string) =>
  (record as Record<string, string>)[field] ?? "";

const hashKey = (value: string) => createHash("sha256").update(value).digest("hex");

const compareRecords = ({
  databaseRecord,
  fields,
  key,
  recordType,
  sheetsRecord,
}: {
  databaseRecord: object | null;
  fields: readonly string[];
  key: string;
  recordType: TelegramAccessReadShadowComparison["recordType"];
  sheetsRecord: object | null;
}): TelegramAccessReadShadowComparison => {
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
      normalizeValue(field, getRecordValue(databaseRecord, field)) !==
      normalizeValue(field, getRecordValue(sheetsRecord, field)),
  );

  return {
    ...base,
    differingFields,
    status: differingFields.length === 0 ? "match" : "mismatch",
  };
};

export const comparePaymentAccessRecords = (
  databaseRecord: PaymentSheetRecord | null,
  sheetsRecord: PaymentSheetRecord | null,
  key: string,
) =>
  compareRecords({
    databaseRecord,
    fields: PAYMENT_ACCESS_FIELDS,
    key,
    recordType: "payment_access",
    sheetsRecord,
  });

export const compareTelegramTokenRecords = (
  databaseRecord: TelegramAccessTokenSheetRecord | null,
  sheetsRecord: TelegramAccessTokenSheetRecord | null,
  key: string,
) =>
  compareRecords({
    databaseRecord,
    fields: TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
    key,
    recordType: "telegram_access_token",
    sheetsRecord,
  });

export const compareTelegramBindingRecords = (
  databaseRecord: TelegramUserBindingSheetRecord | null,
  sheetsRecord: TelegramUserBindingSheetRecord | null,
  key: string,
) =>
  compareRecords({
    databaseRecord,
    fields: TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
    key,
    recordType: "telegram_user_binding",
    sheetsRecord,
  });

const getBindingIdentity = (record: TelegramUserBindingSheetRecord) =>
  [record.payment_intent_id, record.chat_id, record.telegram_user_id]
    .map((value) => value.trim())
    .join("\u0000");

export const compareTelegramBindingCollections = ({
  databaseRecords,
  key,
  sheetsRecords,
}: {
  databaseRecords: TelegramUserBindingSheetRecord[];
  key: string;
  sheetsRecords: TelegramUserBindingSheetRecord[];
}): TelegramAccessReadShadowComparison => {
  const base = {
    differingFields: [] as string[],
    keyHash: hashKey(key),
    recordType: "telegram_user_binding" as const,
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
    databaseRecords.map((record) => [getBindingIdentity(record), record]),
  );
  const sheetsByIdentity = new Map(
    sheetsRecords.map((record) => [getBindingIdentity(record), record]),
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

    for (const field of TELEGRAM_USER_BINDINGS_SHEET_HEADERS) {
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

export const reportTelegramAccessShadowComparison = (
  comparison: TelegramAccessReadShadowComparison,
) => {
  if (comparison.status !== "match") {
    console.warn("Telegram access read shadow mismatch", comparison);
  }
};

export const reportTelegramAccessShadowFailure = (
  recordType: TelegramAccessReadShadowComparison["recordType"],
  error: unknown,
) => {
  console.warn("Telegram access read shadow comparison failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    recordType,
  });
};
