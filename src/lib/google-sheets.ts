import { createSign } from "node:crypto";

import { isAdminOfferAccessWorkflow } from "@/lib/telegram/admin-offer-access";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_API_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DEFAULT_PAYMENTS_SHEET_NAME = "Payments";
const DEFAULT_STRIPE_EVENTS_SHEET_NAME = "StripeEvents";
const DEFAULT_SUCCESSFUL_CUSTOMERS_SHEET_NAME = "SuccessfulCustomers";
const DEFAULT_MONTHLY_SALES_REPORT_RUNS_SHEET_NAME = "MonthlySalesReports";
const DEFAULT_TELEGRAM_ACCESS_TOKENS_SHEET_NAME = "TelegramAccessTokens";
const DEFAULT_TELEGRAM_USER_BINDINGS_SHEET_NAME = "TelegramUserBindings";

const PAYMENT_SHEET_HEADERS = [
  "payment_intent_id",
  "customer_email",
  "customer_full_name",
  "customer_nickname",
  "customer_country",
  "latest_event_id",
  "latest_event_type",
  "status",
  "outcome",
  "amount",
  "currency",
  "product_id",
  "product_title",
  "offer_id",
  "offer_label",
  "checkout_currency",
  "checkout_locale",
  "lesson_language",
  "last_payment_error_code",
  "last_payment_error_message",
  "first_seen_at",
  "successful_customer_logged_at",
  "updated_at",
  "checkout_session_id",
  "purchase_item",
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
  "email_delivery_status",
  "email_delivery_updated_at",
  "with_mentor_alert_status",
  "with_mentor_alert_updated_at",
  "customer_address",
  "customer_city",
  "customer_postal_code",
  "invoice_number",
  "invoice_issued_at",
] as const;
const PAYMENT_SHEET_HEADER_LABELS: Record<
  (typeof PAYMENT_SHEET_HEADERS)[number],
  string
> = {
  payment_intent_id: "ID платежа (PaymentIntent)",
  customer_email: "Email клиента",
  customer_full_name: "ФИО",
  customer_nickname: "Telegram username",
  customer_country: "Страна",
  latest_event_id: "Последний Stripe Event ID",
  latest_event_type: "Тип последнего Stripe события",
  status: "Технический статус",
  outcome: "Результат оплаты",
  amount: "Сумма (minor units)",
  currency: "Валюта",
  product_id: "ID продукта",
  product_title: "Название продукта",
  offer_id: "ID тарифа",
  offer_label: "Название тарифа",
  checkout_currency: "Валюта checkout",
  checkout_locale: "Язык checkout",
  lesson_language: "Язык материалов",
  last_payment_error_code: "Код последней ошибки",
  last_payment_error_message: "Текст последней ошибки",
  first_seen_at: "Создано в таблице",
  successful_customer_logged_at: "Когда записан в SuccessfulCustomers",
  updated_at: "Последнее обновление",
  checkout_session_id: "Checkout session ID",
  purchase_item: "Что купили",
  delivery_channel: "Канал доставки",
  access_workflow: "Сценарий доступа",
  telegram_access_status: "Статус Telegram-доступа",
  telegram_token_id: "ID Telegram-токена",
  telegram_token_expires_at: "Срок действия токена",
  telegram_token_used_at: "Когда токен использован",
  telegram_user_id: "Telegram user ID",
  telegram_username: "Telegram username (активировавший)",
  telegram_channel_chat_id: "ID Telegram-канала",
  telegram_access_expires_at: "Доступ в Telegram до",
  telegram_access_revoked_at: "Когда Telegram-доступ отозван",
  email_delivery_status: "Статус отправки email",
  email_delivery_updated_at: "Когда обновлен статус email",
  with_mentor_alert_status: "Статус admin Telegram-алерта",
  with_mentor_alert_updated_at: "Когда обновлен admin Telegram-алерт",
  customer_address: "Адрес клиента",
  customer_city: "Город клиента",
  customer_postal_code: "Почтовый код клиента",
  invoice_number: "Номер инвойса",
  invoice_issued_at: "Когда выдан инвойс",
};

const STRIPE_EVENT_SHEET_HEADERS = [
  "event_id",
  "event_type",
  "payment_intent_id",
  "status",
  "outcome",
  "processed_at",
] as const;
const STRIPE_EVENT_SHEET_HEADER_LABELS: Record<
  (typeof STRIPE_EVENT_SHEET_HEADERS)[number],
  string
> = {
  event_id: "Stripe Event ID",
  event_type: "Тип события",
  payment_intent_id: "ID платежа (PaymentIntent)",
  status: "Технический статус",
  outcome: "Результат",
  processed_at: "Когда обработано",
};

const SUCCESSFUL_CUSTOMERS_SHEET_HEADERS = [
  "payment_intent_id",
  "customer_email",
  "customer_full_name",
  "customer_nickname",
  "customer_full_address",
  "customer_country",
  "purchase_item",
  "product_id",
  "product_title",
  "offer_id",
  "offer_label",
] as const;
const SUCCESSFUL_CUSTOMERS_SHEET_HEADER_LABELS: Record<
  (typeof SUCCESSFUL_CUSTOMERS_SHEET_HEADERS)[number],
  string
> = {
  payment_intent_id: "ID платежа (PaymentIntent)",
  customer_email: "Email клиента",
  customer_full_name: "ФИО",
  customer_nickname: "Telegram username",
  customer_full_address: "Полный адрес клиента",
  customer_country: "Страна",
  purchase_item: "Что купили",
  product_id: "ID продукта",
  product_title: "Название продукта",
  offer_id: "ID тарифа",
  offer_label: "Название тарифа",
};

const TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS = [
  "token_id",
  "token_hash",
  "token_value",
  "payment_intent_id",
  "product_id",
  "offer_id",
  "customer_email",
  "link_kind",
  "chat_id",
  "access_expires_at",
  "status",
  "created_at",
  "expires_at",
  "used_at",
  "telegram_user_id",
  "telegram_username",
  "last_error",
] as const;
const TELEGRAM_ACCESS_TOKENS_SHEET_HEADER_LABELS: Record<
  (typeof TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS)[number],
  string
> = {
  token_id: "ID токена",
  token_hash: "Хэш токена",
  token_value: "Значение токена (start)",
  payment_intent_id: "ID платежа (PaymentIntent)",
  product_id: "ID продукта",
  offer_id: "ID тарифа",
  customer_email: "Email клиента",
  link_kind: "Тип ссылки",
  chat_id: "ID Telegram-чата",
  access_expires_at: "Доступ до",
  status: "Статус токена",
  created_at: "Создан",
  expires_at: "Действует до",
  used_at: "Использован",
  telegram_user_id: "Telegram user ID",
  telegram_username: "Telegram username",
  last_error: "Последняя ошибка",
};

const TELEGRAM_USER_BINDINGS_SHEET_HEADERS = [
  "telegram_user_id",
  "telegram_username",
  "payment_intent_id",
  "customer_email",
  "product_id",
  "offer_id",
  "chat_id",
  "invite_link",
  "bound_at",
  "last_seen_at",
  "access_expires_at",
  "revoked_at",
  "revoked_reason",
  "status",
] as const;
const MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS = [
  "report_key",
  "report_family",
  "period_start_utc",
  "period_end_utc",
  "generated_at_utc",
  "delivery_status",
  "delivered_at_utc",
  "delivered_to",
  "row_count",
  "csv_sha256",
] as const;
const TELEGRAM_USER_BINDINGS_SHEET_HEADER_LABELS: Record<
  (typeof TELEGRAM_USER_BINDINGS_SHEET_HEADERS)[number],
  string
> = {
  telegram_user_id: "Telegram user ID",
  telegram_username: "Telegram username",
  payment_intent_id: "ID платежа (PaymentIntent)",
  customer_email: "Email клиента",
  product_id: "ID продукта",
  offer_id: "ID тарифа",
  chat_id: "ID Telegram-чата",
  invite_link: "Использованная invite-ссылка",
  bound_at: "Когда привязано",
  last_seen_at: "Последняя активность",
  access_expires_at: "Доступ до",
  revoked_at: "Когда доступ отозван",
  revoked_reason: "Причина отзыва",
  status: "Статус привязки",
};
const MONTHLY_SALES_REPORT_RUNS_SHEET_HEADER_LABELS: Record<
  (typeof MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS)[number],
  string
> = {
  report_key: "Ключ отчета",
  report_family: "Тип отчета",
  period_start_utc: "Начало периода (UTC)",
  period_end_utc: "Конец периода (UTC)",
  generated_at_utc: "Когда сгенерировано (UTC)",
  delivery_status: "Статус отправки",
  delivered_at_utc: "Когда отправлено (UTC)",
  delivered_to: "Кому отправлено",
  row_count: "Количество строк",
  csv_sha256: "SHA256 CSV",
};

type GoogleSheetsTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
};

type GoogleSheetsValuesResponse = {
  values?: string[][];
};

type GoogleSheetsMetadataResponse = {
  sheets?: Array<{
    properties?: {
      title?: string;
    };
  }>;
};

type GoogleSheetsValueRangeBody = {
  majorDimension?: "ROWS";
  values: string[][];
};

type GoogleSheetsConfig = {
  paymentsSheetName: string;
  monthlySalesReportRunsSheetName: string;
  privateKey: string;
  serviceAccountEmail: string;
  spreadsheetId: string;
  successfulCustomersSheetName: string;
  stripeEventsSheetName: string;
  telegramAccessTokensSheetName: string;
  telegramUserBindingsSheetName: string;
};

type AccessTokenCache = {
  expiresAt: number;
  token: string;
};

type SheetTitleCache = {
  sheetTitles: Set<string>;
  spreadsheetId: string;
};

type HeaderValidationCacheEntry = {
  expiresAt: number;
};

type RowsCacheEntry = {
  expiresAt: number;
  rows: Array<Record<string, string>>;
};

type RowLookupCacheEntry = {
  expiresAt: number;
  record: Record<string, string> | null;
  rowNumber: number | null;
};

type PaymentRecordByIntentCacheEntry = {
  expiresAt: number;
  record: PaymentSheetRecord | null;
};

type PaymentSheetHeader = (typeof PAYMENT_SHEET_HEADERS)[number];
type StripeEventSheetHeader = (typeof STRIPE_EVENT_SHEET_HEADERS)[number];
type SuccessfulCustomersSheetHeader = (typeof SUCCESSFUL_CUSTOMERS_SHEET_HEADERS)[number];
type TelegramAccessTokensSheetHeader =
  (typeof TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS)[number];
type TelegramUserBindingsSheetHeader =
  (typeof TELEGRAM_USER_BINDINGS_SHEET_HEADERS)[number];
type MonthlySalesReportRunsSheetHeader =
  (typeof MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS)[number];

export type PaymentSheetRecord = Record<PaymentSheetHeader, string>;
export type StripeEventSheetRecord = Record<StripeEventSheetHeader, string>;
export type SuccessfulCustomersSheetRecord = Record<
  SuccessfulCustomersSheetHeader,
  string
>;
export type TelegramAccessTokenSheetRecord = Record<
  TelegramAccessTokensSheetHeader,
  string
>;
export type TelegramUserBindingSheetRecord = Record<
  TelegramUserBindingsSheetHeader,
  string
>;
export type MonthlySalesReportRunSheetRecord = Record<
  MonthlySalesReportRunsSheetHeader,
  string
>;
export type AdminInviteLinkHistorySourceRecord = {
  accessUrl: string;
  adminLabel: string;
  createdAt: string;
  lessonLanguage: string;
  offerLabel: string;
  productTitle: string;
  purchaseItem: string;
  tokenExpiresAt: string;
  tokenUsedAt: string;
};

export class GoogleSheetsError extends Error {
  code: string;
  details: string;
  status: number | null;

  constructor(code: string, details: string, status: number | null = null) {
    super(code);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export const isGoogleSheetsRateLimitError = (error: unknown) =>
  error instanceof GoogleSheetsError && error.status === 429;

let accessTokenCache: AccessTokenCache | null = null;
let sheetTitleCache: SheetTitleCache | null = null;
let schemaSyncPromise: Promise<void> | null = null;
const headerValidationCache = new Map<string, HeaderValidationCacheEntry>();
const pendingHeaderValidation = new Map<string, Promise<void>>();
const rowsCache = new Map<string, RowsCacheEntry>();
const rowLookupCache = new Map<string, RowLookupCacheEntry>();
const paymentRecordByIntentCache = new Map<string, PaymentRecordByIntentCacheEntry>();

const SHEET_HEADERS_CACHE_TTL_MS = 60 * 60 * 1000;
const SHEET_ROWS_CACHE_TTL_MS = 60 * 1000;
const PAYMENT_RECORD_CACHE_TTL_MS = 60 * 1000;
const GOOGLE_SHEETS_REQUEST_MAX_RETRIES = 3;
const GOOGLE_SHEETS_RETRY_BASE_DELAY_MS = 250;
const GOOGLE_SHEETS_RETRY_MAX_DELAY_MS = 4_000;
const GOOGLE_SHEETS_RATE_LIMIT_BACKOFF_MS = 20_000;
let googleSheetsRateLimitedUntil = 0;

const encodeBase64Url = (value: string) =>
  Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

const escapeSheetTitle = (sheetTitle: string) => `'${sheetTitle.replaceAll("'", "''")}'`;

const columnIndexToLetter = (columnIndex: number) => {
  let currentColumnIndex = columnIndex;
  let columnLabel = "";

  while (currentColumnIndex > 0) {
    const remainder = (currentColumnIndex - 1) % 26;
    columnLabel = String.fromCharCode(65 + remainder) + columnLabel;
    currentColumnIndex = Math.floor((currentColumnIndex - 1) / 26);
  }

  return columnLabel;
};

const getSheetKey = (config: GoogleSheetsConfig, sheetTitle: string) =>
  `${config.spreadsheetId}:${sheetTitle}`;

const getRowsCacheKey = (
  config: GoogleSheetsConfig,
  sheetTitle: string,
  headers: readonly string[],
) => `${getSheetKey(config, sheetTitle)}:${headers.join("|")}`;

const getHeaderCacheKey = (
  config: GoogleSheetsConfig,
  sheetTitle: string,
  expectedHeaderRow: readonly string[],
) => `${getSheetKey(config, sheetTitle)}:${expectedHeaderRow.join("|")}`;

const getRowLookupCacheKey = (
  config: GoogleSheetsConfig,
  sheetTitle: string,
  headers: readonly string[],
  fieldName: string,
  fieldValue: string,
) => `${getSheetKey(config, sheetTitle)}:${headers.join("|")}:${fieldName}:${fieldValue}`;

const invalidateSheetCaches = (config: GoogleSheetsConfig, sheetTitle: string) => {
  const sheetPrefix = `${getSheetKey(config, sheetTitle)}:`;

  Array.from(rowsCache.keys()).forEach((key) => {
    if (key.startsWith(sheetPrefix)) {
      rowsCache.delete(key);
    }
  });

  Array.from(headerValidationCache.keys()).forEach((key) => {
    if (key.startsWith(sheetPrefix)) {
      headerValidationCache.delete(key);
    }
  });

  Array.from(rowLookupCache.keys()).forEach((key) => {
    if (key.startsWith(sheetPrefix)) {
      rowLookupCache.delete(key);
    }
  });
};

const getGoogleSheetsConfig = (): GoogleSheetsConfig | null => {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY ?? "")
    .replace(/^"|"$/g, "")
    .replace(/\\n/g, "\n")
    .trim();
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ?? "";

  if (!serviceAccountEmail || !privateKey || !spreadsheetId) {
    return null;
  }

  return {
    paymentsSheetName: DEFAULT_PAYMENTS_SHEET_NAME,
    monthlySalesReportRunsSheetName: DEFAULT_MONTHLY_SALES_REPORT_RUNS_SHEET_NAME,
    privateKey,
    serviceAccountEmail,
    spreadsheetId,
    successfulCustomersSheetName: DEFAULT_SUCCESSFUL_CUSTOMERS_SHEET_NAME,
    stripeEventsSheetName: DEFAULT_STRIPE_EVENTS_SHEET_NAME,
    telegramAccessTokensSheetName: DEFAULT_TELEGRAM_ACCESS_TOKENS_SHEET_NAME,
    telegramUserBindingsSheetName: DEFAULT_TELEGRAM_USER_BINDINGS_SHEET_NAME,
  };
};

const getJwtAssertion = (config: GoogleSheetsConfig) => {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
    }),
  );
  const payload = encodeBase64Url(
    JSON.stringify({
      aud: GOOGLE_OAUTH_TOKEN_URL,
      exp: nowInSeconds + 3600,
      iat: nowInSeconds,
      iss: config.serviceAccountEmail,
      scope: GOOGLE_SHEETS_SCOPE,
    }),
  );
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");

  signer.update(unsignedToken);
  signer.end();

  const signature = signer
    .sign(config.privateKey)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

  return `${unsignedToken}.${signature}`;
};

const getGoogleAccessToken = async (config: GoogleSheetsConfig) => {
  assertGoogleSheetsRateLimitWindow();

  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) {
    return accessTokenCache.token;
  }

  for (let attempt = 0; attempt <= GOOGLE_SHEETS_REQUEST_MAX_RETRIES; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          assertion: getJwtAssertion(config),
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        }),
        cache: "no-store",
      });
    } catch (error) {
      if (attempt === GOOGLE_SHEETS_REQUEST_MAX_RETRIES) {
        throw new GoogleSheetsError(
          "google_access_token_network_error",
          error instanceof Error
            ? error.message
            : "Failed to obtain Google access token.",
          null,
        );
      }

      await sleep(getRetryDelayMs(attempt, null));
      continue;
    }

    const responseText = await response.text();
    let data: GoogleSheetsTokenResponse | null = null;

    if (responseText) {
      try {
        data = JSON.parse(responseText) as GoogleSheetsTokenResponse;
      } catch {
        data = null;
      }
    }

    if (response.ok && data?.access_token) {
      const expiresInMs = Math.max((data.expires_in ?? 3600) - 60, 60) * 1000;

      accessTokenCache = {
        expiresAt: Date.now() + expiresInMs,
        token: data.access_token,
      };

      return data.access_token;
    }

    if (response.status === 429) {
      setGoogleSheetsRateLimitBackoff(
        parseRetryAfterMs(response.headers.get("retry-after")),
      );

      throw new GoogleSheetsError(
        data?.error ?? "google_access_token_failed",
        data?.error_description ||
          responseText ||
          "Failed to obtain Google access token.",
        response.status,
      );
    }

    if (attempt < GOOGLE_SHEETS_REQUEST_MAX_RETRIES && response.status >= 500) {
      await sleep(
        getRetryDelayMs(attempt, parseRetryAfterMs(response.headers.get("retry-after"))),
      );
      continue;
    }

    throw new GoogleSheetsError(
      data?.error ?? "google_access_token_failed",
      data?.error_description || responseText || "Failed to obtain Google access token.",
      response.status,
    );
  }

  throw new GoogleSheetsError(
    "google_access_token_failed",
    "Failed to obtain Google access token after retry attempts.",
    null,
  );
};

const getGoogleSheetsUrl = (config: GoogleSheetsConfig, path: string) =>
  `${GOOGLE_SHEETS_API_BASE_URL}/${config.spreadsheetId}${path}`;

const sleep = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

const parseRetryAfterMs = (value: string | null) => {
  if (!value) {
    return null;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const atMs = Date.parse(value);

  if (!Number.isFinite(atMs)) {
    return null;
  }

  return Math.max(0, atMs - Date.now());
};

const setGoogleSheetsRateLimitBackoff = (retryAfterMs: number | null) => {
  const fallbackBackoffMs = GOOGLE_SHEETS_RATE_LIMIT_BACKOFF_MS;
  const effectiveBackoffMs =
    Number.isFinite(retryAfterMs) && (retryAfterMs ?? 0) > 0
      ? Math.max(fallbackBackoffMs, retryAfterMs ?? 0)
      : fallbackBackoffMs;

  googleSheetsRateLimitedUntil = Math.max(
    googleSheetsRateLimitedUntil,
    Date.now() + effectiveBackoffMs,
  );
};

const assertGoogleSheetsRateLimitWindow = () => {
  if (googleSheetsRateLimitedUntil <= Date.now()) {
    return;
  }

  throw new GoogleSheetsError(
    "google_sheets_request_failed",
    "Google Sheets requests are temporarily paused due to recent rate limiting.",
    429,
  );
};

const getRetryDelayMs = (attempt: number, retryAfterMs: number | null) => {
  if (retryAfterMs !== null) {
    return Math.min(retryAfterMs, GOOGLE_SHEETS_RETRY_MAX_DELAY_MS);
  }

  const exponential = Math.min(
    GOOGLE_SHEETS_RETRY_BASE_DELAY_MS * 2 ** attempt,
    GOOGLE_SHEETS_RETRY_MAX_DELAY_MS,
  );
  const jitter = Math.floor(Math.random() * 200);

  return exponential + jitter;
};

const isRetriableGoogleSheetsStatus = (status: number) => status === 401 || status >= 500;

const googleSheetsRequest = async <T>(
  config: GoogleSheetsConfig,
  path: string,
  init?: RequestInit,
) => {
  assertGoogleSheetsRateLimitWindow();

  for (let attempt = 0; attempt <= GOOGLE_SHEETS_REQUEST_MAX_RETRIES; attempt += 1) {
    let accessToken: string;

    try {
      accessToken = await getGoogleAccessToken(config);
    } catch (error) {
      if (attempt === GOOGLE_SHEETS_REQUEST_MAX_RETRIES) {
        throw error;
      }

      await sleep(getRetryDelayMs(attempt, null));
      continue;
    }

    let response: Response;

    try {
      response = await fetch(getGoogleSheetsUrl(config, path), {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(init?.headers ?? {}),
        },
        cache: "no-store",
      });
    } catch (error) {
      if (attempt === GOOGLE_SHEETS_REQUEST_MAX_RETRIES) {
        throw new GoogleSheetsError(
          "google_sheets_network_error",
          error instanceof Error
            ? error.message
            : "Google Sheets network request failed.",
          null,
        );
      }

      await sleep(getRetryDelayMs(attempt, null));
      continue;
    }

    if (response.status === 204) {
      return null as T;
    }

    const responseText = await response.text();
    let data: T | null = null;

    if (responseText) {
      try {
        data = JSON.parse(responseText) as T;
      } catch {
        data = null;
      }
    }

    if (response.ok) {
      return data as T;
    }

    if (response.status === 429) {
      setGoogleSheetsRateLimitBackoff(
        parseRetryAfterMs(response.headers.get("retry-after")),
      );

      throw new GoogleSheetsError(
        "google_sheets_request_failed",
        responseText || "Google Sheets request failed.",
        response.status,
      );
    }

    if (response.status === 401) {
      accessTokenCache = null;
    }

    if (
      attempt < GOOGLE_SHEETS_REQUEST_MAX_RETRIES &&
      isRetriableGoogleSheetsStatus(response.status)
    ) {
      await sleep(
        getRetryDelayMs(attempt, parseRetryAfterMs(response.headers.get("retry-after"))),
      );
      continue;
    }

    throw new GoogleSheetsError(
      "google_sheets_request_failed",
      responseText || "Google Sheets request failed.",
      response.status,
    );
  }

  throw new GoogleSheetsError(
    "google_sheets_request_failed",
    "Google Sheets request failed after retry attempts.",
    null,
  );
};

const getSheetTitleSet = async (config: GoogleSheetsConfig) => {
  if (sheetTitleCache?.spreadsheetId === config.spreadsheetId) {
    return sheetTitleCache.sheetTitles;
  }

  const metadata = await googleSheetsRequest<GoogleSheetsMetadataResponse>(
    config,
    "?fields=sheets.properties.title",
    {
      method: "GET",
    },
  );
  const sheetTitles = new Set(
    (metadata.sheets ?? [])
      .map((sheet) => sheet.properties?.title?.trim() ?? "")
      .filter(Boolean),
  );

  sheetTitleCache = {
    sheetTitles,
    spreadsheetId: config.spreadsheetId,
  };

  return sheetTitles;
};

const ensureSheetExists = async (config: GoogleSheetsConfig, sheetTitle: string) => {
  const sheetTitles = await getSheetTitleSet(config);

  if (sheetTitles.has(sheetTitle)) {
    return;
  }

  try {
    await googleSheetsRequest(config, ":batchUpdate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetTitle,
              },
            },
          },
        ],
      }),
    });
  } catch (error) {
    if (
      error instanceof GoogleSheetsError &&
      error.status === 400 &&
      error.details.includes("already exists")
    ) {
      // Another concurrent request created the sheet first.
      sheetTitles.add(sheetTitle);
      return;
    }

    throw error;
  }

  sheetTitles.add(sheetTitle);
};

const getSheetRange = (sheetTitle: string, range: string) =>
  `${escapeSheetTitle(sheetTitle)}!${range}`;

const getSheetValues = async (
  config: GoogleSheetsConfig,
  sheetTitle: string,
  range: string,
) => {
  const encodedRange = encodeURIComponent(getSheetRange(sheetTitle, range));
  const data = await googleSheetsRequest<GoogleSheetsValuesResponse>(
    config,
    `/values/${encodedRange}`,
    {
      method: "GET",
    },
  );

  return data.values ?? [];
};

const updateSheetValues = async (
  config: GoogleSheetsConfig,
  sheetTitle: string,
  range: string,
  values: string[][],
) => {
  const encodedRange = encodeURIComponent(getSheetRange(sheetTitle, range));

  await googleSheetsRequest(config, `/values/${encodedRange}?valueInputOption=RAW`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      majorDimension: "ROWS",
      values,
    } satisfies GoogleSheetsValueRangeBody),
  });

  invalidateSheetCaches(config, sheetTitle);
};

const appendSheetValues = async (
  config: GoogleSheetsConfig,
  sheetTitle: string,
  range: string,
  values: string[][],
) => {
  const encodedRange = encodeURIComponent(getSheetRange(sheetTitle, range));

  await googleSheetsRequest(
    config,
    `/values/${encodedRange}:append?insertDataOption=INSERT_ROWS&valueInputOption=RAW`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        majorDimension: "ROWS",
        values,
      } satisfies GoogleSheetsValueRangeBody),
    },
  );

  invalidateSheetCaches(config, sheetTitle);
};

const areHeadersEqual = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((header, index) => right[index] === header);

const toHeaderLabels = <T extends string>(
  headers: readonly T[],
  labelsMap: Partial<Record<T, string>> | undefined,
) =>
  headers.map((header) => {
    const label = labelsMap?.[header];

    return label?.trim() ? label : header;
  });

const mapRowToRecord = <T extends string>(headers: readonly T[], row: string[]) =>
  headers.reduce(
    (record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    },
    {} as Record<T, string>,
  );

const ensureSheetHeaders = async (
  config: GoogleSheetsConfig,
  sheetTitle: string,
  headers: readonly string[],
  labelsMap?: Partial<Record<string, string>>,
) => {
  await ensureSheetExists(config, sheetTitle);

  const expectedHeaderRow = toHeaderLabels(headers, labelsMap);
  const headerCacheKey = getHeaderCacheKey(config, sheetTitle, expectedHeaderRow);
  const cachedHeaderValidation = headerValidationCache.get(headerCacheKey);

  if (cachedHeaderValidation && cachedHeaderValidation.expiresAt > Date.now()) {
    return;
  }

  const pendingValidation = pendingHeaderValidation.get(headerCacheKey);

  if (pendingValidation) {
    await pendingValidation;
    return;
  }

  const validationPromise = (async () => {
    const currentHeaderRow = (await getSheetValues(config, sheetTitle, "1:1"))[0] ?? [];
    const hasExpectedHeaders = areHeadersEqual(expectedHeaderRow, currentHeaderRow);

    if (!hasExpectedHeaders) {
      const lastColumnLetter = columnIndexToLetter(headers.length);

      await updateSheetValues(config, sheetTitle, `A1:${lastColumnLetter}1`, [
        expectedHeaderRow,
      ]);
    }

    headerValidationCache.set(headerCacheKey, {
      expiresAt: Date.now() + SHEET_HEADERS_CACHE_TTL_MS,
    });
  })();

  pendingHeaderValidation.set(headerCacheKey, validationPromise);

  try {
    await validationPromise;
  } finally {
    pendingHeaderValidation.delete(headerCacheKey);
  }
};

const getRows = async <T extends string>(
  config: GoogleSheetsConfig,
  sheetTitle: string,
  headers: readonly T[],
  labelsMap?: Partial<Record<T, string>>,
  options?: {
    cacheTtlMs?: number;
  },
) => {
  const cacheTtlMs = options?.cacheTtlMs ?? SHEET_ROWS_CACHE_TTL_MS;
  const rowsCacheKey = getRowsCacheKey(config, sheetTitle, headers);
  const cachedRows = rowsCache.get(rowsCacheKey);

  if (cacheTtlMs > 0 && cachedRows && cachedRows.expiresAt > Date.now()) {
    return cachedRows.rows as Array<Record<T, string>>;
  }

  await ensureSheetHeaders(config, sheetTitle, headers, labelsMap);

  const lastColumnLetter = columnIndexToLetter(headers.length);
  const values = await getSheetValues(config, sheetTitle, `A1:${lastColumnLetter}`);
  const mappedRows = values
    .slice(1)
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) => mapRowToRecord(headers, row));

  if (cacheTtlMs > 0) {
    rowsCache.set(rowsCacheKey, {
      expiresAt: Date.now() + cacheTtlMs,
      rows: mappedRows as Array<Record<string, string>>,
    });
  }

  return mappedRows;
};

const getHeaderColumnIndex = <T extends string>(headers: readonly T[], header: T) => {
  const columnIndex = headers.indexOf(header);

  if (columnIndex < 0) {
    throw new GoogleSheetsError(
      "google_sheets_header_missing",
      `Header "${String(header)}" is not configured for sheet lookup.`,
      null,
    );
  }

  return columnIndex + 1;
};

const findRecordAndRowByFieldValue = async <T extends string>({
  cacheTtlMs = SHEET_ROWS_CACHE_TTL_MS,
  config,
  fieldName,
  fieldValue,
  headers,
  labelsMap,
  sheetTitle,
}: {
  cacheTtlMs?: number;
  config: GoogleSheetsConfig;
  fieldName: T;
  fieldValue: string;
  headers: readonly T[];
  labelsMap?: Partial<Record<T, string>>;
  sheetTitle: string;
}) => {
  const cacheKey = getRowLookupCacheKey(
    config,
    sheetTitle,
    headers,
    String(fieldName),
    fieldValue,
  );
  const cachedEntry = rowLookupCache.get(cacheKey);

  if (cacheTtlMs > 0 && cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return {
      record: (cachedEntry.record as Record<T, string> | null) ?? null,
      rowNumber: cachedEntry.rowNumber,
    };
  }

  await ensureSheetHeaders(config, sheetTitle, headers, labelsMap);
  const lastColumnLetter = columnIndexToLetter(headers.length);
  const values = await getSheetValues(config, sheetTitle, `A2:${lastColumnLetter}`);
  const fieldColumnIndex = getHeaderColumnIndex(headers, fieldName) - 1;
  const rowIndex = values.findIndex(
    (row) => (row[fieldColumnIndex] ?? "") === fieldValue,
  );
  const rowNumber = rowIndex >= 0 ? rowIndex + 2 : null;
  const record = rowIndex >= 0 ? mapRowToRecord(headers, values[rowIndex] ?? []) : null;

  if (cacheTtlMs > 0) {
    rowLookupCache.set(cacheKey, {
      expiresAt: Date.now() + cacheTtlMs,
      record: (record as Record<string, string> | null) ?? null,
      rowNumber,
    });
  }

  return {
    record,
    rowNumber,
  };
};

const toOrderedRow = <T extends string>(
  headers: readonly T[],
  record: Record<T, string>,
) => headers.map((header) => record[header] ?? "");

const parseTimestamp = (value: string) => {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const isGoogleSheetsConfigured = () => Boolean(getGoogleSheetsConfig());

export const ensureGoogleSheetsSchema = async () => {
  if (schemaSyncPromise) {
    await schemaSyncPromise;
    return;
  }

  schemaSyncPromise = (async () => {
    const config = getGoogleSheetsConfig();

    if (!config) {
      throw new GoogleSheetsError(
        "google_sheets_not_configured",
        "Google Sheets env variables are missing.",
        null,
      );
    }

    await Promise.all([
      ensureSheetHeaders(
        config,
        config.paymentsSheetName,
        PAYMENT_SHEET_HEADERS,
        PAYMENT_SHEET_HEADER_LABELS,
      ),
      ensureSheetHeaders(
        config,
        config.stripeEventsSheetName,
        STRIPE_EVENT_SHEET_HEADERS,
        STRIPE_EVENT_SHEET_HEADER_LABELS,
      ),
      ensureSheetHeaders(
        config,
        config.successfulCustomersSheetName,
        SUCCESSFUL_CUSTOMERS_SHEET_HEADERS,
        SUCCESSFUL_CUSTOMERS_SHEET_HEADER_LABELS,
      ),
      ensureSheetHeaders(
        config,
        config.monthlySalesReportRunsSheetName,
        MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
        MONTHLY_SALES_REPORT_RUNS_SHEET_HEADER_LABELS,
      ),
      ensureSheetHeaders(
        config,
        config.telegramAccessTokensSheetName,
        TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
        TELEGRAM_ACCESS_TOKENS_SHEET_HEADER_LABELS,
      ),
      ensureSheetHeaders(
        config,
        config.telegramUserBindingsSheetName,
        TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
        TELEGRAM_USER_BINDINGS_SHEET_HEADER_LABELS,
      ),
    ]);
  })();

  try {
    await schemaSyncPromise;
  } finally {
    schemaSyncPromise = null;
  }
};

export const findPaymentRecordByIntentId = async (
  paymentIntentId: string,
  options?: {
    cacheTtlMs?: number;
  },
) => {
  const normalizedPaymentIntentId = paymentIntentId.trim();

  if (!normalizedPaymentIntentId) {
    return null;
  }

  const cacheTtlMs = options?.cacheTtlMs ?? PAYMENT_RECORD_CACHE_TTL_MS;
  const cachedEntry = paymentRecordByIntentCache.get(normalizedPaymentIntentId);

  if (cacheTtlMs > 0 && cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.record;
  }

  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const { record } = await findRecordAndRowByFieldValue({
    cacheTtlMs: options?.cacheTtlMs,
    config,
    fieldName: "payment_intent_id",
    fieldValue: normalizedPaymentIntentId,
    headers: PAYMENT_SHEET_HEADERS,
    labelsMap: PAYMENT_SHEET_HEADER_LABELS,
    sheetTitle: config.paymentsSheetName,
  });

  if (cacheTtlMs > 0) {
    paymentRecordByIntentCache.set(normalizedPaymentIntentId, {
      expiresAt: Date.now() + cacheTtlMs,
      record: record ?? null,
    });
  }

  return record;
};

export const listSucceededPaymentRecordsInUtcRange = async ({
  endUtcIsoExclusive,
  startUtcIso,
}: {
  endUtcIsoExclusive: string;
  startUtcIso: string;
}) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const startTimestamp = Date.parse(startUtcIso);
  const endTimestamp = Date.parse(endUtcIsoExclusive);

  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
    return [] as PaymentSheetRecord[];
  }

  const rows = await getRows(
    config,
    config.paymentsSheetName,
    PAYMENT_SHEET_HEADERS,
    PAYMENT_SHEET_HEADER_LABELS,
  );

  return rows
    .filter((row) => row.outcome.trim() === "succeeded")
    .filter((row) => !isAdminOfferAccessWorkflow(row.access_workflow))
    .filter((row) => {
      const saleTimestamp = Date.parse(
        row.successful_customer_logged_at || row.updated_at || row.first_seen_at || "",
      );

      return saleTimestamp >= startTimestamp && saleTimestamp < endTimestamp;
    })
    .sort((left, right) => {
      const leftTimestamp = Date.parse(
        left.successful_customer_logged_at || left.updated_at || left.first_seen_at || "",
      );
      const rightTimestamp = Date.parse(
        right.successful_customer_logged_at ||
          right.updated_at ||
          right.first_seen_at ||
          "",
      );

      if (leftTimestamp !== rightTimestamp) {
        return leftTimestamp - rightTimestamp;
      }

      return left.payment_intent_id.localeCompare(right.payment_intent_id);
    });
};

export const listPaymentRecords = async (options?: {
  cacheTtlMs?: number;
}): Promise<PaymentSheetRecord[]> => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  return getRows(
    config,
    config.paymentsSheetName,
    PAYMENT_SHEET_HEADERS,
    PAYMENT_SHEET_HEADER_LABELS,
    {
      cacheTtlMs: options?.cacheTtlMs ?? 0,
    },
  ) as Promise<PaymentSheetRecord[]>;
};

export const findLatestPaymentRecordByCheckoutSessionId = async (
  checkoutSessionId: string,
) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const rows = await getRows(
    config,
    config.paymentsSheetName,
    PAYMENT_SHEET_HEADERS,
    PAYMENT_SHEET_HEADER_LABELS,
  );
  const matchedRows = rows.filter(
    (row) => row.checkout_session_id.trim() === checkoutSessionId.trim(),
  );

  if (matchedRows.length === 0) {
    return null;
  }

  return matchedRows.sort((left, right) => {
    const rightTs = parseTimestamp(right.updated_at || right.first_seen_at);
    const leftTs = parseTimestamp(left.updated_at || left.first_seen_at);

    return rightTs - leftTs;
  })[0];
};

export const findLatestSucceededPaymentRecordByCheckoutSessionId = async (
  checkoutSessionId: string,
) => {
  const latestPaymentRecord =
    await findLatestPaymentRecordByCheckoutSessionId(checkoutSessionId);

  if (!latestPaymentRecord || latestPaymentRecord.outcome !== "succeeded") {
    return null;
  }

  return latestPaymentRecord;
};

export const findStripeEventRecordByEventId = async (eventId: string) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const { record } = await findRecordAndRowByFieldValue({
    cacheTtlMs: 0,
    config,
    fieldName: "event_id",
    fieldValue: eventId,
    headers: STRIPE_EVENT_SHEET_HEADERS,
    labelsMap: STRIPE_EVENT_SHEET_HEADER_LABELS,
    sheetTitle: config.stripeEventsSheetName,
  });

  return record;
};

export const appendStripeEventRecord = async (record: StripeEventSheetRecord) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  await ensureSheetHeaders(
    config,
    config.stripeEventsSheetName,
    STRIPE_EVENT_SHEET_HEADERS,
    STRIPE_EVENT_SHEET_HEADER_LABELS,
  );
  const lastColumnLetter = columnIndexToLetter(STRIPE_EVENT_SHEET_HEADERS.length);

  const { rowNumber } = await findRecordAndRowByFieldValue({
    cacheTtlMs: 0,
    config,
    fieldName: "event_id",
    fieldValue: record.event_id,
    headers: STRIPE_EVENT_SHEET_HEADERS,
    labelsMap: STRIPE_EVENT_SHEET_HEADER_LABELS,
    sheetTitle: config.stripeEventsSheetName,
  });

  if (rowNumber) {
    await updateSheetValues(
      config,
      config.stripeEventsSheetName,
      `A${rowNumber}:${lastColumnLetter}${rowNumber}`,
      [toOrderedRow(STRIPE_EVENT_SHEET_HEADERS, record)],
    );

    return record;
  }

  await appendSheetValues(
    config,
    config.stripeEventsSheetName,
    `A1:${lastColumnLetter}`,
    [toOrderedRow(STRIPE_EVENT_SHEET_HEADERS, record)],
  );

  return record;
};

export const appendSuccessfulCustomerRecord = async (
  record: SuccessfulCustomersSheetRecord,
) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  await ensureSheetHeaders(
    config,
    config.successfulCustomersSheetName,
    SUCCESSFUL_CUSTOMERS_SHEET_HEADERS,
    SUCCESSFUL_CUSTOMERS_SHEET_HEADER_LABELS,
  );
  const lastColumnLetter = columnIndexToLetter(SUCCESSFUL_CUSTOMERS_SHEET_HEADERS.length);

  const { rowNumber } = await findRecordAndRowByFieldValue({
    cacheTtlMs: 0,
    config,
    fieldName: "payment_intent_id",
    fieldValue: record.payment_intent_id,
    headers: SUCCESSFUL_CUSTOMERS_SHEET_HEADERS,
    labelsMap: SUCCESSFUL_CUSTOMERS_SHEET_HEADER_LABELS,
    sheetTitle: config.successfulCustomersSheetName,
  });

  if (rowNumber) {
    await updateSheetValues(
      config,
      config.successfulCustomersSheetName,
      `A${rowNumber}:${lastColumnLetter}${rowNumber}`,
      [toOrderedRow(SUCCESSFUL_CUSTOMERS_SHEET_HEADERS, record)],
    );

    return record;
  }

  await appendSheetValues(
    config,
    config.successfulCustomersSheetName,
    `A1:${lastColumnLetter}`,
    [toOrderedRow(SUCCESSFUL_CUSTOMERS_SHEET_HEADERS, record)],
  );

  return record;
};

export const upsertPaymentRecord = async (record: PaymentSheetRecord) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const { record: existingRecord, rowNumber } = await findRecordAndRowByFieldValue({
    cacheTtlMs: 0,
    config,
    fieldName: "payment_intent_id",
    fieldValue: record.payment_intent_id,
    headers: PAYMENT_SHEET_HEADERS,
    labelsMap: PAYMENT_SHEET_HEADER_LABELS,
    sheetTitle: config.paymentsSheetName,
  });
  const nextRecord: PaymentSheetRecord = {
    ...record,
    first_seen_at: existingRecord?.first_seen_at || record.first_seen_at,
  };
  const lastColumnLetter = columnIndexToLetter(PAYMENT_SHEET_HEADERS.length);

  if (rowNumber) {
    await updateSheetValues(
      config,
      config.paymentsSheetName,
      `A${rowNumber}:${lastColumnLetter}${rowNumber}`,
      [toOrderedRow(PAYMENT_SHEET_HEADERS, nextRecord)],
    );

    paymentRecordByIntentCache.set(nextRecord.payment_intent_id, {
      expiresAt: Date.now() + PAYMENT_RECORD_CACHE_TTL_MS,
      record: nextRecord,
    });

    return nextRecord;
  }

  await appendSheetValues(config, config.paymentsSheetName, `A1:${lastColumnLetter}`, [
    toOrderedRow(PAYMENT_SHEET_HEADERS, nextRecord),
  ]);

  paymentRecordByIntentCache.set(nextRecord.payment_intent_id, {
    expiresAt: Date.now() + PAYMENT_RECORD_CACHE_TTL_MS,
    record: nextRecord,
  });

  return nextRecord;
};

export const findTelegramAccessTokenRecordByTokenId = async (tokenId: string) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const { record } = await findRecordAndRowByFieldValue({
    config,
    fieldName: "token_id",
    fieldValue: tokenId,
    headers: TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
    labelsMap: TELEGRAM_ACCESS_TOKENS_SHEET_HEADER_LABELS,
    sheetTitle: config.telegramAccessTokensSheetName,
  });

  return record;
};

export const findTelegramAccessTokenRecordByTokenHash = async (tokenHash: string) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const { record } = await findRecordAndRowByFieldValue({
    config,
    fieldName: "token_hash",
    fieldValue: tokenHash,
    headers: TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
    labelsMap: TELEGRAM_ACCESS_TOKENS_SHEET_HEADER_LABELS,
    sheetTitle: config.telegramAccessTokensSheetName,
  });

  return record;
};

export const findTelegramAccessTokenRecordByTokenValue = async (tokenValue: string) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const { record } = await findRecordAndRowByFieldValue({
    config,
    fieldName: "token_value",
    fieldValue: tokenValue,
    headers: TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
    labelsMap: TELEGRAM_ACCESS_TOKENS_SHEET_HEADER_LABELS,
    sheetTitle: config.telegramAccessTokensSheetName,
  });

  return record;
};

export const findLatestTelegramAccessTokenRecordByPaymentIntentId = async (
  paymentIntentId: string,
) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const rows = await getRows(
    config,
    config.telegramAccessTokensSheetName,
    TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
    TELEGRAM_ACCESS_TOKENS_SHEET_HEADER_LABELS,
  );
  const matchedRows = rows.filter((row) => row.payment_intent_id === paymentIntentId);

  if (matchedRows.length === 0) {
    return null;
  }

  return matchedRows.sort((left, right) => {
    const rightTs = parseTimestamp(right.created_at);
    const leftTs = parseTimestamp(left.created_at);

    return rightTs - leftTs;
  })[0];
};

export const findAdminInviteLinkHistorySourceRecords = async ({
  accessWorkflow,
  limit,
}: {
  accessWorkflow: string;
  limit?: number;
}) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const normalizedAccessWorkflow = accessWorkflow.trim().toLowerCase();

  if (!normalizedAccessWorkflow) {
    return [] as AdminInviteLinkHistorySourceRecord[];
  }

  const paymentRows = await getRows(
    config,
    config.paymentsSheetName,
    PAYMENT_SHEET_HEADERS,
    PAYMENT_SHEET_HEADER_LABELS,
  );
  const adminPaymentRows = paymentRows.filter(
    (row) =>
      row.access_workflow.trim().toLowerCase() === normalizedAccessWorkflow &&
      row.payment_intent_id.trim(),
  );

  if (adminPaymentRows.length === 0) {
    return [] as AdminInviteLinkHistorySourceRecord[];
  }

  const tokenRows = await getRows(
    config,
    config.telegramAccessTokensSheetName,
    TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
    TELEGRAM_ACCESS_TOKENS_SHEET_HEADER_LABELS,
  );
  const tokenById = new Map(
    tokenRows
      .map((row) => [row.token_id.trim(), row] as const)
      .filter(([tokenId]) => Boolean(tokenId)),
  );

  const historyRows = adminPaymentRows
    .map((paymentRow) => {
      const tokenRecord = tokenById.get(paymentRow.telegram_token_id.trim());
      const accessUrl = tokenRecord?.token_value.trim() ?? "";
      const createdAt =
        paymentRow.successful_customer_logged_at.trim() ||
        paymentRow.first_seen_at.trim() ||
        paymentRow.updated_at.trim() ||
        tokenRecord?.created_at.trim() ||
        "";

      if (!accessUrl) {
        return null;
      }

      return {
        accessUrl,
        adminLabel: paymentRow.customer_nickname.trim(),
        createdAt,
        lessonLanguage: paymentRow.lesson_language.trim(),
        offerLabel: paymentRow.offer_label.trim(),
        productTitle: paymentRow.product_title.trim(),
        purchaseItem: paymentRow.purchase_item.trim(),
        tokenExpiresAt:
          paymentRow.telegram_token_expires_at.trim() ||
          tokenRecord?.expires_at.trim() ||
          "",
        tokenUsedAt:
          paymentRow.telegram_token_used_at.trim() || tokenRecord?.used_at.trim() || "",
      } satisfies AdminInviteLinkHistorySourceRecord;
    })
    .filter((row): row is AdminInviteLinkHistorySourceRecord => Boolean(row))
    .sort(
      (left, right) => parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt),
    );

  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    return historyRows.slice(0, limit);
  }

  return historyRows;
};

export const upsertTelegramAccessTokenRecord = async (
  record: TelegramAccessTokenSheetRecord,
) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const { rowNumber } = await findRecordAndRowByFieldValue({
    cacheTtlMs: 0,
    config,
    fieldName: "token_id",
    fieldValue: record.token_id,
    headers: TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
    labelsMap: TELEGRAM_ACCESS_TOKENS_SHEET_HEADER_LABELS,
    sheetTitle: config.telegramAccessTokensSheetName,
  });
  const lastColumnLetter = columnIndexToLetter(
    TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS.length,
  );

  if (rowNumber) {
    await updateSheetValues(
      config,
      config.telegramAccessTokensSheetName,
      `A${rowNumber}:${lastColumnLetter}${rowNumber}`,
      [toOrderedRow(TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS, record)],
    );

    return record;
  }

  await appendSheetValues(
    config,
    config.telegramAccessTokensSheetName,
    `A1:${lastColumnLetter}`,
    [toOrderedRow(TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS, record)],
  );

  return record;
};

export const findTelegramUserBindingByPaymentIntentId = async (
  paymentIntentId: string,
) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const { record } = await findRecordAndRowByFieldValue({
    config,
    fieldName: "payment_intent_id",
    fieldValue: paymentIntentId,
    headers: TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
    labelsMap: TELEGRAM_USER_BINDINGS_SHEET_HEADER_LABELS,
    sheetTitle: config.telegramUserBindingsSheetName,
  });

  return record;
};

export const findMonthlySalesReportRunByKey = async (reportKey: string) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const { record } = await findRecordAndRowByFieldValue({
    config,
    fieldName: "report_key",
    fieldValue: reportKey.trim(),
    headers: MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
    labelsMap: MONTHLY_SALES_REPORT_RUNS_SHEET_HEADER_LABELS,
    sheetTitle: config.monthlySalesReportRunsSheetName,
  });

  return record;
};

export const upsertMonthlySalesReportRun = async (
  record: MonthlySalesReportRunSheetRecord,
) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const { rowNumber } = await findRecordAndRowByFieldValue({
    cacheTtlMs: 0,
    config,
    fieldName: "report_key",
    fieldValue: record.report_key,
    headers: MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
    labelsMap: MONTHLY_SALES_REPORT_RUNS_SHEET_HEADER_LABELS,
    sheetTitle: config.monthlySalesReportRunsSheetName,
  });
  const lastColumnLetter = columnIndexToLetter(
    MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS.length,
  );

  if (rowNumber) {
    await updateSheetValues(
      config,
      config.monthlySalesReportRunsSheetName,
      `A${rowNumber}:${lastColumnLetter}${rowNumber}`,
      [toOrderedRow(MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS, record)],
    );

    return record;
  }

  await appendSheetValues(
    config,
    config.monthlySalesReportRunsSheetName,
    `A1:${lastColumnLetter}`,
    [toOrderedRow(MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS, record)],
  );

  return record;
};

export const findTelegramUserBindingsByTelegramUserId = async (
  telegramUserId: string,
) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const rows = await getRows(
    config,
    config.telegramUserBindingsSheetName,
    TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
    TELEGRAM_USER_BINDINGS_SHEET_HEADER_LABELS,
  );

  return rows.filter((row) => row.telegram_user_id === telegramUserId);
};

export const findTelegramUserBindingsByCustomerEmail = async (customerEmail: string) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const rows = await getRows(
    config,
    config.telegramUserBindingsSheetName,
    TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
    TELEGRAM_USER_BINDINGS_SHEET_HEADER_LABELS,
  );
  const normalizedEmail = customerEmail.trim().toLowerCase();

  return rows.filter(
    (row) => row.customer_email.trim().toLowerCase() === normalizedEmail,
  );
};

export const findTelegramUserBindingsByTelegramUserIdAndChatId = async ({
  chatId,
  telegramUserId,
}: {
  chatId: string;
  telegramUserId: string;
}) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const rows = await getRows(
    config,
    config.telegramUserBindingsSheetName,
    TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
    TELEGRAM_USER_BINDINGS_SHEET_HEADER_LABELS,
  );

  return rows.filter(
    (row) =>
      row.telegram_user_id.trim() === telegramUserId.trim() &&
      row.chat_id.trim() === chatId.trim(),
  );
};

export const findActiveTelegramUserBindings = async () => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const rows = await getRows(
    config,
    config.telegramUserBindingsSheetName,
    TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
    TELEGRAM_USER_BINDINGS_SHEET_HEADER_LABELS,
  );

  return rows.filter((row) => row.status === "active");
};

export const upsertTelegramUserBindingRecord = async (
  record: TelegramUserBindingSheetRecord,
) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const { rowNumber } = await findRecordAndRowByFieldValue({
    cacheTtlMs: 0,
    config,
    fieldName: "payment_intent_id",
    fieldValue: record.payment_intent_id,
    headers: TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
    labelsMap: TELEGRAM_USER_BINDINGS_SHEET_HEADER_LABELS,
    sheetTitle: config.telegramUserBindingsSheetName,
  });
  const lastColumnLetter = columnIndexToLetter(
    TELEGRAM_USER_BINDINGS_SHEET_HEADERS.length,
  );

  if (rowNumber) {
    await updateSheetValues(
      config,
      config.telegramUserBindingsSheetName,
      `A${rowNumber}:${lastColumnLetter}${rowNumber}`,
      [toOrderedRow(TELEGRAM_USER_BINDINGS_SHEET_HEADERS, record)],
    );

    return record;
  }

  await appendSheetValues(
    config,
    config.telegramUserBindingsSheetName,
    `A1:${lastColumnLetter}`,
    [toOrderedRow(TELEGRAM_USER_BINDINGS_SHEET_HEADERS, record)],
  );

  return record;
};
