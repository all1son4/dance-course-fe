import { getDomainPersistenceMode } from "@/db/domain-persistence";
import { findPaymentRecordByIntentIdFromDatabase } from "@/db/payment-records";
import {
  claimTelegramAccessTokenRecordInDatabase,
  findActiveTelegramUserBindingsFromDatabase,
  findLatestTelegramAccessTokenRecordByPaymentIntentIdFromDatabase,
  findTelegramAccessTokenRecordByTokenHashFromDatabase,
  findTelegramAccessTokenRecordByTokenValueFromDatabase,
  findTelegramUserBindingByPaymentIntentIdFromDatabase,
  findTelegramUserBindingsByCustomerEmailFromDatabase,
  findTelegramUserBindingsByTelegramUserIdAndChatIdFromDatabase,
  findTelegramUserBindingsByTelegramUserIdFromDatabase,
  upsertTelegramAccessTokenRecordToDatabase,
  upsertTelegramUserBindingRecordToDatabase,
} from "@/db/sheet-records";
import { updateTelegramAccessInDatabase } from "@/db/telegram-access";
import {
  claimTelegramAccessTokenRecord as claimLegacyTelegramAccessTokenRecord,
  findActiveTelegramUserBindings as findLegacyActiveTelegramUserBindings,
  findLatestTelegramAccessTokenRecordByPaymentIntentId as findLegacyLatestTelegramAccessTokenRecordByPaymentIntentId,
  findPaymentRecordByIntentId as findLegacyPaymentRecordByIntentId,
  findTelegramAccessTokenRecordByTokenHash as findLegacyTelegramAccessTokenRecordByTokenHash,
  findTelegramAccessTokenRecordByTokenValue as findLegacyTelegramAccessTokenRecordByTokenValue,
  findTelegramUserBindingByPaymentIntentId as findLegacyTelegramUserBindingByPaymentIntentId,
  findTelegramUserBindingsByCustomerEmail as findLegacyTelegramUserBindingsByCustomerEmail,
  findTelegramUserBindingsByTelegramUserId as findLegacyTelegramUserBindingsByTelegramUserId,
  findTelegramUserBindingsByTelegramUserIdAndChatId as findLegacyTelegramUserBindingsByTelegramUserIdAndChatId,
  isGoogleSheetsRateLimitError,
  upsertPaymentRecord as upsertLegacyPaymentRecord,
  upsertTelegramAccessTokenRecord as upsertLegacyTelegramAccessTokenRecord,
  upsertTelegramUserBindingRecord as upsertLegacyTelegramUserBindingRecord,
} from "@/lib/google-sheets";
import type {
  PaymentSheetRecord,
  TelegramAccessTokenSheetRecord,
  TelegramUserBindingSheetRecord,
} from "@/lib/google-sheets-schema";

export type TelegramAccessRuntime = "database" | "legacy";

type AccessStatus =
  | "activated"
  | "expired"
  | "left_channel"
  | "link_failed"
  | "manual_done"
  | "manual_pending"
  | "not_required"
  | "pending"
  | "revoked"
  | "token_issued";

export type TelegramPaymentAccessPatch = Partial<
  Pick<
    PaymentSheetRecord,
    | "telegram_access_expires_at"
    | "telegram_access_revoked_at"
    | "telegram_access_status"
    | "telegram_channel_chat_id"
    | "telegram_token_expires_at"
    | "telegram_token_id"
    | "telegram_token_used_at"
    | "telegram_user_id"
    | "telegram_username"
    | "updated_at"
  >
>;

const trimOrNull = (value: string | null | undefined) => value?.trim() || null;

const parseOptionalDate = (value: string | undefined) => {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  const timestamp = Date.parse(normalizedValue);

  if (!Number.isFinite(timestamp)) {
    throw new Error("telegram_access_invalid_timestamp");
  }

  return new Date(timestamp);
};

const normalizeAccessStatus = (
  value: string,
  paymentRecord: PaymentSheetRecord,
): AccessStatus => {
  const normalizedValue = value.trim();
  const statuses = new Set<AccessStatus>([
    "activated",
    "expired",
    "left_channel",
    "link_failed",
    "manual_done",
    "manual_pending",
    "not_required",
    "pending",
    "revoked",
    "token_issued",
  ]);

  if (statuses.has(normalizedValue as AccessStatus)) {
    return normalizedValue as AccessStatus;
  }

  if (paymentRecord.delivery_channel.trim() === "manual") {
    return "manual_pending";
  }

  if (!paymentRecord.delivery_channel.trim() && !paymentRecord.access_workflow.trim()) {
    return "not_required";
  }

  return "pending";
};

const getExternalTargetType = (paymentRecord: PaymentSheetRecord) => {
  const workflow = paymentRecord.access_workflow.trim();
  const deliveryChannel = paymentRecord.delivery_channel.trim();

  if (deliveryChannel === "manual" || workflow === "manual-admin") {
    return "manual" as const;
  }

  if (workflow === "telegram-bot") {
    return "telegram_bot" as const;
  }

  if (deliveryChannel === "telegram" || workflow.startsWith("telegram")) {
    return "telegram_chat" as const;
  }

  return null;
};

export const getTelegramAccessRuntime = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): TelegramAccessRuntime =>
  getDomainPersistenceMode("telegramAccess", environment) === "database"
    ? "database"
    : "legacy";

const usesDatabase = () => getTelegramAccessRuntime() === "database";

export const isTelegramAccessPersistenceRateLimitError = (error: unknown) =>
  !usesDatabase() && isGoogleSheetsRateLimitError(error);

export const findPaymentRecordByIntentId = (paymentIntentId: string) =>
  usesDatabase()
    ? findPaymentRecordByIntentIdFromDatabase(paymentIntentId)
    : findLegacyPaymentRecordByIntentId(paymentIntentId);

export const findLatestTelegramAccessTokenRecordByPaymentIntentId = (
  paymentIntentId: string,
) =>
  usesDatabase()
    ? findLatestTelegramAccessTokenRecordByPaymentIntentIdFromDatabase(paymentIntentId)
    : findLegacyLatestTelegramAccessTokenRecordByPaymentIntentId(paymentIntentId);

export const findTelegramAccessTokenRecordByTokenHash = (tokenHash: string) =>
  usesDatabase()
    ? findTelegramAccessTokenRecordByTokenHashFromDatabase(tokenHash)
    : findLegacyTelegramAccessTokenRecordByTokenHash(tokenHash);

export const findTelegramAccessTokenRecordByTokenValue = (tokenValue: string) =>
  usesDatabase()
    ? findTelegramAccessTokenRecordByTokenValueFromDatabase(tokenValue)
    : findLegacyTelegramAccessTokenRecordByTokenValue(tokenValue);

export const findTelegramUserBindingByPaymentIntentId = (paymentIntentId: string) =>
  usesDatabase()
    ? findTelegramUserBindingByPaymentIntentIdFromDatabase(paymentIntentId)
    : findLegacyTelegramUserBindingByPaymentIntentId(paymentIntentId);

export const findTelegramUserBindingsByCustomerEmail = (customerEmail: string) =>
  usesDatabase()
    ? findTelegramUserBindingsByCustomerEmailFromDatabase(customerEmail)
    : findLegacyTelegramUserBindingsByCustomerEmail(customerEmail);

export const findTelegramUserBindingsByTelegramUserId = (telegramUserId: string) =>
  usesDatabase()
    ? findTelegramUserBindingsByTelegramUserIdFromDatabase(telegramUserId)
    : findLegacyTelegramUserBindingsByTelegramUserId(telegramUserId);

export const findTelegramUserBindingsByTelegramUserIdAndChatId = (input: {
  chatId: string;
  telegramUserId: string;
}) =>
  usesDatabase()
    ? findTelegramUserBindingsByTelegramUserIdAndChatIdFromDatabase(input)
    : findLegacyTelegramUserBindingsByTelegramUserIdAndChatId(input);

export const findActiveTelegramUserBindings = () =>
  usesDatabase()
    ? findActiveTelegramUserBindingsFromDatabase()
    : findLegacyActiveTelegramUserBindings();

export const upsertTelegramAccessTokenRecord = (
  record: TelegramAccessTokenSheetRecord,
) =>
  usesDatabase()
    ? upsertTelegramAccessTokenRecordToDatabase(record)
    : upsertLegacyTelegramAccessTokenRecord(record);

export const claimTelegramAccessTokenRecord = (
  claim: Parameters<typeof claimTelegramAccessTokenRecordInDatabase>[0],
) =>
  usesDatabase()
    ? claimTelegramAccessTokenRecordInDatabase(claim)
    : claimLegacyTelegramAccessTokenRecord(claim);

export const upsertTelegramUserBindingRecord = (
  record: TelegramUserBindingSheetRecord,
) =>
  usesDatabase()
    ? upsertTelegramUserBindingRecordToDatabase(record)
    : upsertLegacyTelegramUserBindingRecord(record);

export const persistTelegramPaymentAccess = async ({
  patch,
  paymentRecord,
}: {
  patch: TelegramPaymentAccessPatch;
  paymentRecord: PaymentSheetRecord;
}) => {
  if (!usesDatabase()) {
    return upsertLegacyPaymentRecord({
      ...paymentRecord,
      ...patch,
    });
  }

  const updatedAtValue = patch.updated_at?.trim() || new Date().toISOString();
  const updatedAtTimestamp = Date.parse(updatedAtValue);

  if (!Number.isFinite(updatedAtTimestamp)) {
    throw new Error("telegram_access_invalid_updated_at");
  }

  const paymentProjection = await updateTelegramAccessInDatabase({
    accessWorkflow: trimOrNull(paymentRecord.access_workflow),
    ...(patch.telegram_token_id === undefined
      ? {}
      : { currentTokenId: trimOrNull(patch.telegram_token_id) }),
    deliveryChannel: trimOrNull(paymentRecord.delivery_channel),
    ...(patch.telegram_access_expires_at === undefined
      ? {}
      : { expiresAt: parseOptionalDate(patch.telegram_access_expires_at) }),
    externalTargetType: getExternalTargetType(paymentRecord),
    initialStatus: normalizeAccessStatus(
      paymentRecord.telegram_access_status,
      paymentRecord,
    ),
    paymentIntentId: paymentRecord.payment_intent_id,
    ...(patch.telegram_access_revoked_at === undefined
      ? {}
      : { revokedAt: parseOptionalDate(patch.telegram_access_revoked_at) }),
    ...(patch.telegram_token_used_at === undefined
      ? {}
      : { startsAt: parseOptionalDate(patch.telegram_token_used_at) }),
    ...(patch.telegram_access_status === undefined
      ? {}
      : {
          status: normalizeAccessStatus(patch.telegram_access_status, paymentRecord),
        }),
    ...(patch.telegram_channel_chat_id === undefined
      ? {}
      : { telegramChatId: trimOrNull(patch.telegram_channel_chat_id) }),
    ...(patch.telegram_user_id === undefined
      ? {}
      : { telegramUserId: trimOrNull(patch.telegram_user_id) }),
    ...(patch.telegram_username === undefined
      ? {}
      : { telegramUsername: trimOrNull(patch.telegram_username) }),
    updatedAt: new Date(updatedAtTimestamp),
  });

  return {
    ...paymentProjection,
    ...patch,
    updated_at: updatedAtValue,
  };
};

export type { PaymentSheetRecord } from "@/lib/google-sheets-schema";
