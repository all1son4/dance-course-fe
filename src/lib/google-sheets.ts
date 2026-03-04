import { createSign } from "node:crypto";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_API_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DEFAULT_PAYMENTS_SHEET_NAME = "Payments";
const DEFAULT_STRIPE_EVENTS_SHEET_NAME = "StripeEvents";

const PAYMENT_SHEET_HEADERS = [
  "payment_intent_id",
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
  "customer_email",
  "customer_name",
  "customer_last_name",
  "customer_nickname",
  "customer_country",
  "last_payment_error_code",
  "last_payment_error_message",
  "first_seen_at",
  "updated_at",
  "checkout_session_id",
] as const;

const STRIPE_EVENT_SHEET_HEADERS = [
  "event_id",
  "event_type",
  "payment_intent_id",
  "status",
  "outcome",
  "processed_at",
] as const;

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
  privateKey: string;
  serviceAccountEmail: string;
  spreadsheetId: string;
  stripeEventsSheetName: string;
};

type AccessTokenCache = {
  expiresAt: number;
  token: string;
};

type SheetTitleCache = {
  sheetTitles: Set<string>;
  spreadsheetId: string;
};

type PaymentSheetHeader = (typeof PAYMENT_SHEET_HEADERS)[number];
type StripeEventSheetHeader = (typeof STRIPE_EVENT_SHEET_HEADERS)[number];

export type PaymentSheetRecord = Record<PaymentSheetHeader, string>;
export type StripeEventSheetRecord = Record<StripeEventSheetHeader, string>;

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

let accessTokenCache: AccessTokenCache | null = null;
let sheetTitleCache: SheetTitleCache | null = null;

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
    paymentsSheetName:
      process.env.GOOGLE_SHEETS_PAYMENTS_SHEET_NAME?.trim() ||
      DEFAULT_PAYMENTS_SHEET_NAME,
    privateKey,
    serviceAccountEmail,
    spreadsheetId,
    stripeEventsSheetName:
      process.env.GOOGLE_SHEETS_EVENTS_SHEET_NAME?.trim() ||
      DEFAULT_STRIPE_EVENTS_SHEET_NAME,
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
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) {
    return accessTokenCache.token;
  }

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
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
  const data = (await response.json()) as GoogleSheetsTokenResponse;

  if (!response.ok || !data.access_token) {
    throw new GoogleSheetsError(
      data.error ?? "google_access_token_failed",
      data.error_description ?? "Failed to obtain Google access token.",
      response.status,
    );
  }

  const expiresInMs = Math.max((data.expires_in ?? 3600) - 60, 60) * 1000;

  accessTokenCache = {
    expiresAt: Date.now() + expiresInMs,
    token: data.access_token,
  };

  return data.access_token;
};

const getGoogleSheetsUrl = (config: GoogleSheetsConfig, path: string) =>
  `${GOOGLE_SHEETS_API_BASE_URL}/${config.spreadsheetId}${path}`;

const googleSheetsRequest = async <T>(
  config: GoogleSheetsConfig,
  path: string,
  init?: RequestInit,
) => {
  const accessToken = await getGoogleAccessToken(config);
  const response = await fetch(getGoogleSheetsUrl(config, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

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

  if (!response.ok) {
    throw new GoogleSheetsError(
      "google_sheets_request_failed",
      responseText || "Google Sheets request failed.",
      response.status,
    );
  }

  return data as T;
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
};

const ensureSheetHeaders = async (
  config: GoogleSheetsConfig,
  sheetTitle: string,
  headers: readonly string[],
) => {
  await ensureSheetExists(config, sheetTitle);

  const currentHeaderRow = (await getSheetValues(config, sheetTitle, "1:1"))[0] ?? [];
  const hasExpectedHeaders =
    headers.length === currentHeaderRow.length &&
    headers.every((header, index) => currentHeaderRow[index] === header);

  if (hasExpectedHeaders) {
    return;
  }

  const lastColumnLetter = columnIndexToLetter(headers.length);

  await updateSheetValues(config, sheetTitle, `A1:${lastColumnLetter}1`, [
    Array.from(headers),
  ]);
};

const mapRowToRecord = <T extends string>(headers: readonly T[], row: string[]) =>
  headers.reduce(
    (record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    },
    {} as Record<T, string>,
  );

const getRows = async <T extends string>(
  config: GoogleSheetsConfig,
  sheetTitle: string,
  headers: readonly T[],
) => {
  await ensureSheetHeaders(config, sheetTitle, headers);

  const lastColumnLetter = columnIndexToLetter(headers.length);
  const values = await getSheetValues(config, sheetTitle, `A1:${lastColumnLetter}`);

  return values
    .slice(1)
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) => mapRowToRecord(headers, row));
};

const getRowNumberByFieldValue = <T extends string>(
  rows: Array<Record<T, string>>,
  fieldName: T,
  fieldValue: string,
) => {
  const rowIndex = rows.findIndex((row) => row[fieldName] === fieldValue);

  return rowIndex >= 0 ? rowIndex + 2 : null;
};

const toOrderedRow = <T extends string>(
  headers: readonly T[],
  record: Record<T, string>,
) => headers.map((header) => record[header] ?? "");

export const isGoogleSheetsConfigured = () => Boolean(getGoogleSheetsConfig());

export const findPaymentRecordByIntentId = async (paymentIntentId: string) => {
  const config = getGoogleSheetsConfig();

  if (!config) {
    throw new GoogleSheetsError(
      "google_sheets_not_configured",
      "Google Sheets env variables are missing.",
      null,
    );
  }

  const rows = await getRows(config, config.paymentsSheetName, PAYMENT_SHEET_HEADERS);

  return rows.find((row) => row.payment_intent_id === paymentIntentId) ?? null;
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

  const rows = await getRows(
    config,
    config.stripeEventsSheetName,
    STRIPE_EVENT_SHEET_HEADERS,
  );

  return rows.find((row) => row.event_id === eventId) ?? null;
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
  );
  const lastColumnLetter = columnIndexToLetter(STRIPE_EVENT_SHEET_HEADERS.length);

  await appendSheetValues(
    config,
    config.stripeEventsSheetName,
    `A1:${lastColumnLetter}`,
    [toOrderedRow(STRIPE_EVENT_SHEET_HEADERS, record)],
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

  const rows = await getRows(config, config.paymentsSheetName, PAYMENT_SHEET_HEADERS);
  const existingRecord =
    rows.find((row) => row.payment_intent_id === record.payment_intent_id) ?? null;
  const nextRecord: PaymentSheetRecord = {
    ...record,
    first_seen_at: existingRecord?.first_seen_at || record.first_seen_at,
  };
  const rowNumber = getRowNumberByFieldValue(
    rows,
    "payment_intent_id",
    record.payment_intent_id,
  );
  const lastColumnLetter = columnIndexToLetter(PAYMENT_SHEET_HEADERS.length);

  if (rowNumber) {
    await updateSheetValues(
      config,
      config.paymentsSheetName,
      `A${rowNumber}:${lastColumnLetter}${rowNumber}`,
      [toOrderedRow(PAYMENT_SHEET_HEADERS, nextRecord)],
    );

    return nextRecord;
  }

  await appendSheetValues(config, config.paymentsSheetName, `A1:${lastColumnLetter}`, [
    toOrderedRow(PAYMENT_SHEET_HEADERS, nextRecord),
  ]);

  return nextRecord;
};
