import { createHash, createSign } from "node:crypto";

import {
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

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_API_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_SHEETS_READ_ONLY_SCOPE =
  "https://www.googleapis.com/auth/spreadsheets.readonly";
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
  scope: string;
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

class GoogleSheetsError extends Error {
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

let accessTokenCache: AccessTokenCache | null = null;
let sheetTitleCache: SheetTitleCache | null = null;
const headerValidationCache = new Map<string, HeaderValidationCacheEntry>();
const pendingHeaderValidation = new Map<string, Promise<void>>();
const rowsCache = new Map<string, RowsCacheEntry>();
const rowLookupCache = new Map<string, RowLookupCacheEntry>();

const SHEET_HEADERS_CACHE_TTL_MS = 60 * 60 * 1000;
const SHEET_ROWS_CACHE_TTL_MS = 60 * 1000;
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

const getJwtAssertion = (config: GoogleSheetsConfig, scope: string) => {
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
      scope,
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

const createGoogleAccessTokenRequest = (
  config: GoogleSheetsConfig,
  scope: string,
): RequestInit => ({
  method: "POST",
  headers: {
    "Content-Type": FORM_URLENCODED_CONTENT_TYPE,
  },
  body: new URLSearchParams({
    assertion: getJwtAssertion(config, scope),
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

const cacheGoogleAccessToken = (
  data: GoogleSheetsTokenResponse,
  scope: string,
): string => {
  const token = data.access_token ?? "";
  const expiresInMs =
    Math.max(
      (data.expires_in ?? GOOGLE_ACCESS_TOKEN_DEFAULT_TTL_SECONDS) -
        GOOGLE_ACCESS_TOKEN_REFRESH_BUFFER_SECONDS,
      GOOGLE_ACCESS_TOKEN_MIN_CACHE_TTL_SECONDS,
    ) * 1000;

  accessTokenCache = {
    expiresAt: Date.now() + expiresInMs,
    scope,
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
  scope,
}: {
  attempt: number;
  parsedResponse: ParsedGoogleAccessTokenResponse;
  response: Response;
  scope: string;
}): GoogleSheetsResponseResolution<string> => {
  if (response.ok && parsedResponse.data?.access_token) {
    return {
      kind: "complete",
      value: cacheGoogleAccessToken(parsedResponse.data, scope),
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

const getGoogleAccessToken = async (
  config: GoogleSheetsConfig,
  scope: string,
): Promise<string> => {
  assertGoogleSheetsRateLimitWindow();

  if (
    accessTokenCache &&
    accessTokenCache.expiresAt > Date.now() &&
    accessTokenCache.scope === scope
  ) {
    return accessTokenCache.token;
  }

  for (let attempt = 0; attempt <= GOOGLE_SHEETS_REQUEST_MAX_RETRIES; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(
        GOOGLE_OAUTH_TOKEN_URL,
        createGoogleAccessTokenRequest(config, scope),
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
      scope,
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
  scope = GOOGLE_SHEETS_SCOPE,
): Promise<T> => {
  assertGoogleSheetsRateLimitWindow();

  for (let attempt = 0; attempt <= GOOGLE_SHEETS_REQUEST_MAX_RETRIES; attempt += 1) {
    let accessToken: string;

    try {
      accessToken = await getGoogleAccessToken(config, scope);
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
  options?: {
    scope?: string;
  },
) => {
  const encodedRange = encodeURIComponent(getSheetRange(sheetTitle, range));
  const data = await googleSheetsRequest<GoogleSheetsValuesResponse>(
    config,
    `/values/${encodedRange}`,
    {
      method: "GET",
    },
    options?.scope,
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

export type GoogleSheetsSourceSnapshot = {
  captureCompletedAt: string;
  captureStartedAt: string;
  schemaVersion: 1;
  sheets: Array<{
    columnCount: number;
    expectedColumns: readonly string[];
    key: string;
    rowCount: number;
    title: string;
    values: string[][];
  }>;
  spreadsheetIdSha256: string;
};

/**
 * Captures the seven migration-owned ranges without schema synchronization or any
 * other write. The result contains PII and bearer material and must only be written
 * inside the protected DATA snapshot workspace.
 */
export const captureGoogleSheetsSourceSnapshot =
  async (): Promise<GoogleSheetsSourceSnapshot> => {
    const captureStartedAt = new Date().toISOString();
    const config = getRequiredGoogleSheetsConfig();
    const definitions = [
      {
        expectedColumns: PAYMENT_SHEET_HEADERS,
        key: "payments",
        title: config.paymentsSheetName,
      },
      {
        expectedColumns: STRIPE_EVENT_SHEET_HEADERS,
        key: "stripeEvents",
        title: config.stripeEventsSheetName,
      },
      {
        expectedColumns: SUCCESSFUL_CUSTOMERS_SHEET_HEADERS,
        key: "successfulCustomers",
        title: config.successfulCustomersSheetName,
      },
      {
        expectedColumns: TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS,
        key: "telegramAccessTokens",
        title: config.telegramAccessTokensSheetName,
      },
      {
        expectedColumns: TELEGRAM_USER_BINDINGS_SHEET_HEADERS,
        key: "telegramUserBindings",
        title: config.telegramUserBindingsSheetName,
      },
      {
        expectedColumns: MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS,
        key: "monthlySalesReportRuns",
        title: config.monthlySalesReportRunsSheetName,
      },
      {
        expectedColumns: EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
        key: "emailCampaignLeads",
        title: config.emailCampaignLeadsSheetName,
      },
    ] as const;
    const sheets = await Promise.all(
      definitions.map(async ({ expectedColumns, key, title }) => {
        const lastColumnLetter = columnIndexToLetter(expectedColumns.length);
        const values = await getSheetValues(config, title, `A1:${lastColumnLetter}`, {
          scope: GOOGLE_SHEETS_READ_ONLY_SCOPE,
        });

        return {
          columnCount: expectedColumns.length,
          expectedColumns,
          key,
          rowCount: values.slice(1).filter((row) => row.some((cell) => cell !== ""))
            .length,
          title,
          values,
        };
      }),
    );

    return {
      captureCompletedAt: new Date().toISOString(),
      captureStartedAt,
      schemaVersion: 1,
      sheets,
      spreadsheetIdSha256: createHash("sha256")
        .update(config.spreadsheetId)
        .digest("hex"),
    };
  };

export const listPaymentRecords = async (options: {
  cacheTtlMs?: number;
  readOnly?: boolean;
}): Promise<PaymentSheetRecord[]> => {
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

export const listStripeEventRecords = async (options: {
  cacheTtlMs?: number;
  readOnly?: boolean;
}): Promise<StripeEventSheetRecord[]> => {
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

export const listTelegramAccessTokenRecords = async (options: {
  cacheTtlMs?: number;
  readOnly?: boolean;
}): Promise<TelegramAccessTokenSheetRecord[]> => {
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

export const listMonthlySalesReportRunRecords = async (options: {
  cacheTtlMs?: number;
  readOnly?: boolean;
}): Promise<MonthlySalesReportRunSheetRecord[]> => {
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

export const listEmailCampaignLeadRecords = async (options: {
  cacheTtlMs?: number;
  readOnly?: boolean;
}): Promise<EmailCampaignLeadSheetRecord[]> => {
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

export const listTelegramUserBindingRecords = async (options: {
  cacheTtlMs?: number;
  readOnly?: boolean;
}): Promise<TelegramUserBindingSheetRecord[]> => {
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
