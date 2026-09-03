import { domainRepositories } from "@/db/domain-repositories";
import type {
  PaymentSheetRecord,
  TelegramAccessTokenSheetRecord,
  TelegramUserBindingSheetRecord,
} from "@/lib/google-sheets-schema";

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
};

export type TelegramAccessReadOptions = {
  dependencies?: TelegramAccessReadDependencies;
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
};

const getDatabaseSource = (options?: TelegramAccessReadOptions) =>
  options?.dependencies?.database ?? defaultDependencies.database;

export const findPaymentRecordByIntentId = (
  paymentIntentId: string,
  options?: TelegramAccessReadOptions,
) => getDatabaseSource(options).findPaymentByIntentId(paymentIntentId);

export const findLatestTelegramAccessTokenRecordByPaymentIntentId = (
  paymentIntentId: string,
  options?: TelegramAccessReadOptions,
) => getDatabaseSource(options).findLatestTokenByPaymentIntentId(paymentIntentId);

export const findTelegramAccessTokenRecordByTokenHash = (
  tokenHash: string,
  options?: TelegramAccessReadOptions,
) => getDatabaseSource(options).findTokenByHash(tokenHash);

export const findTelegramAccessTokenRecordByTokenValue = (
  tokenValue: string,
  options?: TelegramAccessReadOptions,
) => getDatabaseSource(options).findTokenByValue(tokenValue);

export const findTelegramUserBindingByPaymentIntentId = (
  paymentIntentId: string,
  options?: TelegramAccessReadOptions,
) => getDatabaseSource(options).findBindingByPaymentIntentId(paymentIntentId);

export const findTelegramUserBindingsByCustomerEmail = (
  customerEmail: string,
  options?: TelegramAccessReadOptions,
) => getDatabaseSource(options).findBindingsByCustomerEmail(customerEmail);

export const findTelegramUserBindingsByTelegramUserId = (
  telegramUserId: string,
  options?: TelegramAccessReadOptions,
) => getDatabaseSource(options).findBindingsByTelegramUserId(telegramUserId);

export const findTelegramUserBindingsByTelegramUserIdAndChatId = (
  input: { chatId: string; telegramUserId: string },
  options?: TelegramAccessReadOptions,
) => getDatabaseSource(options).findBindingsByTelegramUserIdAndChatId(input);

export const findActiveTelegramUserBindings = (options?: TelegramAccessReadOptions) =>
  getDatabaseSource(options).findActiveBindings();
