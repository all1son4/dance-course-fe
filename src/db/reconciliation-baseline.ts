import { createHash } from "node:crypto";

import type {
  EmailCampaignLeadSheetRecord,
  MonthlySalesReportRunSheetRecord,
  PaymentSheetRecord,
  StripeEventSheetRecord,
  SuccessfulCustomersSheetRecord,
  TelegramAccessTokenSheetRecord,
  TelegramUserBindingSheetRecord,
} from "@/lib/google-sheets-schema";

type DateValue = Date | string | null;

export type DatabaseReconciliationSnapshot = {
  catalog: {
    offers: Array<{
      accessWorkflow: string | null;
      code: string;
      deliveryChannel: string | null;
      externalOfferId: string;
      isActive: boolean;
      productExternalId: string;
      sortOrder: number;
      telegramAccessDurationDays: number | null;
    }>;
    prices: Array<{
      amountMinor: number;
      currency: string;
      externalOfferId: string;
      isActive: boolean;
    }>;
    products: Array<{
      code: string;
      defaultOfferExternalId: string | null;
      externalProductId: string;
      isActive: boolean;
      slug: string;
      type: string;
    }>;
  };
  customerCount: number;
  emailCampaignLeads: Array<{
    campaignKey: string;
    emailSendAttempts: number;
    key: string;
    locale: string;
    status: string;
  }>;
  entitlements: Array<{
    accessKey: string;
    accessWorkflow: string | null;
    currentTokenId: string | null;
    deliveryChannel: string | null;
    expiresAt: DateValue;
    key: string;
    offerExternalId: string;
    productExternalId: string;
    revokedAt: DateValue;
    startsAt: DateValue;
    status: string;
    telegramChatId: string | null;
    telegramUserId: string | null;
  }>;
  invoices: Array<{
    amountMinor: number;
    currency: string;
    issuedAt: DateValue;
    key: string;
    paymentIntentId: string;
  }>;
  monthlyReportRuns: Array<{
    csvSha256: string | null;
    key: string;
    reportFamily: string;
    rowCount: number;
    status: string;
  }>;
  onlineGroupCampaigns: Array<{
    status: string;
  }>;
  purchases: Array<{
    amountMinor: number;
    checkoutCurrency: string | null;
    currency: string;
    customerAddressLineSnapshot: string | null;
    customerCitySnapshot: string | null;
    customerCountrySnapshot: string | null;
    customerEmailSnapshot: string | null;
    customerFullNameSnapshot: string | null;
    customerPostalCodeSnapshot: string | null;
    customerTelegramUsernameSnapshot: string | null;
    firstSeenAt: DateValue;
    key: string;
    latestEventId: string | null;
    latestEventType: string | null;
    lessonLanguage: string | null;
    offerExternalId: string;
    offerLabelSnapshot: string | null;
    outcome: string;
    productExternalId: string;
    productTitleSnapshot: string | null;
    purchaseItemSnapshot: string | null;
    source: string;
    stripeStatus: string;
    succeededAt: DateValue;
  }>;
  purchaseSideEffects: Array<{
    key: string;
    kind: string;
    status: string;
  }>;
  renewalCampaigns: Array<{
    status: string;
  }>;
  renewalVerifications: Array<{
    status: string;
  }>;
  stripeEvents: Array<{
    eventType: string;
    key: string;
    outcome: string;
    paymentIntentId: string;
    source: string;
    status: string;
  }>;
  telegramAccessTokens: Array<{
    accessExpiresAt: DateValue;
    chatId: string | null;
    expiresAt: DateValue;
    key: string;
    linkKind: string;
    offerExternalId: string;
    paymentIntentId: string;
    productExternalId: string;
    status: string;
    telegramUserId: string | null;
    usedAt: DateValue;
  }>;
  telegramUserBindings: Array<{
    accessExpiresAt: DateValue;
    boundAt: DateValue;
    key: string;
    offerExternalId: string;
    productExternalId: string;
    revokedAt: DateValue;
    status: string;
    telegramUserId: string;
  }>;
};

export type SheetsReconciliationSnapshot = {
  emailCampaignLeads: EmailCampaignLeadSheetRecord[];
  monthlyReportRuns: MonthlySalesReportRunSheetRecord[];
  payments: PaymentSheetRecord[];
  stripeEvents: StripeEventSheetRecord[];
  successfulCustomers: SuccessfulCustomersSheetRecord[];
  telegramAccessTokens: TelegramAccessTokenSheetRecord[];
  telegramUserBindings: TelegramUserBindingSheetRecord[];
};

type ReconciliationBaselineOptions = {
  captureCompletedAt?: string;
  captureStartedAt?: string;
  capturedAt: string;
  databaseEnvironment: string;
  databaseVariableName: string | null;
  sampleLimit?: number;
};

type KeyComparison = ReturnType<typeof compareKeys>;
type PaymentTotals = ReturnType<typeof summarizePayments>;

const REPORT_SCHEMA_VERSION = 3;
const DEFAULT_SAMPLE_LIMIT = 20;

const trim = (value: string | null | undefined) => value?.trim() ?? "";

const normalizeStatus = (value: string | null | undefined) =>
  trim(value).toLowerCase() || "unknown";

const SAFE_STATUS_CATEGORIES = new Set([
  "activated",
  "active",
  "archived",
  "canceled",
  "expired",
  "failed",
  "issued",
  "left",
  "left_channel",
  "link_failed",
  "not_required",
  "pending",
  "processed",
  "processing",
  "requires_action",
  "requires_payment_method",
  "revoked",
  "sending",
  "sent",
  "skipped",
  "succeeded",
  "token_issued",
  "unknown",
  "used",
  "verified",
]);
const SAFE_SOURCE_CATEGORIES = new Set([
  "admin_offer_link",
  "google_sheets_backfill",
  "legacy-sheet",
  "runtime",
  "stripe",
  "stripe_settlement_backfill",
  "unknown",
]);

const normalizeStatusCategory = (value: string | null | undefined) => {
  const category = normalizeStatus(value).split(":", 1)[0] || "unknown";

  return SAFE_STATUS_CATEGORIES.has(category) ? category : "other";
};

const normalizeSourceCategory = (value: string | null | undefined) => {
  const category = normalizeStatus(value);

  return SAFE_SOURCE_CATEGORIES.has(category) ? category : "other";
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

const hashIdentifier = (namespace: string, value: string) =>
  hash(`${namespace}\u0000${value}`);

const normalizeKeys = (keys: string[]) => keys.map(trim).filter(Boolean);

const getDuplicateKeys = (keys: string[]) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const key of keys) {
    if (seen.has(key)) {
      duplicates.add(key);
    } else {
      seen.add(key);
    }
  }

  return [...duplicates].sort();
};

const getKeyFingerprint = (keys: string[]) => hash([...new Set(keys)].sort().join("\n"));

const getRowsOnlyInLeft = <LeftRow, RightRow>({
  getLeftKey,
  getRightKey,
  leftRows,
  rightRows,
}: {
  getLeftKey: (row: LeftRow) => string;
  getRightKey: (row: RightRow) => string;
  leftRows: LeftRow[];
  rightRows: RightRow[];
}) => {
  const rightKeys = new Set(rightRows.map(getRightKey).map(trim).filter(Boolean));

  return leftRows.filter((row) => {
    const key = trim(getLeftKey(row));

    return Boolean(key) && !rightKeys.has(key);
  });
};

const getDuplicateOccurrences = <Row>(rows: Row[], getKey: (row: Row) => string) => {
  const seen = new Set<string>();

  return rows.filter((row) => {
    const key = trim(getKey(row));

    if (!key || !seen.has(key)) {
      if (key) {
        seen.add(key);
      }

      return false;
    }

    return true;
  });
};

const getPaymentRowTimestamp = (row: PaymentSheetRecord) => {
  const timestamp = Date.parse(row.updated_at || row.first_seen_at);

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getDuplicatePaymentOccurrences = (rows: PaymentSheetRecord[]) => {
  const rowsByKey = new Map<string, Array<{ index: number; row: PaymentSheetRecord }>>();

  rows.forEach((row, index) => {
    const key = trim(row.payment_intent_id);

    if (!key) {
      return;
    }

    rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), { index, row }]);
  });

  return [...rowsByKey.values()].flatMap((entries) => {
    if (entries.length < 2) {
      return [];
    }

    const canonical = [...entries].sort((left, right) => {
      const timestampDifference =
        getPaymentRowTimestamp(right.row) - getPaymentRowTimestamp(left.row);

      return timestampDifference || right.index - left.index;
    })[0];

    return entries
      .filter((entry) => entry.index !== canonical.index)
      .map((entry) => entry.row);
  });
};

const getCanonicalPaymentRows = (rows: PaymentSheetRecord[]) => {
  const canonicalByKey = new Map<string, { index: number; row: PaymentSheetRecord }>();

  rows.forEach((row, index) => {
    const key = trim(row.payment_intent_id);
    const current = canonicalByKey.get(key);

    if (!key) {
      return;
    }

    if (
      !current ||
      getPaymentRowTimestamp(row) > getPaymentRowTimestamp(current.row) ||
      (getPaymentRowTimestamp(row) === getPaymentRowTimestamp(current.row) &&
        index > current.index)
    ) {
      canonicalByKey.set(key, { index, row });
    }
  });

  return [...canonicalByKey.values()].map((entry) => entry.row);
};

const compareKeys = ({
  databaseKeys,
  namespace,
  sampleLimit,
  sheetKeys,
}: {
  databaseKeys: string[];
  namespace: string;
  sampleLimit: number;
  sheetKeys: string[];
}) => {
  const normalizedDatabaseKeys = normalizeKeys(databaseKeys);
  const normalizedSheetKeys = normalizeKeys(sheetKeys);
  const databaseKeySet = new Set(normalizedDatabaseKeys);
  const sheetKeySet = new Set(normalizedSheetKeys);
  const missingInDatabase = [...sheetKeySet]
    .filter((key) => !databaseKeySet.has(key))
    .sort();
  const extraInDatabase = [...databaseKeySet]
    .filter((key) => !sheetKeySet.has(key))
    .sort();
  const duplicateDatabaseKeys = getDuplicateKeys(normalizedDatabaseKeys);
  const duplicateSheetKeys = getDuplicateKeys(normalizedSheetKeys);
  const status =
    missingInDatabase.length === 0 &&
    extraInDatabase.length === 0 &&
    duplicateDatabaseKeys.length === 0 &&
    duplicateSheetKeys.length === 0
      ? ("ok" as const)
      : ("mismatch" as const);
  const toHashedSample = (keys: string[]) =>
    keys
      .slice(0, sampleLimit)
      .map((key) => hashIdentifier(namespace, key))
      .sort();

  return {
    database: {
      count: normalizedDatabaseKeys.length,
      duplicateCount: duplicateDatabaseKeys.length,
      duplicateKeyHashes: toHashedSample(duplicateDatabaseKeys),
      fingerprintSha256: getKeyFingerprint(normalizedDatabaseKeys),
      uniqueCount: databaseKeySet.size,
    },
    differences: {
      extraInDatabaseCount: extraInDatabase.length,
      extraInDatabaseKeyHashes: toHashedSample(extraInDatabase),
      missingInDatabaseCount: missingInDatabase.length,
      missingInDatabaseKeyHashes: toHashedSample(missingInDatabase),
    },
    sheet: {
      count: normalizedSheetKeys.length,
      duplicateCount: duplicateSheetKeys.length,
      duplicateKeyHashes: toHashedSample(duplicateSheetKeys),
      fingerprintSha256: getKeyFingerprint(normalizedSheetKeys),
      uniqueCount: sheetKeySet.size,
    },
    status,
  };
};

type MatchedRowField<DatabaseRow, SheetRow> = {
  databaseValue: (row: DatabaseRow) => string;
  name: string;
  sheetValue: (row: SheetRow) => string;
};

const normalizeComparableText = (value: unknown) =>
  typeof value === "string"
    ? value.trim()
    : value === null || value === undefined
      ? ""
      : String(value);

const normalizeComparableLower = (value: unknown) =>
  normalizeComparableText(value).toLowerCase();

const normalizeComparableInteger = (value: unknown) => {
  const parsedValue = Number.parseInt(normalizeComparableText(value), 10);

  return Number.isSafeInteger(parsedValue) ? String(parsedValue) : "0";
};

const normalizeComparableDate = (value: unknown) => {
  const normalizedValue = normalizeComparableText(value);

  if (!normalizedValue) {
    return "";
  }

  const date = new Date(normalizedValue);

  return Number.isFinite(date.getTime()) ? date.toISOString() : normalizedValue;
};

const compareMatchedRows = <DatabaseRow, SheetRow>({
  databaseRows,
  fields,
  getDatabaseKey,
  getSheetKey,
  namespace,
  sampleLimit,
  sheetRows,
}: {
  databaseRows: DatabaseRow[];
  fields: Array<MatchedRowField<DatabaseRow, SheetRow>>;
  getDatabaseKey: (row: DatabaseRow) => string;
  getSheetKey: (row: SheetRow) => string;
  namespace: string;
  sampleLimit: number;
  sheetRows: SheetRow[];
}) => {
  const databaseByKey = new Map(
    databaseRows
      .map((row) => [trim(getDatabaseKey(row)), row] as const)
      .filter(([key]) => Boolean(key)),
  );
  const sheetByKey = new Map(
    sheetRows
      .map((row) => [trim(getSheetKey(row)), row] as const)
      .filter(([key]) => Boolean(key)),
  );
  const differencesByField = new Map<string, number>();
  const differenceKeys = new Set<string>();
  let comparedCount = 0;

  for (const [key, databaseRow] of databaseByKey) {
    const sheetRow = sheetByKey.get(key);

    if (!sheetRow) {
      continue;
    }

    comparedCount += 1;

    for (const field of fields) {
      if (field.databaseValue(databaseRow) === field.sheetValue(sheetRow)) {
        continue;
      }

      differenceKeys.add(key);
      differencesByField.set(field.name, (differencesByField.get(field.name) ?? 0) + 1);
    }
  }

  const sortedDifferenceKeys = [...differenceKeys].sort();

  return {
    comparedCount,
    differenceCount: sortedDifferenceKeys.length,
    differenceKeyHashes: sortedDifferenceKeys
      .slice(0, sampleLimit)
      .map((key) => hashIdentifier(namespace, key))
      .sort(),
    differencesByField: Object.fromEntries(
      [...differencesByField.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    status: sortedDifferenceKeys.length === 0 ? ("ok" as const) : ("mismatch" as const),
  };
};

const countBy = (values: string[]) => {
  const counts = new Map<string, number>();

  for (const value of values) {
    const normalizedValue = normalizeStatus(value);
    counts.set(normalizedValue, (counts.get(normalizedValue) ?? 0) + 1);
  }

  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
};

const countByStatus = (values: string[]) => countBy(values.map(normalizeStatusCategory));

const countBySource = (values: string[]) => countBy(values.map(normalizeSourceCategory));

const parseAmountMinor = (value: string | number) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : 0;
  }

  const parsedValue = Number.parseInt(trim(value), 10);

  return Number.isSafeInteger(parsedValue) ? parsedValue : 0;
};

const getUtcMonth = (value: DateValue) => {
  const date = value instanceof Date ? value : new Date(value ?? "");

  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 7) : "unknown";
};

const summarizePayments = (
  rows: Array<{
    amountMinor: number;
    currency: string;
    outcome: string;
    timestamp: DateValue;
  }>,
) => {
  const byCurrency = new Map<string, { amountMinor: number; count: number }>();
  const byCurrencyMonth = new Map<string, { amountMinor: number; count: number }>();
  const outcomes = countByStatus(rows.map((row) => row.outcome));

  for (const row of rows) {
    if (normalizeStatus(row.outcome) !== "succeeded") {
      continue;
    }

    const currency = trim(row.currency).toLowerCase() || "unknown";
    const month = getUtcMonth(row.timestamp);
    const currencyTotal = byCurrency.get(currency) ?? { amountMinor: 0, count: 0 };
    const monthKey = `${month}:${currency}`;
    const monthTotal = byCurrencyMonth.get(monthKey) ?? {
      amountMinor: 0,
      count: 0,
    };

    currencyTotal.amountMinor += row.amountMinor;
    currencyTotal.count += 1;
    monthTotal.amountMinor += row.amountMinor;
    monthTotal.count += 1;
    byCurrency.set(currency, currencyTotal);
    byCurrencyMonth.set(monthKey, monthTotal);
  }

  return {
    byCurrency: Object.fromEntries(
      [...byCurrency.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ),
    byCurrencyMonth: Object.fromEntries(
      [...byCurrencyMonth.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ),
    outcomes,
  };
};

const areEqual = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

const getDatabasePaymentTotals = (
  purchases: DatabaseReconciliationSnapshot["purchases"],
) =>
  summarizePayments(
    purchases.map((purchase) => ({
      amountMinor: purchase.amountMinor,
      currency: purchase.currency,
      outcome: purchase.outcome,
      timestamp: purchase.succeededAt ?? purchase.firstSeenAt,
    })),
  );

const getSheetPaymentTotals = (payments: PaymentSheetRecord[]) =>
  summarizePayments(
    payments.map((payment) => ({
      amountMinor: parseAmountMinor(payment.amount),
      currency: payment.checkout_currency || payment.currency,
      outcome: payment.outcome,
      timestamp:
        payment.successful_customer_logged_at ||
        payment.first_seen_at ||
        payment.updated_at,
    })),
  );

const buildFinanceComparison = ({
  database,
  sheets,
}: {
  database: PaymentTotals;
  sheets: PaymentTotals;
}) => ({
  database: {
    ...database,
    succeededMonthTimestampBasis: "purchases.succeeded_at; fallback first_seen_at",
  },
  matchesByCurrency: areEqual(database.byCurrency, sheets.byCurrency),
  matchesByCurrencyMonth: areEqual(database.byCurrencyMonth, sheets.byCurrencyMonth),
  sheet: {
    ...sheets,
    succeededMonthTimestampBasis:
      "successful_customer_logged_at; fallback first_seen_at/updated_at",
  },
});

const summarizePaymentRows = (
  rows: Array<{
    amount: string | number;
    currency: string;
    outcome: string;
    timestamp: DateValue;
  }>,
) => ({
  count: rows.length,
  finance: summarizePayments(
    rows.map((row) => ({
      amountMinor: parseAmountMinor(row.amount),
      currency: row.currency,
      outcome: row.outcome,
      timestamp: row.timestamp,
    })),
  ),
});

const buildMatchedPaymentDataAnalysis = ({
  databasePurchases,
  sheetPayments,
}: {
  databasePurchases: DatabaseReconciliationSnapshot["purchases"];
  sheetPayments: PaymentSheetRecord[];
}) => {
  const databasePurchaseByKey = new Map(
    databasePurchases.map((row) => [trim(row.key), row] as const),
  );
  const differences = getCanonicalPaymentRows(sheetPayments)
    .map((sheet) => ({
      database: databasePurchaseByKey.get(trim(sheet.payment_intent_id)),
      sheet,
    }))
    .filter(({ database, sheet }) => {
      if (!database) {
        return false;
      }

      return (
        database.amountMinor !== parseAmountMinor(sheet.amount) ||
        normalizeStatus(database.currency) !==
          normalizeStatus(sheet.checkout_currency || sheet.currency) ||
        normalizeStatus(database.outcome) !== normalizeStatus(sheet.outcome)
      );
    });

  return {
    byOutcomeTransition: countBy(
      differences.map(
        ({ database, sheet }) =>
          `${normalizeStatusCategory(database?.outcome)}->${normalizeStatusCategory(
            sheet.outcome,
          )}`,
      ),
    ),
    count: differences.length,
    database: summarizePaymentRows(
      differences.map(({ database }) => ({
        amount: database?.amountMinor ?? 0,
        currency: database?.currency ?? "unknown",
        outcome: database?.outcome ?? "unknown",
        timestamp: database?.succeededAt ?? database?.firstSeenAt ?? null,
      })),
    ),
    sheet: summarizePaymentRows(
      differences.map(({ sheet }) => ({
        amount: sheet.amount,
        currency: sheet.checkout_currency || sheet.currency,
        outcome: sheet.outcome,
        timestamp:
          sheet.successful_customer_logged_at || sheet.first_seen_at || sheet.updated_at,
      })),
    ),
  };
};

const summarizeStripeEventRows = (
  rows: Array<{ eventType: string; source?: string; status: string }>,
) => ({
  byEventType: countBy(rows.map((row) => row.eventType)),
  bySource: countBySource(rows.map((row) => row.source ?? "legacy-sheet")),
  byStatus: countByStatus(rows.map((row) => row.status)),
  count: rows.length,
});

const summarizeSuccessfulCustomerRows = (
  rows: Array<{ productExternalId: string; source?: string }>,
) => ({
  byProduct: countBy(rows.map((row) => row.productExternalId)),
  bySource: countBySource(rows.map((row) => row.source ?? "legacy-sheet")),
  count: rows.length,
});

const summarizeSheetOnlySuccessfulCustomerRows = ({
  databasePurchases,
  rows,
}: {
  databasePurchases: DatabaseReconciliationSnapshot["purchases"];
  rows: SuccessfulCustomersSheetRecord[];
}) => {
  const databasePurchaseByKey = new Map(
    databasePurchases.map((row) => [trim(row.key), row] as const),
  );

  return {
    ...summarizeSuccessfulCustomerRows(
      rows.map((row) => ({ productExternalId: row.product_id })),
    ),
    byDatabaseOutcome: countByStatus(
      rows.map(
        (row) =>
          databasePurchaseByKey.get(trim(row.payment_intent_id))?.outcome ??
          "missing-purchase",
      ),
    ),
  };
};

const summarizeTelegramTokenRows = (
  rows: Array<{
    linkKind: string;
    productExternalId: string;
    status: string;
  }>,
) => ({
  byLinkKind: countBy(rows.map((row) => row.linkKind)),
  byProduct: countBy(rows.map((row) => row.productExternalId)),
  byStatus: countByStatus(rows.map((row) => row.status)),
  count: rows.length,
});

const summarizeTelegramBindingRows = (
  rows: Array<{ productExternalId: string; status: string }>,
) => ({
  byProduct: countBy(rows.map((row) => row.productExternalId)),
  byStatus: countByStatus(rows.map((row) => row.status)),
  count: rows.length,
});

const buildDifferenceAnalysis = ({
  database,
  sheets,
}: {
  database: DatabaseReconciliationSnapshot;
  sheets: SheetsReconciliationSnapshot;
}) => {
  const databaseOnlyPayments = getRowsOnlyInLeft({
    getLeftKey: (row: DatabaseReconciliationSnapshot["purchases"][number]) => row.key,
    getRightKey: (row: PaymentSheetRecord) => row.payment_intent_id,
    leftRows: database.purchases,
    rightRows: sheets.payments,
  });
  const sheetOnlyPayments = getRowsOnlyInLeft({
    getLeftKey: (row: PaymentSheetRecord) => row.payment_intent_id,
    getRightKey: (row: DatabaseReconciliationSnapshot["purchases"][number]) => row.key,
    leftRows: sheets.payments,
    rightRows: database.purchases,
  });
  const duplicateSheetPayments = getDuplicatePaymentOccurrences(sheets.payments);
  const sheetPaymentsWithoutKey = sheets.payments.filter(
    (row) => !trim(row.payment_intent_id),
  );
  const succeededPurchases = database.purchases.filter(
    (row) => normalizeStatus(row.outcome) === "succeeded",
  );
  const databaseOnlySuccessfulCustomers = getRowsOnlyInLeft({
    getLeftKey: (row: DatabaseReconciliationSnapshot["purchases"][number]) => row.key,
    getRightKey: (row: SuccessfulCustomersSheetRecord) => row.payment_intent_id,
    leftRows: succeededPurchases,
    rightRows: sheets.successfulCustomers,
  });
  const sheetOnlySuccessfulCustomers = getRowsOnlyInLeft({
    getLeftKey: (row: SuccessfulCustomersSheetRecord) => row.payment_intent_id,
    getRightKey: (row: DatabaseReconciliationSnapshot["purchases"][number]) => row.key,
    leftRows: sheets.successfulCustomers,
    rightRows: succeededPurchases,
  });
  const duplicateSheetSuccessfulCustomers = getDuplicateOccurrences(
    sheets.successfulCustomers,
    (row) => row.payment_intent_id,
  );
  const databaseOnlyStripeEvents = getRowsOnlyInLeft({
    getLeftKey: (row: DatabaseReconciliationSnapshot["stripeEvents"][number]) => row.key,
    getRightKey: (row: StripeEventSheetRecord) => row.event_id,
    leftRows: database.stripeEvents,
    rightRows: sheets.stripeEvents,
  });
  const sheetOnlyStripeEvents = getRowsOnlyInLeft({
    getLeftKey: (row: StripeEventSheetRecord) => row.event_id,
    getRightKey: (row: DatabaseReconciliationSnapshot["stripeEvents"][number]) => row.key,
    leftRows: sheets.stripeEvents,
    rightRows: database.stripeEvents,
  });
  const duplicateSheetStripeEvents = getDuplicateOccurrences(
    sheets.stripeEvents,
    (row) => row.event_id,
  );
  const databaseOnlyTelegramTokens = getRowsOnlyInLeft({
    getLeftKey: (row: DatabaseReconciliationSnapshot["telegramAccessTokens"][number]) =>
      row.key,
    getRightKey: (row: TelegramAccessTokenSheetRecord) => row.token_id,
    leftRows: database.telegramAccessTokens,
    rightRows: sheets.telegramAccessTokens,
  });
  const sheetOnlyTelegramTokens = getRowsOnlyInLeft({
    getLeftKey: (row: TelegramAccessTokenSheetRecord) => row.token_id,
    getRightKey: (row: DatabaseReconciliationSnapshot["telegramAccessTokens"][number]) =>
      row.key,
    leftRows: sheets.telegramAccessTokens,
    rightRows: database.telegramAccessTokens,
  });
  const duplicateSheetTelegramTokens = getDuplicateOccurrences(
    sheets.telegramAccessTokens,
    (row) => row.token_id,
  );
  const databaseOnlyTelegramBindings = getRowsOnlyInLeft({
    getLeftKey: (row: DatabaseReconciliationSnapshot["telegramUserBindings"][number]) =>
      row.key,
    getRightKey: (row: TelegramUserBindingSheetRecord) =>
      getBindingKey(row.payment_intent_id, row.chat_id),
    leftRows: database.telegramUserBindings,
    rightRows: sheets.telegramUserBindings,
  });
  const sheetOnlyTelegramBindings = getRowsOnlyInLeft({
    getLeftKey: (row: TelegramUserBindingSheetRecord) =>
      getBindingKey(row.payment_intent_id, row.chat_id),
    getRightKey: (row: DatabaseReconciliationSnapshot["telegramUserBindings"][number]) =>
      row.key,
    leftRows: sheets.telegramUserBindings,
    rightRows: database.telegramUserBindings,
  });
  const duplicateSheetTelegramBindings = getDuplicateOccurrences(
    sheets.telegramUserBindings,
    (row) => getBindingKey(row.payment_intent_id, row.chat_id),
  );

  return {
    payments: {
      databaseOnly: summarizePaymentRows(
        databaseOnlyPayments.map((row) => ({
          amount: row.amountMinor,
          currency: row.currency,
          outcome: row.outcome,
          timestamp: row.succeededAt ?? row.firstSeenAt,
        })),
      ),
      duplicateSheetOccurrences: summarizePaymentRows(
        duplicateSheetPayments.map((row) => ({
          amount: row.amount,
          currency: row.checkout_currency || row.currency,
          outcome: row.outcome,
          timestamp:
            row.successful_customer_logged_at || row.first_seen_at || row.updated_at,
        })),
      ),
      matchedDataDifferences: buildMatchedPaymentDataAnalysis({
        databasePurchases: database.purchases,
        sheetPayments: sheets.payments,
      }),
      sheetRowsWithoutKey: summarizePaymentRows(
        sheetPaymentsWithoutKey.map((row) => ({
          amount: row.amount,
          currency: row.checkout_currency || row.currency,
          outcome: row.outcome,
          timestamp:
            row.successful_customer_logged_at || row.first_seen_at || row.updated_at,
        })),
      ),
      sheetOnly: summarizePaymentRows(
        sheetOnlyPayments.map((row) => ({
          amount: row.amount,
          currency: row.checkout_currency || row.currency,
          outcome: row.outcome,
          timestamp:
            row.successful_customer_logged_at || row.first_seen_at || row.updated_at,
        })),
      ),
    },
    stripeEvents: {
      databaseOnly: summarizeStripeEventRows(databaseOnlyStripeEvents),
      duplicateSheetOccurrences: summarizeStripeEventRows(
        duplicateSheetStripeEvents.map((row) => ({
          eventType: row.event_type,
          source: "legacy-sheet",
          status: row.status,
        })),
      ),
      sheetOnly: summarizeStripeEventRows(
        sheetOnlyStripeEvents.map((row) => ({
          eventType: row.event_type,
          source: "legacy-sheet",
          status: row.status,
        })),
      ),
    },
    successfulCustomers: {
      databaseOnly: summarizeSuccessfulCustomerRows(databaseOnlySuccessfulCustomers),
      duplicateSheetOccurrences: summarizeSuccessfulCustomerRows(
        duplicateSheetSuccessfulCustomers.map((row) => ({
          productExternalId: row.product_id,
        })),
      ),
      sheetOnly: summarizeSheetOnlySuccessfulCustomerRows({
        databasePurchases: database.purchases,
        rows: sheetOnlySuccessfulCustomers,
      }),
    },
    telegramAccessTokens: {
      databaseOnly: summarizeTelegramTokenRows(databaseOnlyTelegramTokens),
      duplicateSheetOccurrences: summarizeTelegramTokenRows(
        duplicateSheetTelegramTokens.map((row) => ({
          linkKind: row.link_kind,
          productExternalId: row.product_id,
          status: row.status,
        })),
      ),
      sheetOnly: summarizeTelegramTokenRows(
        sheetOnlyTelegramTokens.map((row) => ({
          linkKind: row.link_kind,
          productExternalId: row.product_id,
          status: row.status,
        })),
      ),
    },
    telegramUserBindings: {
      databaseOnly: summarizeTelegramBindingRows(databaseOnlyTelegramBindings),
      duplicateSheetOccurrences: summarizeTelegramBindingRows(
        duplicateSheetTelegramBindings.map((row) => ({
          productExternalId: row.product_id,
          status: row.status,
        })),
      ),
      sheetOnly: summarizeTelegramBindingRows(
        sheetOnlyTelegramBindings.map((row) => ({
          productExternalId: row.product_id,
          status: row.status,
        })),
      ),
    },
  };
};

const getBindingKey = (paymentIntentId: string, chatId: string) =>
  `${trim(paymentIntentId)}::${trim(chatId)}`;

const getLegacySideEffectRows = (payments: PaymentSheetRecord[]) =>
  payments.flatMap((payment) =>
    [
      {
        key: `${trim(payment.payment_intent_id)}::purchase_success_email`,
        status: payment.email_delivery_status,
      },
      {
        key: `${trim(payment.payment_intent_id)}::admin_telegram_alert`,
        status: payment.with_mentor_alert_status,
      },
      {
        key: `${trim(payment.payment_intent_id)}::successful_customer_export`,
        status: payment.successful_customer_log_status,
      },
    ].filter((row) => trim(row.status)),
  );

const getSheetEntitlementRows = (payments: PaymentSheetRecord[]) =>
  payments
    .filter(
      (payment) =>
        trim(payment.telegram_access_status) ||
        trim(payment.access_workflow) ||
        trim(payment.delivery_channel),
    )
    .map((payment) => ({
      ...payment,
      key: `${trim(payment.payment_intent_id)}::primary`,
    }));

const buildCatalogReferenceComparison = ({
  catalog,
  payments,
  sampleLimit,
}: {
  catalog: DatabaseReconciliationSnapshot["catalog"];
  payments: PaymentSheetRecord[];
  sampleLimit: number;
}) => {
  const productIds = new Set(
    catalog.products.map((product) => product.externalProductId),
  );
  const offerProductById = new Map(
    catalog.offers.map((offer) => [offer.externalOfferId, offer.productExternalId]),
  );
  const differencesByField = new Map<string, number>();
  const differenceKeys = new Set<string>();
  let comparedCount = 0;

  const recordDifference = (field: string, key: string) => {
    differenceKeys.add(key);
    differencesByField.set(field, (differencesByField.get(field) ?? 0) + 1);
  };

  for (const payment of payments) {
    const key = trim(payment.payment_intent_id);
    const productExternalId = trim(payment.product_id);
    const offerExternalId = trim(payment.offer_id);

    if (!key || (!productExternalId && !offerExternalId)) {
      continue;
    }

    comparedCount += 1;

    if (productExternalId && !productIds.has(productExternalId)) {
      recordDifference("unknownProduct", key);
    }

    if (offerExternalId && !offerProductById.has(offerExternalId)) {
      recordDifference("unknownOffer", key);
    }

    if (
      productExternalId &&
      offerExternalId &&
      offerProductById.has(offerExternalId) &&
      offerProductById.get(offerExternalId) !== productExternalId
    ) {
      recordDifference("offerProductOwnership", key);
    }
  }

  const sortedDifferenceKeys = [...differenceKeys].sort();

  return {
    comparedCount,
    differenceCount: sortedDifferenceKeys.length,
    differenceKeyHashes: sortedDifferenceKeys
      .slice(0, sampleLimit)
      .map((key) => hashIdentifier("catalog-reference", key))
      .sort(),
    differencesByField: Object.fromEntries(
      [...differencesByField.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    status: sortedDifferenceKeys.length === 0 ? ("ok" as const) : ("mismatch" as const),
  };
};

const buildRowComparisons = ({
  database,
  sampleLimit,
  sheets,
}: {
  database: DatabaseReconciliationSnapshot;
  sampleLimit: number;
  sheets: SheetsReconciliationSnapshot;
}) => {
  const payments = getCanonicalPaymentRows(sheets.payments);
  const succeededPurchases = database.purchases.filter(
    (purchase) => normalizeStatus(purchase.outcome) === "succeeded",
  );
  const invoicePayments = payments.filter((payment) => trim(payment.invoice_number));
  const legacySideEffects = getLegacySideEffectRows(payments);
  const sheetEntitlements = getSheetEntitlementRows(payments);

  return {
    accessEntitlements: compareMatchedRows({
      databaseRows: database.entitlements.filter(
        (entitlement) => entitlement.accessKey === "primary",
      ),
      fields: [
        {
          databaseValue: (row) => normalizeStatusCategory(row.status),
          name: "status",
          sheetValue: (row) => normalizeStatusCategory(row.telegram_access_status),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.productExternalId),
          name: "productExternalId",
          sheetValue: (row) => normalizeComparableText(row.product_id),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.offerExternalId),
          name: "offerExternalId",
          sheetValue: (row) => normalizeComparableText(row.offer_id),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.deliveryChannel),
          name: "deliveryChannel",
          sheetValue: (row) => normalizeComparableText(row.delivery_channel),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.accessWorkflow),
          name: "accessWorkflow",
          sheetValue: (row) => normalizeComparableText(row.access_workflow),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.currentTokenId),
          name: "currentTokenId",
          sheetValue: (row) => normalizeComparableText(row.telegram_token_id),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.telegramChatId),
          name: "telegramChatId",
          sheetValue: (row) => normalizeComparableText(row.telegram_channel_chat_id),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.telegramUserId),
          name: "telegramUserId",
          sheetValue: (row) => normalizeComparableText(row.telegram_user_id),
        },
        {
          databaseValue: (row) => normalizeComparableDate(row.startsAt),
          name: "startsAt",
          sheetValue: (row) => normalizeComparableDate(row.telegram_token_used_at),
        },
        {
          databaseValue: (row) => normalizeComparableDate(row.expiresAt),
          name: "expiresAt",
          sheetValue: (row) => normalizeComparableDate(row.telegram_access_expires_at),
        },
        {
          databaseValue: (row) => normalizeComparableDate(row.revokedAt),
          name: "revokedAt",
          sheetValue: (row) => normalizeComparableDate(row.telegram_access_revoked_at),
        },
      ],
      getDatabaseKey: (row) => row.key,
      getSheetKey: (row) => row.key,
      namespace: "access-entitlement-state",
      sampleLimit,
      sheetRows: sheetEntitlements,
    }),
    catalogReferences: buildCatalogReferenceComparison({
      catalog: database.catalog,
      payments,
      sampleLimit,
    }),
    emailCampaignLeads: compareMatchedRows({
      databaseRows: database.emailCampaignLeads,
      fields: [
        {
          databaseValue: (row) => normalizeComparableText(row.campaignKey),
          name: "campaignKey",
          sheetValue: (row) => normalizeComparableText(row.campaign_key),
        },
        {
          databaseValue: (row) => normalizeStatusCategory(row.status),
          name: "status",
          sheetValue: (row) => normalizeStatusCategory(row.email_send_status),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.locale),
          name: "locale",
          sheetValue: (row) => normalizeComparableText(row.locale),
        },
        {
          databaseValue: (row) => normalizeComparableInteger(row.emailSendAttempts),
          name: "attempts",
          sheetValue: (row) => normalizeComparableInteger(row.email_send_attempts),
        },
      ],
      getDatabaseKey: (row) => row.key,
      getSheetKey: (row) => row.lead_id,
      namespace: "email-campaign-lead-state",
      sampleLimit,
      sheetRows: sheets.emailCampaignLeads,
    }),
    invoices: compareMatchedRows({
      databaseRows: database.invoices,
      fields: [
        {
          databaseValue: (row) => normalizeComparableText(row.paymentIntentId),
          name: "paymentIntentId",
          sheetValue: (row) => normalizeComparableText(row.payment_intent_id),
        },
        {
          databaseValue: (row) => normalizeComparableInteger(row.amountMinor),
          name: "amountMinor",
          sheetValue: (row) => normalizeComparableInteger(row.amount),
        },
        {
          databaseValue: (row) => normalizeComparableLower(row.currency),
          name: "currency",
          sheetValue: (row) =>
            normalizeComparableLower(row.checkout_currency || row.currency),
        },
        {
          databaseValue: (row) => normalizeComparableDate(row.issuedAt),
          name: "issuedAt",
          sheetValue: (row) => normalizeComparableDate(row.invoice_issued_at),
        },
      ],
      getDatabaseKey: (row) => row.key,
      getSheetKey: (row) => row.invoice_number,
      namespace: "invoice-state",
      sampleLimit,
      sheetRows: invoicePayments,
    }),
    monthlyReportRuns: compareMatchedRows({
      databaseRows: database.monthlyReportRuns,
      fields: [
        {
          databaseValue: (row) => normalizeComparableText(row.reportFamily),
          name: "reportFamily",
          sheetValue: (row) => normalizeComparableText(row.report_family),
        },
        {
          databaseValue: (row) => normalizeStatusCategory(row.status),
          name: "status",
          sheetValue: (row) => normalizeStatusCategory(row.delivery_status),
        },
        {
          databaseValue: (row) => normalizeComparableInteger(row.rowCount),
          name: "rowCount",
          sheetValue: (row) => normalizeComparableInteger(row.row_count),
        },
        {
          databaseValue: (row) => normalizeComparableLower(row.csvSha256),
          name: "csvSha256",
          sheetValue: (row) => normalizeComparableLower(row.csv_sha256),
        },
      ],
      getDatabaseKey: (row) => row.key,
      getSheetKey: (row) => row.report_key,
      namespace: "monthly-report-state",
      sampleLimit,
      sheetRows: sheets.monthlyReportRuns,
    }),
    paymentCustomerSnapshots: compareMatchedRows({
      databaseRows: database.purchases,
      fields: [
        {
          databaseValue: (row) => normalizeComparableLower(row.customerEmailSnapshot),
          name: "email",
          sheetValue: (row) => normalizeComparableLower(row.customer_email),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.customerFullNameSnapshot),
          name: "fullName",
          sheetValue: (row) => normalizeComparableText(row.customer_full_name),
        },
        {
          databaseValue: (row) =>
            normalizeComparableLower(row.customerTelegramUsernameSnapshot),
          name: "telegramUsername",
          sheetValue: (row) => normalizeComparableLower(row.customer_nickname),
        },
        {
          databaseValue: (row) => normalizeComparableLower(row.customerCountrySnapshot),
          name: "country",
          sheetValue: (row) => normalizeComparableLower(row.customer_country),
        },
        {
          databaseValue: (row) =>
            normalizeComparableText(row.customerAddressLineSnapshot),
          name: "addressLine",
          sheetValue: (row) => normalizeComparableText(row.customer_address),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.customerCitySnapshot),
          name: "city",
          sheetValue: (row) => normalizeComparableText(row.customer_city),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.customerPostalCodeSnapshot),
          name: "postalCode",
          sheetValue: (row) => normalizeComparableText(row.customer_postal_code),
        },
      ],
      getDatabaseKey: (row) => row.key,
      getSheetKey: (row) => row.payment_intent_id,
      namespace: "payment-customer-snapshot",
      sampleLimit,
      sheetRows: payments,
    }),
    payments: compareMatchedRows({
      databaseRows: database.purchases,
      fields: [
        {
          databaseValue: (row) => normalizeComparableInteger(row.amountMinor),
          name: "amountMinor",
          sheetValue: (row) => normalizeComparableInteger(row.amount),
        },
        {
          databaseValue: (row) => normalizeComparableLower(row.currency),
          name: "currency",
          sheetValue: (row) =>
            normalizeComparableLower(row.checkout_currency || row.currency),
        },
        {
          databaseValue: (row) => normalizeStatusCategory(row.outcome),
          name: "outcome",
          sheetValue: (row) => normalizeStatusCategory(row.outcome),
        },
        {
          databaseValue: (row) => normalizeStatus(row.stripeStatus),
          name: "stripeStatus",
          sheetValue: (row) => normalizeStatus(row.status),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.productExternalId),
          name: "productExternalId",
          sheetValue: (row) => normalizeComparableText(row.product_id),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.offerExternalId),
          name: "offerExternalId",
          sheetValue: (row) => normalizeComparableText(row.offer_id),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.productTitleSnapshot),
          name: "productTitle",
          sheetValue: (row) => normalizeComparableText(row.product_title),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.offerLabelSnapshot),
          name: "offerLabel",
          sheetValue: (row) => normalizeComparableText(row.offer_label),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.purchaseItemSnapshot),
          name: "purchaseItem",
          sheetValue: (row) => normalizeComparableText(row.purchase_item),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.lessonLanguage),
          name: "lessonLanguage",
          sheetValue: (row) => normalizeComparableText(row.lesson_language),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.latestEventId),
          name: "latestEventId",
          sheetValue: (row) => normalizeComparableText(row.latest_event_id),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.latestEventType),
          name: "latestEventType",
          sheetValue: (row) => normalizeComparableText(row.latest_event_type),
        },
      ],
      getDatabaseKey: (row) => row.key,
      getSheetKey: (row) => row.payment_intent_id,
      namespace: "payment-state",
      sampleLimit,
      sheetRows: payments,
    }),
    purchaseSideEffects: compareMatchedRows({
      databaseRows: database.purchaseSideEffects.filter((row) =>
        [
          "purchase_success_email",
          "admin_telegram_alert",
          "successful_customer_export",
        ].includes(row.kind),
      ),
      fields: [
        {
          databaseValue: (row) => normalizeStatusCategory(row.status),
          name: "status",
          sheetValue: (row) => normalizeStatusCategory(row.status),
        },
      ],
      getDatabaseKey: (row) => row.key,
      getSheetKey: (row) => row.key,
      namespace: "purchase-side-effect-state",
      sampleLimit,
      sheetRows: legacySideEffects,
    }),
    stripeEvents: compareMatchedRows({
      databaseRows: database.stripeEvents,
      fields: [
        {
          databaseValue: (row) => normalizeComparableText(row.eventType),
          name: "eventType",
          sheetValue: (row) => normalizeComparableText(row.event_type),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.paymentIntentId),
          name: "paymentIntentId",
          sheetValue: (row) => normalizeComparableText(row.payment_intent_id),
        },
        {
          databaseValue: (row) => normalizeStatus(row.status),
          name: "status",
          sheetValue: (row) => normalizeStatus(row.status),
        },
        {
          databaseValue: (row) => normalizeStatusCategory(row.outcome),
          name: "outcome",
          sheetValue: (row) => normalizeStatusCategory(row.outcome),
        },
      ],
      getDatabaseKey: (row) => row.key,
      getSheetKey: (row) => row.event_id,
      namespace: "stripe-event-state",
      sampleLimit,
      sheetRows: sheets.stripeEvents,
    }),
    successfulCustomerSnapshots: compareMatchedRows({
      databaseRows: succeededPurchases,
      fields: [
        {
          databaseValue: (row) => normalizeComparableLower(row.customerEmailSnapshot),
          name: "email",
          sheetValue: (row) => normalizeComparableLower(row.customer_email),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.customerFullNameSnapshot),
          name: "fullName",
          sheetValue: (row) => normalizeComparableText(row.customer_full_name),
        },
        {
          databaseValue: (row) =>
            normalizeComparableLower(row.customerTelegramUsernameSnapshot),
          name: "telegramUsername",
          sheetValue: (row) => normalizeComparableLower(row.customer_nickname),
        },
        {
          databaseValue: (row) =>
            normalizeComparableText(
              [
                row.customerAddressLineSnapshot,
                row.customerCitySnapshot,
                row.customerPostalCodeSnapshot,
              ]
                .map(normalizeComparableText)
                .filter(Boolean)
                .join(", "),
            ),
          name: "fullAddress",
          sheetValue: (row) => normalizeComparableText(row.customer_full_address),
        },
        {
          databaseValue: (row) => normalizeComparableLower(row.customerCountrySnapshot),
          name: "country",
          sheetValue: (row) => normalizeComparableLower(row.customer_country),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.purchaseItemSnapshot),
          name: "purchaseItem",
          sheetValue: (row) => normalizeComparableText(row.purchase_item),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.productExternalId),
          name: "productExternalId",
          sheetValue: (row) => normalizeComparableText(row.product_id),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.productTitleSnapshot),
          name: "productTitle",
          sheetValue: (row) => normalizeComparableText(row.product_title),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.offerExternalId),
          name: "offerExternalId",
          sheetValue: (row) => normalizeComparableText(row.offer_id),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.offerLabelSnapshot),
          name: "offerLabel",
          sheetValue: (row) => normalizeComparableText(row.offer_label),
        },
      ],
      getDatabaseKey: (row) => row.key,
      getSheetKey: (row) => row.payment_intent_id,
      namespace: "successful-customer-snapshot",
      sampleLimit,
      sheetRows: sheets.successfulCustomers,
    }),
    telegramAccessTokens: compareMatchedRows({
      databaseRows: database.telegramAccessTokens,
      fields: [
        {
          databaseValue: (row) => normalizeComparableText(row.paymentIntentId),
          name: "paymentIntentId",
          sheetValue: (row) => normalizeComparableText(row.payment_intent_id),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.productExternalId),
          name: "productExternalId",
          sheetValue: (row) => normalizeComparableText(row.product_id),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.offerExternalId),
          name: "offerExternalId",
          sheetValue: (row) => normalizeComparableText(row.offer_id),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.linkKind),
          name: "linkKind",
          sheetValue: (row) => normalizeComparableText(row.link_kind),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.chatId),
          name: "chatId",
          sheetValue: (row) => normalizeComparableText(row.chat_id),
        },
        {
          databaseValue: (row) => normalizeStatusCategory(row.status),
          name: "status",
          sheetValue: (row) => normalizeStatusCategory(row.status),
        },
        {
          databaseValue: (row) => normalizeComparableDate(row.accessExpiresAt),
          name: "accessExpiresAt",
          sheetValue: (row) => normalizeComparableDate(row.access_expires_at),
        },
        {
          databaseValue: (row) => normalizeComparableDate(row.expiresAt),
          name: "expiresAt",
          sheetValue: (row) => normalizeComparableDate(row.expires_at),
        },
        {
          databaseValue: (row) => normalizeComparableDate(row.usedAt),
          name: "usedAt",
          sheetValue: (row) => normalizeComparableDate(row.used_at),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.telegramUserId),
          name: "telegramUserId",
          sheetValue: (row) => normalizeComparableText(row.telegram_user_id),
        },
      ],
      getDatabaseKey: (row) => row.key,
      getSheetKey: (row) => row.token_id,
      namespace: "telegram-access-token-state",
      sampleLimit,
      sheetRows: sheets.telegramAccessTokens,
    }),
    telegramUserBindings: compareMatchedRows({
      databaseRows: database.telegramUserBindings,
      fields: [
        {
          databaseValue: (row) => normalizeComparableText(row.productExternalId),
          name: "productExternalId",
          sheetValue: (row) => normalizeComparableText(row.product_id),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.offerExternalId),
          name: "offerExternalId",
          sheetValue: (row) => normalizeComparableText(row.offer_id),
        },
        {
          databaseValue: (row) => normalizeStatusCategory(row.status),
          name: "status",
          sheetValue: (row) => normalizeStatusCategory(row.status),
        },
        {
          databaseValue: (row) => normalizeComparableText(row.telegramUserId),
          name: "telegramUserId",
          sheetValue: (row) => normalizeComparableText(row.telegram_user_id),
        },
        {
          databaseValue: (row) => normalizeComparableDate(row.boundAt),
          name: "boundAt",
          sheetValue: (row) => normalizeComparableDate(row.bound_at),
        },
        {
          databaseValue: (row) => normalizeComparableDate(row.accessExpiresAt),
          name: "accessExpiresAt",
          sheetValue: (row) => normalizeComparableDate(row.access_expires_at),
        },
        {
          databaseValue: (row) => normalizeComparableDate(row.revokedAt),
          name: "revokedAt",
          sheetValue: (row) => normalizeComparableDate(row.revoked_at),
        },
      ],
      getDatabaseKey: (row) => row.key,
      getSheetKey: (row) => getBindingKey(row.payment_intent_id, row.chat_id),
      namespace: "telegram-user-binding-state",
      sampleLimit,
      sheetRows: sheets.telegramUserBindings,
    }),
  };
};

const buildComparisons = ({
  database,
  sampleLimit,
  sheets,
}: {
  database: DatabaseReconciliationSnapshot;
  sampleLimit: number;
  sheets: SheetsReconciliationSnapshot;
}) => ({
  emailCampaignLeads: compareKeys({
    databaseKeys: database.emailCampaignLeads.map((row) => row.key),
    namespace: "email-campaign-lead",
    sampleLimit,
    sheetKeys: sheets.emailCampaignLeads.map((row) => row.lead_id),
  }),
  invoices: compareKeys({
    databaseKeys: database.invoices.map((row) => row.key),
    namespace: "invoice",
    sampleLimit,
    sheetKeys: sheets.payments.map((row) => row.invoice_number),
  }),
  monthlyReportRuns: compareKeys({
    databaseKeys: database.monthlyReportRuns.map((row) => row.key),
    namespace: "monthly-report",
    sampleLimit,
    sheetKeys: sheets.monthlyReportRuns.map((row) => row.report_key),
  }),
  payments: compareKeys({
    databaseKeys: database.purchases.map((row) => row.key),
    namespace: "payment",
    sampleLimit,
    sheetKeys: sheets.payments.map((row) => row.payment_intent_id),
  }),
  stripeEvents: compareKeys({
    databaseKeys: database.stripeEvents.map((row) => row.key),
    namespace: "stripe-event",
    sampleLimit,
    sheetKeys: sheets.stripeEvents.map((row) => row.event_id),
  }),
  successfulCustomers: compareKeys({
    databaseKeys: database.purchases
      .filter((row) => normalizeStatus(row.outcome) === "succeeded")
      .map((row) => row.key),
    namespace: "successful-customer",
    sampleLimit,
    sheetKeys: sheets.successfulCustomers.map((row) => row.payment_intent_id),
  }),
  telegramAccessTokens: compareKeys({
    databaseKeys: database.telegramAccessTokens.map((row) => row.key),
    namespace: "telegram-access-token",
    sampleLimit,
    sheetKeys: sheets.telegramAccessTokens.map((row) => row.token_id),
  }),
  telegramUserBindings: compareKeys({
    databaseKeys: database.telegramUserBindings.map((row) => row.key),
    namespace: "telegram-user-binding",
    sampleLimit,
    sheetKeys: sheets.telegramUserBindings.map((row) =>
      getBindingKey(row.payment_intent_id, row.chat_id),
    ),
  }),
});

const buildStateSummary = ({
  database,
  sheets,
}: {
  database: DatabaseReconciliationSnapshot;
  sheets: SheetsReconciliationSnapshot;
}) => ({
  database: {
    customerCount: database.customerCount,
    emailCampaignLeads: {
      byCampaign: countBy(database.emailCampaignLeads.map((row) => row.campaignKey)),
      byStatus: countByStatus(database.emailCampaignLeads.map((row) => row.status)),
    },
    entitlements: {
      byAccessKey: countBy(database.entitlements.map((row) => row.accessKey)),
      byStatus: countByStatus(database.entitlements.map((row) => row.status)),
    },
    monthlyReportRuns: countByStatus(database.monthlyReportRuns.map((row) => row.status)),
    onlineGroupCampaigns: countByStatus(
      database.onlineGroupCampaigns.map((row) => row.status),
    ),
    purchaseSideEffects: {
      byKind: countBy(database.purchaseSideEffects.map((row) => row.kind)),
      byStatus: countByStatus(database.purchaseSideEffects.map((row) => row.status)),
    },
    renewalCampaigns: countByStatus(database.renewalCampaigns.map((row) => row.status)),
    renewalVerifications: countByStatus(
      database.renewalVerifications.map((row) => row.status),
    ),
    stripeEvents: {
      byEventType: countBy(database.stripeEvents.map((row) => row.eventType)),
      bySource: countBySource(database.stripeEvents.map((row) => row.source)),
      byStatus: countByStatus(database.stripeEvents.map((row) => row.status)),
    },
    telegramAccessTokens: countByStatus(
      database.telegramAccessTokens.map((row) => row.status),
    ),
    telegramUserBindings: countByStatus(
      database.telegramUserBindings.map((row) => row.status),
    ),
  },
  sheet: {
    emailCampaignLeads: {
      byCampaign: countBy(sheets.emailCampaignLeads.map((row) => row.campaign_key)),
      byStatus: countByStatus(
        sheets.emailCampaignLeads.map((row) => row.email_send_status),
      ),
    },
    monthlyReportRuns: countByStatus(
      sheets.monthlyReportRuns.map((row) => row.delivery_status),
    ),
    paymentAccess: countByStatus(
      sheets.payments.map((row) => row.telegram_access_status),
    ),
    paymentEmailDelivery: countByStatus(
      sheets.payments.map((row) => row.email_delivery_status),
    ),
    paymentMentorAlerts: countByStatus(
      sheets.payments.map((row) => row.with_mentor_alert_status),
    ),
    paymentSuccessfulCustomerExport: countByStatus(
      sheets.payments.map((row) => row.successful_customer_log_status),
    ),
    stripeEvents: {
      byEventType: countBy(sheets.stripeEvents.map((row) => row.event_type)),
      byStatus: countByStatus(sheets.stripeEvents.map((row) => row.status)),
    },
    telegramAccessTokens: countByStatus(
      sheets.telegramAccessTokens.map((row) => row.status),
    ),
    telegramUserBindings: countByStatus(
      sheets.telegramUserBindings.map((row) => row.status),
    ),
  },
});

const buildCatalog = (catalog: DatabaseReconciliationSnapshot["catalog"]) => ({
  offers: [...catalog.offers].sort((left, right) =>
    left.externalOfferId.localeCompare(right.externalOfferId),
  ),
  prices: [...catalog.prices].sort((left, right) => {
    const offerOrder = left.externalOfferId.localeCompare(right.externalOfferId);

    return offerOrder || left.currency.localeCompare(right.currency);
  }),
  products: [...catalog.products].sort((left, right) =>
    left.externalProductId.localeCompare(right.externalProductId),
  ),
});

export const buildReconciliationBaseline = ({
  database,
  options,
  sheets,
}: {
  database: DatabaseReconciliationSnapshot;
  options: ReconciliationBaselineOptions;
  sheets: SheetsReconciliationSnapshot;
}) => {
  const sampleLimit =
    Number.isSafeInteger(options.sampleLimit) && (options.sampleLimit ?? 0) > 0
      ? (options.sampleLimit ?? DEFAULT_SAMPLE_LIMIT)
      : DEFAULT_SAMPLE_LIMIT;
  const comparisons = buildComparisons({
    database,
    sampleLimit,
    sheets,
  });
  const finance = buildFinanceComparison({
    database: getDatabasePaymentTotals(database.purchases),
    sheets: getSheetPaymentTotals(sheets.payments),
  });
  const rowComparisons = buildRowComparisons({
    database,
    sampleLimit,
    sheets,
  });
  const body = {
    catalog: buildCatalog(database.catalog),
    comparisons,
    differenceAnalysis: buildDifferenceAnalysis({ database, sheets }),
    finance,
    rowComparisons,
    state: buildStateSummary({
      database,
      sheets,
    }),
  };
  const hasKeyMismatch = Object.values(comparisons).some(
    (comparison: KeyComparison) => comparison.status !== "ok",
  );
  const hasRowMismatch = Object.values(rowComparisons).some(
    (comparison) => comparison.status !== "ok",
  );
  const status =
    !hasKeyMismatch &&
    !hasRowMismatch &&
    finance.matchesByCurrency &&
    finance.matchesByCurrencyMonth
      ? ("ok" as const)
      : ("mismatch" as const);

  return {
    metadata: {
      captureWindow: {
        completedAt: options.captureCompletedAt ?? options.capturedAt,
        startedAt: options.captureStartedAt ?? options.capturedAt,
      },
      capturedAt: options.capturedAt,
      databaseEnvironment: options.databaseEnvironment,
      databaseVariableName: options.databaseVariableName,
      piiIncluded: false,
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
      secretsIncluded: false,
      sheetReadMode: "values-only-no-schema-sync",
    },
    ...body,
    reportFingerprintSha256: hash(JSON.stringify(body)),
    status,
  };
};
