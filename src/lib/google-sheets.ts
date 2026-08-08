import { createSign } from "node:crypto";

import {
  findLatestPaymentRecordByCheckoutSessionIdFromDatabase,
  findPaymentRecordByIntentIdFromDatabase,
  listPaymentRecordsFromDatabase,
  listSucceededPaymentRecordsFromDatabaseInUtcRange,
  upsertPaymentRecordToDatabase,
} from "@/db/payment-records";
import {
  claimTelegramAccessTokenRecordInDatabase,
  findActiveTelegramUserBindingsFromDatabase,
  findEmailCampaignLeadByCampaignAndEmailFromDatabase,
  findLatestTelegramAccessTokenRecordByPaymentIntentIdFromDatabase,
  findMonthlySalesReportRunByKeyFromDatabase,
  findStripeEventRecordByEventIdFromDatabase,
  findTelegramAccessTokenRecordByTokenHashFromDatabase,
  findTelegramAccessTokenRecordByTokenIdFromDatabase,
  findTelegramAccessTokenRecordByTokenValueFromDatabase,
  findTelegramUserBindingByPaymentIntentIdFromDatabase,
  findTelegramUserBindingsByCustomerEmailFromDatabase,
  findTelegramUserBindingsByTelegramUserIdAndChatIdFromDatabase,
  findTelegramUserBindingsByTelegramUserIdFromDatabase,
  listEmailCampaignLeadRecordsFromDatabase,
  listMonthlySalesReportRunRecordsFromDatabase,
  listStripeEventRecordsFromDatabase,
  listTelegramAccessTokenRecordsFromDatabase,
  listTelegramUserBindingRecordsFromDatabase,
  recordSuccessfulCustomerExportToDatabase,
  upsertEmailCampaignLeadRecordToDatabase,
  upsertMonthlySalesReportRunToDatabase,
  upsertStripeEventRecordToDatabase,
  upsertTelegramAccessTokenRecordToDatabase,
  upsertTelegramUserBindingRecordToDatabase,
} from "@/db/sheet-records";
import {
  type AdminInviteLinkHistorySourceRecord,
  DEFAULT_EMAIL_CAMPAIGN_LEADS_SHEET_NAME,
  DEFAULT_MONTHLY_SALES_REPORT_RUNS_SHEET_NAME,
  DEFAULT_PAYMENTS_SHEET_NAME,
  DEFAULT_STRIPE_EVENTS_SHEET_NAME,
  DEFAULT_SUCCESSFUL_CUSTOMERS_SHEET_NAME,
  DEFAULT_TELEGRAM_ACCESS_TOKENS_SHEET_NAME,
  DEFAULT_TELEGRAM_USER_BINDINGS_SHEET_NAME,
  EMAIL_CAMPAIGN_LEADS_SHEET_HEADER_LABELS,
  EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
  type EmailCampaignLeadSheetRecord,
  MONTHLY_SALES_REPORT_RUNS_SHEET_HEADER_LABELS,
  MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
  type MonthlySalesReportRunSheetRecord,
  PAYMENT_SHEET_HEADER_LABELS,
  PAYMENT_SHEET_HEADERS,
  type PaymentSheetRecord,
  STRIPE_EVENT_SHEET_HEADER_LABELS,
  STRIPE_EVENT_SHEET_HEADERS,
  type StripeEventSheetRecord,
  SUCCESSFUL_CUSTOMERS_SHEET_HEADER_LABELS,
  SUCCESSFUL_CUSTOMERS_SHEET_HEADERS,
  type SuccessfulCustomersSheetRecord,
  TELEGRAM_ACCESS_TOKENS_SHEET_HEADER_LABELS,
  TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
  TELEGRAM_USER_BINDINGS_SHEET_HEADER_LABELS,
  TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
  type TelegramAccessTokenSheetRecord,
  type TelegramUserBindingSheetRecord,
} from "@/lib/google-sheets-schema";

export type {
  AdminInviteLinkHistorySourceRecord,
  EmailCampaignLeadSheetRecord,
  MonthlySalesReportRunSheetRecord,
  PaymentSheetRecord,
  StripeEventSheetRecord,
  SuccessfulCustomersSheetRecord,
  TelegramAccessTokenSheetRecord,
  TelegramUserBindingSheetRecord,
} from "@/lib/google-sheets-schema";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_API_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_SERVICE_ACCOUNT_JWT_TTL_SECONDS = 3_600;
const GOOGLE_ACCESS_TOKEN_DEFAULT_TTL_SECONDS = 3_600;
const GOOGLE_ACCESS_TOKEN_REFRESH_BUFFER_SECONDS = 60;
const GOOGLE_ACCESS_TOKEN_MIN_CACHE_TTL_SECONDS = 60;
const GOOGLE_SHEETS_RETRY_JITTER_MS = 200;
const HTTP_STATUS_NO_CONTENT = 204;
const HTTP_STATUS_RATE_LIMITED = 429;
const HTTP_STATUS_UNAUTHORIZED = 401;
const JSON_CONTENT_TYPE = "application/json";
const FORM_URLENCODED_CONTENT_TYPE = "application/x-www-form-urlencoded";

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

type ParsedGoogleAccessTokenResponse = {
  data: GoogleSheetsTokenResponse | null;
  responseText: string;
};

type GoogleSheetsResponseResolution<T> =
  | {
      kind: "complete";
      value: T;
    }
  | {
      delayMs: number;
      kind: "retry";
    };

type ParsedGoogleSheetsResponse<T> = {
  data: T | null;
  responseText: string;
};

type GoogleSheetsConfig = {
  emailCampaignLeadsSheetName: string;
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

type RecordSource = "auto" | "database" | "sheets";

type DatabaseReadResolution<T> =
  | {
      kind: "fallback";
    }
  | {
      kind: "resolved";
      value: T;
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
  error instanceof GoogleSheetsError && error.status === HTTP_STATUS_RATE_LIMITED;

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

/**
 * Google owns these JSON schemas. Keep the unchecked conversion in one explicit
 * trust boundary so transport code never spreads `JSON.parse(...) as T` casts.
 * Runtime validation is intentionally not added here because changing how
 * malformed upstream payloads fail would alter established error behavior.
 */
const parseGoogleJson = <T>(responseText: string): T | null => {
  if (!responseText) {
    return null;
  }

  try {
    const parsedValue: unknown = JSON.parse(responseText);

    return parsedValue as T;
  } catch {
    return null;
  }
};

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
    emailCampaignLeadsSheetName: DEFAULT_EMAIL_CAMPAIGN_LEADS_SHEET_NAME,
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

const getRequiredGoogleSheetsConfig = () => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  return config;
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
      exp: nowInSeconds + GOOGLE_SERVICE_ACCOUNT_JWT_TTL_SECONDS,
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

const createGoogleAccessTokenRequest = (config: GoogleSheetsConfig): RequestInit => ({
  method: "POST",
  headers: {
    "Content-Type": FORM_URLENCODED_CONTENT_TYPE,
  },
  body: new URLSearchParams({
    assertion: getJwtAssertion(config),
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
  }),
  cache: "no-store",
});

const parseGoogleAccessTokenResponse = async (
  response: Response,
): Promise<ParsedGoogleAccessTokenResponse> => {
  const responseText = await response.text();

  return {
    data: parseGoogleJson<GoogleSheetsTokenResponse>(responseText),
    responseText,
  };
};

const cacheGoogleAccessToken = (data: GoogleSheetsTokenResponse): string => {
  const token = data.access_token ?? "";
  const expiresInMs =
    Math.max(
      (data.expires_in ?? GOOGLE_ACCESS_TOKEN_DEFAULT_TTL_SECONDS) -
        GOOGLE_ACCESS_TOKEN_REFRESH_BUFFER_SECONDS,
      GOOGLE_ACCESS_TOKEN_MIN_CACHE_TTL_SECONDS,
    ) * 1000;

  accessTokenCache = {
    expiresAt: Date.now() + expiresInMs,
    token,
  };

  return token;
};

const createGoogleAccessTokenError = (
  response: Response,
  { data, responseText }: ParsedGoogleAccessTokenResponse,
) =>
  new GoogleSheetsError(
    data?.error ?? "google_access_token_failed",
    data?.error_description || responseText || "Failed to obtain Google access token.",
    response.status,
  );

const resolveGoogleAccessTokenResponse = ({
  attempt,
  parsedResponse,
  response,
}: {
  attempt: number;
  parsedResponse: ParsedGoogleAccessTokenResponse;
  response: Response;
}): GoogleSheetsResponseResolution<string> => {
  if (response.ok && parsedResponse.data?.access_token) {
    return {
      kind: "complete",
      value: cacheGoogleAccessToken(parsedResponse.data),
    };
  }

  if (response.status === HTTP_STATUS_RATE_LIMITED) {
    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));

    setGoogleSheetsRateLimitBackoff(retryAfterMs);
    throw createGoogleAccessTokenError(response, parsedResponse);
  }

  if (attempt < GOOGLE_SHEETS_REQUEST_MAX_RETRIES && response.status >= 500) {
    return {
      delayMs: getRetryDelayMs(
        attempt,
        parseRetryAfterMs(response.headers.get("retry-after")),
      ),
      kind: "retry",
    };
  }

  throw createGoogleAccessTokenError(response, parsedResponse);
};

const getGoogleAccessToken = async (config: GoogleSheetsConfig): Promise<string> => {
  assertGoogleSheetsRateLimitWindow();

  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) {
    return accessTokenCache.token;
  }

  for (let attempt = 0; attempt <= GOOGLE_SHEETS_REQUEST_MAX_RETRIES; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(
        GOOGLE_OAUTH_TOKEN_URL,
        createGoogleAccessTokenRequest(config),
      );
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

    const resolution = resolveGoogleAccessTokenResponse({
      attempt,
      parsedResponse: await parseGoogleAccessTokenResponse(response),
      response,
    });

    if (resolution.kind === "complete") {
      return resolution.value;
    }

    await sleep(resolution.delayMs);
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
  const jitter = Math.floor(Math.random() * GOOGLE_SHEETS_RETRY_JITTER_MS);

  return exponential + jitter;
};

const isRetriableGoogleSheetsStatus = (status: number) =>
  status === HTTP_STATUS_UNAUTHORIZED || status >= 500;

const createGoogleSheetsRequestInit = (
  accessToken: string,
  init?: RequestInit,
): RequestInit => ({
  ...init,
  headers: {
    Authorization: `Bearer ${accessToken}`,
    ...(init?.headers ?? {}),
  },
  cache: "no-store",
});

const parseGoogleSheetsResponse = async <T>(
  response: Response,
): Promise<ParsedGoogleSheetsResponse<T>> => {
  const responseText = await response.text();

  return {
    data: parseGoogleJson<T>(responseText),
    responseText,
  };
};

const createGoogleSheetsRequestError = (response: Response, responseText: string) =>
  new GoogleSheetsError(
    "google_sheets_request_failed",
    responseText || "Google Sheets request failed.",
    response.status,
  );

const resolveGoogleSheetsResponse = async <T>({
  attempt,
  response,
}: {
  attempt: number;
  response: Response;
}): Promise<GoogleSheetsResponseResolution<T>> => {
  if (response.status === HTTP_STATUS_NO_CONTENT) {
    return {
      kind: "complete",
      value: null as T,
    };
  }

  const { data, responseText } = await parseGoogleSheetsResponse<T>(response);

  if (response.ok) {
    return {
      kind: "complete",
      value: data as T,
    };
  }

  if (response.status === HTTP_STATUS_RATE_LIMITED) {
    setGoogleSheetsRateLimitBackoff(
      parseRetryAfterMs(response.headers.get("retry-after")),
    );

    throw createGoogleSheetsRequestError(response, responseText);
  }

  if (response.status === HTTP_STATUS_UNAUTHORIZED) {
    accessTokenCache = null;
  }

  if (
    attempt < GOOGLE_SHEETS_REQUEST_MAX_RETRIES &&
    isRetriableGoogleSheetsStatus(response.status)
  ) {
    return {
      delayMs: getRetryDelayMs(
        attempt,
        parseRetryAfterMs(response.headers.get("retry-after")),
      ),
      kind: "retry",
    };
  }

  throw createGoogleSheetsRequestError(response, responseText);
};

const googleSheetsRequest = async <T>(
  config: GoogleSheetsConfig,
  path: string,
  init?: RequestInit,
): Promise<T> => {
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
      response = await fetch(
        getGoogleSheetsUrl(config, path),
        createGoogleSheetsRequestInit(accessToken, init),
      );
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

    const resolution = await resolveGoogleSheetsResponse<T>({
      attempt,
      response,
    });

    if (resolution.kind === "complete") {
      return resolution.value;
    }

    await sleep(resolution.delayMs);
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
        "Content-Type": JSON_CONTENT_TYPE,
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
      "Content-Type": JSON_CONTENT_TYPE,
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
        "Content-Type": JSON_CONTENT_TYPE,
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
      // Keep row 1 readable for humans, while application code keeps using the
      // stable internal header arrays above to map cells back into records.
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
    readOnly?: boolean;
  },
) => {
  const cacheTtlMs = options?.cacheTtlMs ?? SHEET_ROWS_CACHE_TTL_MS;
  const rowsCacheKey = getRowsCacheKey(config, sheetTitle, headers);
  const cachedRows = rowsCache.get(rowsCacheKey);

  if (cacheTtlMs > 0 && cachedRows && cachedRows.expiresAt > Date.now()) {
    return cachedRows.rows as Array<Record<T, string>>;
  }

  if (!options?.readOnly) {
    await ensureSheetHeaders(config, sheetTitle, headers, labelsMap);
  }

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

const upsertRecordByFieldValue = async <T extends string>({
  config,
  fieldName,
  fieldValue,
  headers,
  labelsMap,
  record,
  sheetTitle,
}: {
  config: GoogleSheetsConfig;
  fieldName: T;
  fieldValue: string;
  headers: readonly T[];
  labelsMap?: Partial<Record<T, string>>;
  record: Record<T, string>;
  sheetTitle: string;
}) => {
  await ensureSheetHeaders(config, sheetTitle, headers, labelsMap);

  const lastColumnLetter = columnIndexToLetter(headers.length);
  const { rowNumber } = await findRecordAndRowByFieldValue({
    cacheTtlMs: 0,
    config,
    fieldName,
    fieldValue,
    headers,
    labelsMap,
    sheetTitle,
  });
  const orderedRow = [toOrderedRow(headers, record)];

  if (rowNumber) {
    await updateSheetValues(
      config,
      sheetTitle,
      `A${rowNumber}:${lastColumnLetter}${rowNumber}`,
      orderedRow,
    );

    return record;
  }

  await appendSheetValues(config, sheetTitle, `A1:${lastColumnLetter}`, orderedRow);

  return record;
};

const toOrderedRow = <T extends string>(
  headers: readonly T[],
  record: Record<T, string>,
) => headers.map((header) => record[header] ?? "");

const parseTimestamp = (value: string) => {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const cachePaymentRecord = ({
  cacheTtlMs,
  paymentIntentId,
  record,
  source,
}: {
  cacheTtlMs: number;
  paymentIntentId: string;
  record: PaymentSheetRecord | null;
  source: RecordSource;
}): void => {
  paymentRecordByIntentCache.set(`${source}:${paymentIntentId}`, {
    expiresAt: Date.now() + cacheTtlMs,
    record,
  });
};

const cacheMirroredPaymentRecord = (record: PaymentSheetRecord): void => {
  cachePaymentRecord({
    cacheTtlMs: PAYMENT_RECORD_CACHE_TTL_MS,
    paymentIntentId: record.payment_intent_id,
    record,
    source: "auto",
  });
  cachePaymentRecord({
    cacheTtlMs: PAYMENT_RECORD_CACHE_TTL_MS,
    paymentIntentId: record.payment_intent_id,
    record,
    source: "sheets",
  });
};

const readDatabaseRecord = async <T>({
  read,
  source,
  warn,
}: {
  read: () => Promise<T | null>;
  source: RecordSource;
  warn: (error: unknown) => void;
}): Promise<DatabaseReadResolution<T | null>> => {
  if (source === "sheets") {
    return { kind: "fallback" };
  }

  try {
    const record = await read();

    if (record || source === "database") {
      return {
        kind: "resolved",
        value: record,
      };
    }
  } catch (error) {
    if (source === "database") {
      throw error;
    }

    warn(error);
  }

  return { kind: "fallback" };
};

const readDatabaseCollection = async <T>({
  read,
  source,
  warn,
}: {
  read: () => Promise<T>;
  source: RecordSource;
  warn: (error: unknown) => void;
}): Promise<DatabaseReadResolution<T>> => {
  if (source === "sheets") {
    return { kind: "fallback" };
  }

  try {
    return {
      kind: "resolved",
      value: await read(),
    };
  } catch (error) {
    if (source === "database") {
      throw error;
    }

    warn(error);
    return { kind: "fallback" };
  }
};

export const isGoogleSheetsConfigured = () => Boolean(getGoogleSheetsConfig());

export const ensureGoogleSheetsSchema = async () => {
  if (schemaSyncPromise) {
    await schemaSyncPromise;
    return;
  }

  schemaSyncPromise = (async () => {
    const config = getRequiredGoogleSheetsConfig();

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
        config.emailCampaignLeadsSheetName,
        EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
        EMAIL_CAMPAIGN_LEADS_SHEET_HEADER_LABELS,
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
    source?: RecordSource;
  },
) => {
  const normalizedPaymentIntentId = paymentIntentId.trim();

  if (!normalizedPaymentIntentId) {
    return null;
  }

  const source = options?.source ?? "auto";
  const cacheTtlMs = options?.cacheTtlMs ?? PAYMENT_RECORD_CACHE_TTL_MS;
  const cacheKey = `${source}:${normalizedPaymentIntentId}`;
  const cachedEntry = paymentRecordByIntentCache.get(cacheKey);

  if (cacheTtlMs > 0 && cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.record;
  }

  const databaseResolution = await readDatabaseRecord({
    read: () => findPaymentRecordByIntentIdFromDatabase(normalizedPaymentIntentId),
    source,
    warn: (error) => {
      console.warn(
        "Failed to load payment record from database, falling back to Sheets",
        {
          error,
          paymentIntentId: normalizedPaymentIntentId,
        },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    if (cacheTtlMs > 0) {
      cachePaymentRecord({
        cacheTtlMs,
        paymentIntentId: normalizedPaymentIntentId,
        record: databaseResolution.value,
        source,
      });
    }

    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

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
    cachePaymentRecord({
      cacheTtlMs,
      paymentIntentId: normalizedPaymentIntentId,
      record: record ?? null,
      source,
    });
  }

  return record;
};

export const listSucceededPaymentRecordsInUtcRange = async ({
  endUtcIsoExclusive,
  source = "auto",
  startUtcIso,
}: {
  endUtcIsoExclusive: string;
  source?: RecordSource;
  startUtcIso: string;
}) => {
  if (source === "sheets") {
    throw new Error("sheets_successful_payment_date_unavailable");
  }

  return listSucceededPaymentRecordsFromDatabaseInUtcRange({
    endUtcIsoExclusive,
    startUtcIso,
  });
};

export const listPaymentRecords = async (options?: {
  cacheTtlMs?: number;
  readOnly?: boolean;
  source?: RecordSource;
}): Promise<PaymentSheetRecord[]> => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseCollection({
    read: () => listPaymentRecordsFromDatabase(),
    source,
    warn: (error) => {
      console.warn(
        "Failed to list payment records from database, falling back to Sheets",
        {
          error,
        },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

  return getRows(
    config,
    config.paymentsSheetName,
    PAYMENT_SHEET_HEADERS,
    PAYMENT_SHEET_HEADER_LABELS,
    {
      cacheTtlMs: options?.cacheTtlMs ?? 0,
      readOnly: options?.readOnly,
    },
  );
};

export const findLatestPaymentRecordByCheckoutSessionId = async (
  checkoutSessionId: string,
  options?: {
    source?: RecordSource;
  },
) => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseRecord({
    read: () => findLatestPaymentRecordByCheckoutSessionIdFromDatabase(checkoutSessionId),
    source,
    warn: (error) => {
      console.warn(
        "Failed to load latest checkout payment record from database, falling back to Sheets",
        { checkoutSessionId, error },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

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
  options?: {
    source?: RecordSource;
  },
) => {
  const latestPaymentRecord = await findLatestPaymentRecordByCheckoutSessionId(
    checkoutSessionId,
    options,
  );

  if (!latestPaymentRecord || latestPaymentRecord.outcome !== "succeeded") {
    return null;
  }

  return latestPaymentRecord;
};

export const findStripeEventRecordByEventId = async (
  eventId: string,
  options?: {
    source?: RecordSource;
  },
) => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseRecord({
    read: () => findStripeEventRecordByEventIdFromDatabase(eventId),
    source,
    warn: (error) => {
      console.warn("Failed to load Stripe event from database, falling back to Sheets", {
        error,
        eventId,
      });
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

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

export const listStripeEventRecords = async (options?: {
  cacheTtlMs?: number;
  readOnly?: boolean;
  source?: RecordSource;
}): Promise<StripeEventSheetRecord[]> => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseCollection({
    read: () => listStripeEventRecordsFromDatabase(),
    source,
    warn: (error) => {
      console.warn("Failed to list Stripe events from database, falling back to Sheets", {
        error,
      });
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

  return getRows(
    config,
    config.stripeEventsSheetName,
    STRIPE_EVENT_SHEET_HEADERS,
    STRIPE_EVENT_SHEET_HEADER_LABELS,
    {
      cacheTtlMs: options?.cacheTtlMs ?? 0,
      readOnly: options?.readOnly,
    },
  );
};

export const listSuccessfulCustomerRecordsFromSheets = async (options?: {
  cacheTtlMs?: number;
  readOnly?: boolean;
}): Promise<SuccessfulCustomersSheetRecord[]> => {
  const config = getRequiredGoogleSheetsConfig();

  return getRows(
    config,
    config.successfulCustomersSheetName,
    SUCCESSFUL_CUSTOMERS_SHEET_HEADERS,
    SUCCESSFUL_CUSTOMERS_SHEET_HEADER_LABELS,
    {
      cacheTtlMs: options?.cacheTtlMs ?? 0,
      readOnly: options?.readOnly,
    },
  );
};

export const appendStripeEventRecord = async (record: StripeEventSheetRecord) => {
  const databaseRecord = await upsertStripeEventRecordToDatabase(record);
  const config = getRequiredGoogleSheetsConfig();

  return upsertRecordByFieldValue({
    config,
    fieldName: "event_id",
    fieldValue: record.event_id,
    headers: STRIPE_EVENT_SHEET_HEADERS,
    labelsMap: STRIPE_EVENT_SHEET_HEADER_LABELS,
    record: databaseRecord,
    sheetTitle: config.stripeEventsSheetName,
  });
};

export const appendSuccessfulCustomerRecord = async (
  record: SuccessfulCustomersSheetRecord,
) => {
  await recordSuccessfulCustomerExportToDatabase(record);
  const config = getRequiredGoogleSheetsConfig();

  return upsertRecordByFieldValue({
    config,
    fieldName: "payment_intent_id",
    fieldValue: record.payment_intent_id,
    headers: SUCCESSFUL_CUSTOMERS_SHEET_HEADERS,
    labelsMap: SUCCESSFUL_CUSTOMERS_SHEET_HEADER_LABELS,
    record,
    sheetTitle: config.successfulCustomersSheetName,
  });
};

export const upsertPaymentRecord = async (
  record: PaymentSheetRecord,
  options?: {
    mirrorToSheets?: boolean;
  },
) => {
  const databaseRecord = await upsertPaymentRecordToDatabase(record);
  const shouldMirrorToSheets = options?.mirrorToSheets ?? true;

  if (!shouldMirrorToSheets) {
    cachePaymentRecord({
      cacheTtlMs: PAYMENT_RECORD_CACHE_TTL_MS,
      paymentIntentId: databaseRecord.payment_intent_id,
      record: databaseRecord,
      source: "auto",
    });

    return databaseRecord;
  }

  const config = getRequiredGoogleSheetsConfig();

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
    ...databaseRecord,
    first_seen_at: existingRecord?.first_seen_at || databaseRecord.first_seen_at,
  };
  const lastColumnLetter = columnIndexToLetter(PAYMENT_SHEET_HEADERS.length);

  if (rowNumber) {
    await updateSheetValues(
      config,
      config.paymentsSheetName,
      `A${rowNumber}:${lastColumnLetter}${rowNumber}`,
      [toOrderedRow(PAYMENT_SHEET_HEADERS, nextRecord)],
    );

    cacheMirroredPaymentRecord(nextRecord);

    return nextRecord;
  }

  await appendSheetValues(config, config.paymentsSheetName, `A1:${lastColumnLetter}`, [
    toOrderedRow(PAYMENT_SHEET_HEADERS, nextRecord),
  ]);

  cacheMirroredPaymentRecord(nextRecord);

  return nextRecord;
};

export const findTelegramAccessTokenRecordByTokenId = async (
  tokenId: string,
  options?: {
    source?: RecordSource;
  },
) => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseRecord({
    read: () => findTelegramAccessTokenRecordByTokenIdFromDatabase(tokenId),
    source,
    warn: (error) => {
      console.warn(
        "Failed to load Telegram access token by id from database, falling back to Sheets",
        { error, tokenId },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

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

export const findTelegramAccessTokenRecordByTokenHash = async (
  tokenHash: string,
  options?: {
    source?: RecordSource;
  },
) => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseRecord({
    read: () => findTelegramAccessTokenRecordByTokenHashFromDatabase(tokenHash),
    source,
    warn: (error) => {
      console.warn(
        "Failed to load Telegram access token by hash from database, falling back to Sheets",
        { error },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

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

export const findTelegramAccessTokenRecordByTokenValue = async (
  tokenValue: string,
  options?: {
    source?: RecordSource;
  },
) => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseRecord({
    read: () => findTelegramAccessTokenRecordByTokenValueFromDatabase(tokenValue),
    source,
    warn: (error) => {
      console.warn(
        "Failed to load Telegram access token by value from database, falling back to Sheets",
        { error },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

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

export const listTelegramAccessTokenRecords = async (options?: {
  cacheTtlMs?: number;
  readOnly?: boolean;
  source?: RecordSource;
}): Promise<TelegramAccessTokenSheetRecord[]> => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseCollection({
    read: () => listTelegramAccessTokenRecordsFromDatabase(),
    source,
    warn: (error) => {
      console.warn(
        "Failed to list Telegram access tokens from database, falling back to Sheets",
        { error },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

  return getRows(
    config,
    config.telegramAccessTokensSheetName,
    TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
    TELEGRAM_ACCESS_TOKENS_SHEET_HEADER_LABELS,
    {
      cacheTtlMs: options?.cacheTtlMs ?? 0,
      readOnly: options?.readOnly,
    },
  );
};

export const findLatestTelegramAccessTokenRecordByPaymentIntentId = async (
  paymentIntentId: string,
  options?: {
    source?: RecordSource;
  },
) => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseRecord({
    read: () =>
      findLatestTelegramAccessTokenRecordByPaymentIntentIdFromDatabase(paymentIntentId),
    source,
    warn: (error) => {
      console.warn(
        "Failed to load latest Telegram access token from database, falling back to Sheets",
        { error, paymentIntentId },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

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

const createAdminInviteLinkHistorySourceRecord = ({
  paymentRecord,
  tokenById,
}: {
  paymentRecord: PaymentSheetRecord;
  tokenById: Map<string, TelegramAccessTokenSheetRecord>;
}): AdminInviteLinkHistorySourceRecord | null => {
  const tokenRecord = tokenById.get(paymentRecord.telegram_token_id.trim());
  const accessUrl = tokenRecord?.token_value.trim() ?? "";
  const createdAt =
    paymentRecord.successful_customer_logged_at.trim() ||
    paymentRecord.first_seen_at.trim() ||
    paymentRecord.updated_at.trim() ||
    tokenRecord?.created_at.trim() ||
    "";

  if (!accessUrl) {
    return null;
  }

  return {
    accessUrl,
    adminLabel: paymentRecord.customer_nickname.trim(),
    createdAt,
    lessonLanguage: paymentRecord.lesson_language.trim(),
    offerLabel: paymentRecord.offer_label.trim(),
    productTitle: paymentRecord.product_title.trim(),
    purchaseItem: paymentRecord.purchase_item.trim(),
    tokenExpiresAt:
      paymentRecord.telegram_token_expires_at.trim() ||
      tokenRecord?.expires_at.trim() ||
      "",
    tokenUsedAt:
      paymentRecord.telegram_token_used_at.trim() || tokenRecord?.used_at.trim() || "",
  };
};

export const findAdminInviteLinkHistorySourceRecords = async ({
  accessWorkflow,
  limit,
}: {
  accessWorkflow: string;
  limit?: number;
}) => {
  const normalizedAccessWorkflow = accessWorkflow.trim().toLowerCase();

  if (!normalizedAccessWorkflow) {
    return [] as AdminInviteLinkHistorySourceRecord[];
  }

  const paymentRows = await listPaymentRecords();
  const adminPaymentRows = paymentRows.filter(
    (row) =>
      row.access_workflow.trim().toLowerCase() === normalizedAccessWorkflow &&
      row.payment_intent_id.trim(),
  );

  if (adminPaymentRows.length === 0) {
    return [] as AdminInviteLinkHistorySourceRecord[];
  }

  const tokenRows = await listTelegramAccessTokenRecords();
  const tokenById = new Map(
    tokenRows
      .map((row) => [row.token_id.trim(), row] as const)
      .filter(([tokenId]) => Boolean(tokenId)),
  );

  const historyRows = adminPaymentRows
    .map((paymentRecord) =>
      createAdminInviteLinkHistorySourceRecord({
        paymentRecord,
        tokenById,
      }),
    )
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
  const databaseRecord = await upsertTelegramAccessTokenRecordToDatabase(record);
  const config = getRequiredGoogleSheetsConfig();

  return upsertRecordByFieldValue({
    config,
    fieldName: "token_id",
    fieldValue: record.token_id,
    headers: TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
    labelsMap: TELEGRAM_ACCESS_TOKENS_SHEET_HEADER_LABELS,
    record: databaseRecord,
    sheetTitle: config.telegramAccessTokensSheetName,
  });
};

export const claimTelegramAccessTokenRecord = async (
  claim: Parameters<typeof claimTelegramAccessTokenRecordInDatabase>[0],
) => {
  const result = await claimTelegramAccessTokenRecordInDatabase(claim);

  if (
    !result.record ||
    result.status === "claimed_by_another_user" ||
    result.status === "unavailable"
  ) {
    return result;
  }

  const config = getRequiredGoogleSheetsConfig();
  const mirroredRecord = await upsertRecordByFieldValue({
    config,
    fieldName: "token_id",
    fieldValue: result.record.token_id,
    headers: TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
    labelsMap: TELEGRAM_ACCESS_TOKENS_SHEET_HEADER_LABELS,
    record: result.record,
    sheetTitle: config.telegramAccessTokensSheetName,
  });

  return {
    ...result,
    record: mirroredRecord,
  };
};

export const findTelegramUserBindingByPaymentIntentId = async (
  paymentIntentId: string,
  options?: {
    source?: RecordSource;
  },
) => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseRecord({
    read: () => findTelegramUserBindingByPaymentIntentIdFromDatabase(paymentIntentId),
    source,
    warn: (error) => {
      console.warn(
        "Failed to load Telegram user binding by payment from database, falling back to Sheets",
        { error, paymentIntentId },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

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

export const findMonthlySalesReportRunByKey = async (
  reportKey: string,
  options?: {
    source?: RecordSource;
  },
) => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseRecord({
    read: () => findMonthlySalesReportRunByKeyFromDatabase(reportKey),
    source,
    warn: (error) => {
      console.warn(
        "Failed to load monthly sales report run from database, falling back to Sheets",
        { error, reportKey },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

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

export const listMonthlySalesReportRunRecords = async (options?: {
  cacheTtlMs?: number;
  readOnly?: boolean;
  source?: RecordSource;
}): Promise<MonthlySalesReportRunSheetRecord[]> => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseCollection({
    read: () => listMonthlySalesReportRunRecordsFromDatabase(),
    source,
    warn: (error) => {
      console.warn(
        "Failed to list monthly sales report runs from database, falling back to Sheets",
        { error },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

  return getRows(
    config,
    config.monthlySalesReportRunsSheetName,
    MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
    MONTHLY_SALES_REPORT_RUNS_SHEET_HEADER_LABELS,
    {
      cacheTtlMs: options?.cacheTtlMs ?? 0,
      readOnly: options?.readOnly,
    },
  );
};

export const upsertMonthlySalesReportRun = async (
  record: MonthlySalesReportRunSheetRecord,
) => {
  const databaseRecord = await upsertMonthlySalesReportRunToDatabase(record);
  const config = getRequiredGoogleSheetsConfig();

  return upsertRecordByFieldValue({
    config,
    fieldName: "report_key",
    fieldValue: record.report_key,
    headers: MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
    labelsMap: MONTHLY_SALES_REPORT_RUNS_SHEET_HEADER_LABELS,
    record: databaseRecord,
    sheetTitle: config.monthlySalesReportRunsSheetName,
  });
};

export const listEmailCampaignLeadRecords = async (options?: {
  cacheTtlMs?: number;
  readOnly?: boolean;
  source?: RecordSource;
}): Promise<EmailCampaignLeadSheetRecord[]> => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseCollection({
    read: () => listEmailCampaignLeadRecordsFromDatabase(),
    source,
    warn: (error) => {
      console.warn(
        "Failed to list email campaign leads from database, falling back to Sheets",
        { error },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

  return getRows(
    config,
    config.emailCampaignLeadsSheetName,
    EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
    EMAIL_CAMPAIGN_LEADS_SHEET_HEADER_LABELS,
    {
      cacheTtlMs: options?.cacheTtlMs ?? 0,
      readOnly: options?.readOnly,
    },
  );
};

export const findEmailCampaignLeadByCampaignAndEmail = async ({
  campaignKey,
  email,
  source = "auto",
}: {
  campaignKey: string;
  email: string;
  source?: RecordSource;
}) => {
  const normalizedCampaignKey = campaignKey.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedCampaignKey || !normalizedEmail) {
    return null;
  }

  const databaseResolution = await readDatabaseRecord({
    read: () =>
      findEmailCampaignLeadByCampaignAndEmailFromDatabase({
        campaignKey: normalizedCampaignKey,
        email: normalizedEmail,
      }),
    source,
    warn: (error) => {
      console.warn(
        "Failed to load email campaign lead from database, falling back to Sheets",
        { campaignKey: normalizedCampaignKey, error },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const rows = await listEmailCampaignLeadRecords({
    cacheTtlMs: 0,
    source: "sheets",
  });

  return (
    rows.find(
      (row) =>
        row.campaign_key.trim() === normalizedCampaignKey &&
        row.email.trim().toLowerCase() === normalizedEmail,
    ) ?? null
  );
};

export const upsertEmailCampaignLeadRecord = async (
  record: EmailCampaignLeadSheetRecord,
) => {
  const databaseRecord = await upsertEmailCampaignLeadRecordToDatabase(record);
  const config = getRequiredGoogleSheetsConfig();

  return upsertRecordByFieldValue({
    config,
    fieldName: "lead_id",
    fieldValue: record.lead_id,
    headers: EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
    labelsMap: EMAIL_CAMPAIGN_LEADS_SHEET_HEADER_LABELS,
    record: databaseRecord,
    sheetTitle: config.emailCampaignLeadsSheetName,
  });
};

export const findTelegramUserBindingsByTelegramUserId = async (
  telegramUserId: string,
  options?: {
    source?: RecordSource;
  },
) => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseCollection({
    read: () => findTelegramUserBindingsByTelegramUserIdFromDatabase(telegramUserId),
    source,
    warn: (error) => {
      console.warn(
        "Failed to load Telegram user bindings by user id from database, falling back to Sheets",
        { error, telegramUserId },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

  const rows = await getRows(
    config,
    config.telegramUserBindingsSheetName,
    TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
    TELEGRAM_USER_BINDINGS_SHEET_HEADER_LABELS,
  );

  return rows.filter((row) => row.telegram_user_id === telegramUserId);
};

export const findTelegramUserBindingsByCustomerEmail = async (
  customerEmail: string,
  options?: {
    source?: RecordSource;
  },
) => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseCollection({
    read: () => findTelegramUserBindingsByCustomerEmailFromDatabase(customerEmail),
    source,
    warn: (error) => {
      console.warn(
        "Failed to load Telegram user bindings by customer email from database, falling back to Sheets",
        { error },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

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
  source = "auto",
  telegramUserId,
}: {
  chatId: string;
  source?: RecordSource;
  telegramUserId: string;
}) => {
  const databaseResolution = await readDatabaseCollection({
    read: () =>
      findTelegramUserBindingsByTelegramUserIdAndChatIdFromDatabase({
        chatId,
        telegramUserId,
      }),
    source,
    warn: (error) => {
      console.warn(
        "Failed to load Telegram user bindings by user/chat from database, falling back to Sheets",
        { error, telegramUserId },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

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

export const findActiveTelegramUserBindings = async (options?: {
  source?: RecordSource;
}) => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseCollection({
    read: () => findActiveTelegramUserBindingsFromDatabase(),
    source,
    warn: (error) => {
      console.warn(
        "Failed to load active Telegram user bindings from database, falling back to Sheets",
        { error },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

  const rows = await getRows(
    config,
    config.telegramUserBindingsSheetName,
    TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
    TELEGRAM_USER_BINDINGS_SHEET_HEADER_LABELS,
  );

  return rows.filter((row) => row.status === "active");
};

export const listTelegramUserBindingRecords = async (options?: {
  cacheTtlMs?: number;
  readOnly?: boolean;
  source?: RecordSource;
}): Promise<TelegramUserBindingSheetRecord[]> => {
  const source = options?.source ?? "auto";

  const databaseResolution = await readDatabaseCollection({
    read: () => listTelegramUserBindingRecordsFromDatabase(),
    source,
    warn: (error) => {
      console.warn(
        "Failed to list Telegram user bindings from database, falling back to Sheets",
        { error },
      );
    },
  });

  if (databaseResolution.kind === "resolved") {
    return databaseResolution.value;
  }

  const config = getRequiredGoogleSheetsConfig();

  return getRows(
    config,
    config.telegramUserBindingsSheetName,
    TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
    TELEGRAM_USER_BINDINGS_SHEET_HEADER_LABELS,
    {
      cacheTtlMs: options?.cacheTtlMs ?? 0,
      readOnly: options?.readOnly,
    },
  );
};

export const upsertTelegramUserBindingRecord = async (
  record: TelegramUserBindingSheetRecord,
) => {
  const databaseRecord = await upsertTelegramUserBindingRecordToDatabase(record);
  const config = getRequiredGoogleSheetsConfig();

  return upsertRecordByFieldValue({
    config,
    fieldName: "payment_intent_id",
    fieldValue: record.payment_intent_id,
    headers: TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
    labelsMap: TELEGRAM_USER_BINDINGS_SHEET_HEADER_LABELS,
    record: databaseRecord,
    sheetTitle: config.telegramUserBindingsSheetName,
  });
};
