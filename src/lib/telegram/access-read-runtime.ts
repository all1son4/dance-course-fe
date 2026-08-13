import { getDomainPersistenceMode } from "@/db/domain-persistence";
import { domainRepositories } from "@/db/domain-repositories";
import {
  findActiveTelegramUserBindings as findLegacyActiveTelegramUserBindings,
  findLatestTelegramAccessTokenRecordByPaymentIntentId as findLegacyLatestTelegramAccessTokenRecordByPaymentIntentId,
  findPaymentRecordByIntentId as findLegacyPaymentRecordByIntentId,
  findTelegramAccessTokenRecordByTokenHash as findLegacyTelegramAccessTokenRecordByTokenHash,
  findTelegramAccessTokenRecordByTokenValue as findLegacyTelegramAccessTokenRecordByTokenValue,
  findTelegramUserBindingByPaymentIntentId as findLegacyTelegramUserBindingByPaymentIntentId,
  findTelegramUserBindingsByCustomerEmail as findLegacyTelegramUserBindingsByCustomerEmail,
  findTelegramUserBindingsByTelegramUserId as findLegacyTelegramUserBindingsByTelegramUserId,
  findTelegramUserBindingsByTelegramUserIdAndChatId as findLegacyTelegramUserBindingsByTelegramUserIdAndChatId,
} from "@/lib/google-sheets";
import {
  type PaymentSheetRecord,
  type TelegramAccessTokenSheetRecord,
  type TelegramUserBindingSheetRecord,
} from "@/lib/google-sheets-schema";

import {
  comparePaymentAccessRecords,
  compareTelegramBindingCollections,
  compareTelegramBindingRecords,
  compareTelegramTokenRecords,
  reportTelegramAccessShadowComparison,
  reportTelegramAccessShadowFailure,
  type TelegramAccessReadShadowComparison,
} from "./access-read-shadow";

export type { TelegramAccessReadShadowComparison } from "./access-read-shadow";

type PaymentRecord = PaymentSheetRecord | null;
type TokenRecord = TelegramAccessTokenSheetRecord | null;
type BindingRecord = TelegramUserBindingSheetRecord | null;

export type TelegramAccessReadSource = {
  findActiveBindings: () => Promise<TelegramUserBindingSheetRecord[]>;
  findBindingByPaymentIntentId: (paymentIntentId: string) => Promise<BindingRecord>;
  findBindingsByCustomerEmail: (
    customerEmail: string,
  ) => Promise<TelegramUserBindingSheetRecord[]>;
  findBindingsByTelegramUserId: (
    telegramUserId: string,
  ) => Promise<TelegramUserBindingSheetRecord[]>;
  findBindingsByTelegramUserIdAndChatId: (input: {
    chatId: string;
    telegramUserId: string;
  }) => Promise<TelegramUserBindingSheetRecord[]>;
  findLatestTokenByPaymentIntentId: (paymentIntentId: string) => Promise<TokenRecord>;
  findPaymentByIntentId: (paymentIntentId: string) => Promise<PaymentRecord>;
  findTokenByHash: (tokenHash: string) => Promise<TokenRecord>;
  findTokenByValue: (tokenValue: string) => Promise<TokenRecord>;
};

export type TelegramAccessReadDependencies = {
  database: TelegramAccessReadSource;
  legacy: TelegramAccessReadSource;
  sheets: TelegramAccessReadSource;
};

export type TelegramAccessReadOptions = {
  dependencies?: TelegramAccessReadDependencies;
  environment?: Readonly<Record<string, string | undefined>>;
  onShadowComparison?: (comparison: TelegramAccessReadShadowComparison) => void;
};

const defaultDependencies: TelegramAccessReadDependencies = {
  database: {
    findActiveBindings: domainRepositories.telegramAccessReads.findActiveBindings,
    findBindingByPaymentIntentId:
      domainRepositories.telegramAccessReads.findBindingByPaymentIntentId,
    findBindingsByCustomerEmail:
      domainRepositories.telegramAccessReads.findBindingsByCustomerEmail,
    findBindingsByTelegramUserId:
      domainRepositories.telegramAccessReads.findBindingsByTelegramUserId,
    findBindingsByTelegramUserIdAndChatId:
      domainRepositories.telegramAccessReads.findBindingsByTelegramUserIdAndChatId,
    findLatestTokenByPaymentIntentId:
      domainRepositories.telegramAccessReads.findLatestTokenByPaymentIntentId,
    findPaymentByIntentId: domainRepositories.paymentReads.findByPaymentIntentId,
    findTokenByHash: domainRepositories.telegramAccessReads.findTokenByHash,
    findTokenByValue: domainRepositories.telegramAccessReads.findTokenByValue,
  },
  legacy: {
    findActiveBindings: () => findLegacyActiveTelegramUserBindings(),
    findBindingByPaymentIntentId: (paymentIntentId) =>
      findLegacyTelegramUserBindingByPaymentIntentId(paymentIntentId),
    findBindingsByCustomerEmail: (customerEmail) =>
      findLegacyTelegramUserBindingsByCustomerEmail(customerEmail),
    findBindingsByTelegramUserId: (telegramUserId) =>
      findLegacyTelegramUserBindingsByTelegramUserId(telegramUserId),
    findBindingsByTelegramUserIdAndChatId: (input) =>
      findLegacyTelegramUserBindingsByTelegramUserIdAndChatId(input),
    findLatestTokenByPaymentIntentId: (paymentIntentId) =>
      findLegacyLatestTelegramAccessTokenRecordByPaymentIntentId(paymentIntentId),
    findPaymentByIntentId: (paymentIntentId) =>
      findLegacyPaymentRecordByIntentId(paymentIntentId),
    findTokenByHash: (tokenHash) =>
      findLegacyTelegramAccessTokenRecordByTokenHash(tokenHash),
    findTokenByValue: (tokenValue) =>
      findLegacyTelegramAccessTokenRecordByTokenValue(tokenValue),
  },
  sheets: {
    findActiveBindings: () => findLegacyActiveTelegramUserBindings({ source: "sheets" }),
    findBindingByPaymentIntentId: (paymentIntentId) =>
      findLegacyTelegramUserBindingByPaymentIntentId(paymentIntentId, {
        source: "sheets",
      }),
    findBindingsByCustomerEmail: (customerEmail) =>
      findLegacyTelegramUserBindingsByCustomerEmail(customerEmail, {
        source: "sheets",
      }),
    findBindingsByTelegramUserId: (telegramUserId) =>
      findLegacyTelegramUserBindingsByTelegramUserId(telegramUserId, {
        source: "sheets",
      }),
    findBindingsByTelegramUserIdAndChatId: (input) =>
      findLegacyTelegramUserBindingsByTelegramUserIdAndChatId({
        ...input,
        source: "sheets",
      }),
    findLatestTokenByPaymentIntentId: (paymentIntentId) =>
      findLegacyLatestTelegramAccessTokenRecordByPaymentIntentId(paymentIntentId, {
        source: "sheets",
      }),
    findPaymentByIntentId: (paymentIntentId) =>
      findLegacyPaymentRecordByIntentId(paymentIntentId, {
        cacheTtlMs: 0,
        source: "sheets",
      }),
    findTokenByHash: (tokenHash) =>
      findLegacyTelegramAccessTokenRecordByTokenHash(tokenHash, {
        source: "sheets",
      }),
    findTokenByValue: (tokenValue) =>
      findLegacyTelegramAccessTokenRecordByTokenValue(tokenValue, {
        source: "sheets",
      }),
  },
};

export const getTelegramAccessReadRuntime = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
) => getDomainPersistenceMode("telegramAccess", environment);

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
  ) => TelegramAccessReadShadowComparison;
  databaseRead: () => Promise<RecordType | null>;
  environment: Readonly<Record<string, string | undefined>>;
  key: string;
  legacyRead: () => Promise<RecordType | null>;
  onShadowComparison: (comparison: TelegramAccessReadShadowComparison) => void;
  recordType: TelegramAccessReadShadowComparison["recordType"];
  sheetsRead: () => Promise<RecordType | null>;
}) => {
  const mode = getTelegramAccessReadRuntime(environment);

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
      reportTelegramAccessShadowFailure(recordType, error);
    }
  }

  return primaryRecord;
};

const readBindings = async ({
  databaseRead,
  environment,
  key,
  legacyRead,
  onShadowComparison,
  sheetsRead,
}: {
  databaseRead: () => Promise<TelegramUserBindingSheetRecord[]>;
  environment: Readonly<Record<string, string | undefined>>;
  key: string;
  legacyRead: () => Promise<TelegramUserBindingSheetRecord[]>;
  onShadowComparison: (comparison: TelegramAccessReadShadowComparison) => void;
  sheetsRead: () => Promise<TelegramUserBindingSheetRecord[]>;
}) => {
  const mode = getTelegramAccessReadRuntime(environment);

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

      onShadowComparison(
        compareTelegramBindingCollections({ databaseRecords, key, sheetsRecords }),
      );
    } catch (error) {
      reportTelegramAccessShadowFailure("telegram_user_binding", error);
    }
  }

  return primaryRecords;
};

const withDefaults = (options: TelegramAccessReadOptions = {}) => ({
  dependencies: options.dependencies ?? defaultDependencies,
  environment: options.environment ?? process.env,
  onShadowComparison: options.onShadowComparison ?? reportTelegramAccessShadowComparison,
});

export const findPaymentRecordByIntentId = (
  paymentIntentId: string,
  options?: TelegramAccessReadOptions,
) => {
  const runtime = withDefaults(options);

  return readSingle({
    compare: comparePaymentAccessRecords,
    databaseRead: () =>
      runtime.dependencies.database.findPaymentByIntentId(paymentIntentId),
    environment: runtime.environment,
    key: `payment_access:${paymentIntentId}`,
    legacyRead: () => runtime.dependencies.legacy.findPaymentByIntentId(paymentIntentId),
    onShadowComparison: runtime.onShadowComparison,
    recordType: "payment_access",
    sheetsRead: () => runtime.dependencies.sheets.findPaymentByIntentId(paymentIntentId),
  });
};

export const findLatestTelegramAccessTokenRecordByPaymentIntentId = (
  paymentIntentId: string,
  options?: TelegramAccessReadOptions,
) => {
  const runtime = withDefaults(options);

  return readSingle({
    compare: compareTelegramTokenRecords,
    databaseRead: () =>
      runtime.dependencies.database.findLatestTokenByPaymentIntentId(paymentIntentId),
    environment: runtime.environment,
    key: `telegram_token:payment:${paymentIntentId}`,
    legacyRead: () =>
      runtime.dependencies.legacy.findLatestTokenByPaymentIntentId(paymentIntentId),
    onShadowComparison: runtime.onShadowComparison,
    recordType: "telegram_access_token",
    sheetsRead: () =>
      runtime.dependencies.sheets.findLatestTokenByPaymentIntentId(paymentIntentId),
  });
};

export const findTelegramAccessTokenRecordByTokenHash = (
  tokenHash: string,
  options?: TelegramAccessReadOptions,
) => {
  const runtime = withDefaults(options);

  return readSingle({
    compare: compareTelegramTokenRecords,
    databaseRead: () => runtime.dependencies.database.findTokenByHash(tokenHash),
    environment: runtime.environment,
    key: `telegram_token:hash:${tokenHash}`,
    legacyRead: () => runtime.dependencies.legacy.findTokenByHash(tokenHash),
    onShadowComparison: runtime.onShadowComparison,
    recordType: "telegram_access_token",
    sheetsRead: () => runtime.dependencies.sheets.findTokenByHash(tokenHash),
  });
};

export const findTelegramAccessTokenRecordByTokenValue = (
  tokenValue: string,
  options?: TelegramAccessReadOptions,
) => {
  const runtime = withDefaults(options);

  return readSingle({
    compare: compareTelegramTokenRecords,
    databaseRead: () => runtime.dependencies.database.findTokenByValue(tokenValue),
    environment: runtime.environment,
    key: `telegram_token:value:${tokenValue}`,
    legacyRead: () => runtime.dependencies.legacy.findTokenByValue(tokenValue),
    onShadowComparison: runtime.onShadowComparison,
    recordType: "telegram_access_token",
    sheetsRead: () => runtime.dependencies.sheets.findTokenByValue(tokenValue),
  });
};

export const findTelegramUserBindingByPaymentIntentId = (
  paymentIntentId: string,
  options?: TelegramAccessReadOptions,
) => {
  const runtime = withDefaults(options);

  return readSingle({
    compare: compareTelegramBindingRecords,
    databaseRead: () =>
      runtime.dependencies.database.findBindingByPaymentIntentId(paymentIntentId),
    environment: runtime.environment,
    key: `telegram_binding:payment:${paymentIntentId}`,
    legacyRead: () =>
      runtime.dependencies.legacy.findBindingByPaymentIntentId(paymentIntentId),
    onShadowComparison: runtime.onShadowComparison,
    recordType: "telegram_user_binding",
    sheetsRead: () =>
      runtime.dependencies.sheets.findBindingByPaymentIntentId(paymentIntentId),
  });
};

export const findTelegramUserBindingsByCustomerEmail = (
  customerEmail: string,
  options?: TelegramAccessReadOptions,
) => {
  const runtime = withDefaults(options);

  return readBindings({
    databaseRead: () =>
      runtime.dependencies.database.findBindingsByCustomerEmail(customerEmail),
    environment: runtime.environment,
    key: `telegram_binding:email:${customerEmail.trim().toLowerCase()}`,
    legacyRead: () =>
      runtime.dependencies.legacy.findBindingsByCustomerEmail(customerEmail),
    onShadowComparison: runtime.onShadowComparison,
    sheetsRead: () =>
      runtime.dependencies.sheets.findBindingsByCustomerEmail(customerEmail),
  });
};

export const findTelegramUserBindingsByTelegramUserId = (
  telegramUserId: string,
  options?: TelegramAccessReadOptions,
) => {
  const runtime = withDefaults(options);

  return readBindings({
    databaseRead: () =>
      runtime.dependencies.database.findBindingsByTelegramUserId(telegramUserId),
    environment: runtime.environment,
    key: `telegram_binding:user:${telegramUserId}`,
    legacyRead: () =>
      runtime.dependencies.legacy.findBindingsByTelegramUserId(telegramUserId),
    onShadowComparison: runtime.onShadowComparison,
    sheetsRead: () =>
      runtime.dependencies.sheets.findBindingsByTelegramUserId(telegramUserId),
  });
};

export const findTelegramUserBindingsByTelegramUserIdAndChatId = (
  input: { chatId: string; telegramUserId: string },
  options?: TelegramAccessReadOptions,
) => {
  const runtime = withDefaults(options);

  return readBindings({
    databaseRead: () =>
      runtime.dependencies.database.findBindingsByTelegramUserIdAndChatId(input),
    environment: runtime.environment,
    key: `telegram_binding:user_chat:${input.telegramUserId}:${input.chatId}`,
    legacyRead: () =>
      runtime.dependencies.legacy.findBindingsByTelegramUserIdAndChatId(input),
    onShadowComparison: runtime.onShadowComparison,
    sheetsRead: () =>
      runtime.dependencies.sheets.findBindingsByTelegramUserIdAndChatId(input),
  });
};

export const findActiveTelegramUserBindings = (options?: TelegramAccessReadOptions) => {
  const runtime = withDefaults(options);

  return readBindings({
    databaseRead: runtime.dependencies.database.findActiveBindings,
    environment: runtime.environment,
    key: "telegram_binding:active",
    legacyRead: runtime.dependencies.legacy.findActiveBindings,
    onShadowComparison: runtime.onShadowComparison,
    sheetsRead: runtime.dependencies.sheets.findActiveBindings,
  });
};
