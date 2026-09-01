import {
  claimTelegramAccessTokenRecordInDatabase,
  upsertTelegramAccessTokenRecordToDatabase,
  upsertTelegramUserBindingRecordToDatabase,
} from "@/db/sheet-records";
import { updateTelegramAccessInDatabase } from "@/db/telegram-access";
import type {
  PaymentSheetRecord,
  TelegramAccessTokenSheetRecord,
  TelegramUserBindingSheetRecord,
} from "@/lib/google-sheets-schema";

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

export type TelegramAccessPersistenceDependencies = {
  claimToken: typeof claimTelegramAccessTokenRecordInDatabase;
  updatePaymentAccess: typeof updateTelegramAccessInDatabase;
  upsertBinding: typeof upsertTelegramUserBindingRecordToDatabase;
  upsertToken: typeof upsertTelegramAccessTokenRecordToDatabase;
};

const defaultDependencies: TelegramAccessPersistenceDependencies = {
  claimToken: claimTelegramAccessTokenRecordInDatabase,
  updatePaymentAccess: updateTelegramAccessInDatabase,
  upsertBinding: upsertTelegramUserBindingRecordToDatabase,
  upsertToken: upsertTelegramAccessTokenRecordToDatabase,
};

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

export const upsertTelegramAccessTokenRecord = (
  record: TelegramAccessTokenSheetRecord,
  dependencies: TelegramAccessPersistenceDependencies = defaultDependencies,
) => dependencies.upsertToken(record);

export const claimTelegramAccessTokenRecord = (
  claim: Parameters<typeof claimTelegramAccessTokenRecordInDatabase>[0],
  dependencies: TelegramAccessPersistenceDependencies = defaultDependencies,
) => dependencies.claimToken(claim);

export const upsertTelegramUserBindingRecord = (
  record: TelegramUserBindingSheetRecord,
  dependencies: TelegramAccessPersistenceDependencies = defaultDependencies,
) => dependencies.upsertBinding(record);

export const persistTelegramPaymentAccess = async ({
  dependencies = defaultDependencies,
  patch,
  paymentRecord,
}: {
  dependencies?: TelegramAccessPersistenceDependencies;
  patch: TelegramPaymentAccessPatch;
  paymentRecord: PaymentSheetRecord;
}) => {
  const updatedAtValue = patch.updated_at?.trim() || new Date().toISOString();
  const updatedAtTimestamp = Date.parse(updatedAtValue);

  if (!Number.isFinite(updatedAtTimestamp)) {
    throw new Error("telegram_access_invalid_updated_at");
  }

  const paymentProjection = await dependencies.updatePaymentAccess({
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

export {
  findActiveTelegramUserBindings,
  findLatestTelegramAccessTokenRecordByPaymentIntentId,
  findPaymentRecordByIntentId,
  findTelegramAccessTokenRecordByTokenHash,
  findTelegramAccessTokenRecordByTokenValue,
  findTelegramUserBindingByPaymentIntentId,
  findTelegramUserBindingsByCustomerEmail,
  findTelegramUserBindingsByTelegramUserId,
  findTelegramUserBindingsByTelegramUserIdAndChatId,
} from "./access-read-runtime";
export type { PaymentSheetRecord } from "@/lib/google-sheets-schema";
