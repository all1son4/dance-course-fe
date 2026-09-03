import { and, eq, isNotNull, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  listEmailCampaignLeadRecords,
  listMonthlySalesReportRunRecords,
  listPaymentRecords,
  listStripeEventRecords,
  listTelegramAccessTokenRecords,
  listTelegramUserBindingRecords,
  type PaymentSheetRecord,
} from "@/lib/google-sheets";

import { getDatabaseEnvSelection, getRequiredDatabaseUrlFromEnv } from "./env";
import {
  createEmptyGoogleSheetsBackfillStats,
  DEFAULT_GOOGLE_SHEETS_BACKFILL_BATCH_SIZE,
  getGoogleSheetsBackfillDuplicateIndexes,
  getGoogleSheetsBackfillPlan,
  getGoogleSheetsBackfillRecordKey,
  getNextGoogleSheetsBackfillBatch,
  GOOGLE_SHEETS_BACKFILL_KEY,
  GOOGLE_SHEETS_BACKFILL_STAGES,
  type GoogleSheetsBackfillBatch,
  type GoogleSheetsBackfillOperationCounts,
  type GoogleSheetsBackfillRecords,
  type GoogleSheetsBackfillStage,
  type GoogleSheetsBackfillStats,
  type GoogleSheetsBackfillTarget,
  loadGoogleSheetsBackfillSource,
  MAX_GOOGLE_SHEETS_BACKFILL_BATCH_SIZE,
} from "./google-sheets-backfill-source";
import { loadDatabaseEnvConfig } from "./load-env";
import {
  accessEntitlements,
  customers,
  dataBackfillRuns,
  emailCampaignLeads,
  invoices,
  monthlyReportRuns,
  productOffers,
  products,
  purchases,
  purchaseSideEffects,
  stripeEvents,
  telegramAccessTokens,
  telegramUserBindings,
} from "./schema";

type BackfillWriteStats = {
  accessEntitlements: number;
  customers: number;
  emailCampaignLeads: number;
  invoices: number;
  monthlyReportRuns: number;
  purchaseSideEffects: number;
  purchases: number;
  skippedInvoices: number;
  skippedStripeEvents: number;
  skippedTelegramAccessTokens: number;
  skippedTelegramUserBindings: number;
  stripeEvents: number;
  telegramAccessTokens: number;
  telegramUserBindings: number;
};

type ProductLookup = {
  byExternalId: Map<string, string>;
};

type OfferLookup = {
  byExternalId: Map<string, { id: string; productId: string }>;
};

const EMPTY_WRITE_STATS: BackfillWriteStats = {
  accessEntitlements: 0,
  customers: 0,
  emailCampaignLeads: 0,
  invoices: 0,
  monthlyReportRuns: 0,
  purchaseSideEffects: 0,
  purchases: 0,
  skippedInvoices: 0,
  skippedStripeEvents: 0,
  skippedTelegramAccessTokens: 0,
  skippedTelegramUserBindings: 0,
  stripeEvents: 0,
  telegramAccessTokens: 0,
  telegramUserBindings: 0,
};

const trim = (value: string | null | undefined) => value?.trim() ?? "";
const nullIfEmpty = (value: string | null | undefined) => trim(value) || null;
const normalizeEmail = (value: string) => trim(value).toLowerCase();

const parseInteger = (value: string | null | undefined, fallback = 0) => {
  const parsedValue = Number.parseInt(trim(value), 10);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const parseDate = (value: string | null | undefined) => {
  const timestamp = Date.parse(trim(value));

  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
};

const parseRequiredDate = (
  value: string | null | undefined,
  fallback: Date = new Date(),
) => parseDate(value) ?? fallback;

const normalizeOutcome = (
  value: string,
): "succeeded" | "processing" | "requires_action" | "failed" | "canceled" => {
  const normalizedValue = trim(value);

  if (
    normalizedValue === "succeeded" ||
    normalizedValue === "processing" ||
    normalizedValue === "requires_action" ||
    normalizedValue === "failed" ||
    normalizedValue === "canceled"
  ) {
    return normalizedValue;
  }

  return "requires_action";
};

const normalizeCheckoutLocale = (value: string): "ru" | "en" | "pl" | null => {
  const normalizedValue = trim(value).toLowerCase();

  if (normalizedValue === "ru" || normalizedValue === "en" || normalizedValue === "pl") {
    return normalizedValue;
  }

  return null;
};

const normalizeLessonLanguage = (value: string): "ru" | "en" | null => {
  const normalizedValue = trim(value).toLowerCase();

  if (normalizedValue === "ru" || normalizedValue === "en") {
    return normalizedValue;
  }

  return null;
};

const normalizeAccessStatus = (
  value: string,
  paymentRecord: PaymentSheetRecord,
):
  | "pending"
  | "not_required"
  | "token_issued"
  | "activated"
  | "expired"
  | "revoked"
  | "left_channel"
  | "link_failed"
  | "manual_pending"
  | "manual_done" => {
  const normalizedValue = trim(value);

  if (
    normalizedValue === "pending" ||
    normalizedValue === "not_required" ||
    normalizedValue === "token_issued" ||
    normalizedValue === "activated" ||
    normalizedValue === "expired" ||
    normalizedValue === "revoked" ||
    normalizedValue === "left_channel" ||
    normalizedValue === "link_failed" ||
    normalizedValue === "manual_pending" ||
    normalizedValue === "manual_done"
  ) {
    return normalizedValue;
  }

  if (paymentRecord.delivery_channel.trim() === "manual") {
    return "manual_pending";
  }

  if (!paymentRecord.delivery_channel.trim() && !paymentRecord.access_workflow.trim()) {
    return "not_required";
  }

  return "pending";
};

const normalizeSideEffectStatus = (
  value: string,
): "pending" | "sending" | "sent" | "skipped" | "failed" | null => {
  const normalizedValue = trim(value);

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.startsWith("sending:")) {
    return "sending";
  }

  if (
    normalizedValue === "pending" ||
    normalizedValue === "sent" ||
    normalizedValue === "skipped" ||
    normalizedValue === "failed"
  ) {
    return normalizedValue;
  }

  return "pending";
};

const normalizeTokenStatus = (
  value: string,
): "issued" | "used" | "expired" | "revoked" => {
  const normalizedValue = trim(value);

  if (
    normalizedValue === "issued" ||
    normalizedValue === "used" ||
    normalizedValue === "expired" ||
    normalizedValue === "revoked"
  ) {
    return normalizedValue;
  }

  return "issued";
};

const normalizeBindingStatus = (value: string): "active" | "left" | "revoked" => {
  const normalizedValue = trim(value);

  if (
    normalizedValue === "active" ||
    normalizedValue === "left" ||
    normalizedValue === "revoked"
  ) {
    return normalizedValue;
  }

  return "active";
};

const normalizeDeliveryStatus = (value: string): "sent" | "skipped" | "failed" => {
  const normalizedValue = trim(value);

  if (
    normalizedValue === "sent" ||
    normalizedValue === "skipped" ||
    normalizedValue === "failed"
  ) {
    return normalizedValue;
  }

  return "skipped";
};

const normalizeEmailSendStatus = (
  value: string,
): "blocked" | "excluded" | "failed" | "pending" | "sent" => {
  const normalizedValue = trim(value);

  if (
    normalizedValue === "blocked" ||
    normalizedValue === "excluded" ||
    normalizedValue === "pending" ||
    normalizedValue === "sent" ||
    normalizedValue === "failed"
  ) {
    return normalizedValue;
  }

  return "pending";
};

const getSaleTimestamp = () => null;

const getPurchaseSource = (paymentIntentId: string) =>
  paymentIntentId.startsWith("adm_offer_pi_") ? "admin_offer_link" : "stripe";

const parseInvoiceNumber = (invoiceNumber: string) => {
  const match = /^FV\/(\d{4})\/(\d{2})\/(\d+)$/u.exec(invoiceNumber.trim());

  if (!match) {
    return null;
  }

  return {
    sequenceMonth: Number.parseInt(match[2], 10),
    sequenceNumber: Number.parseInt(match[3], 10),
    sequenceYear: Number.parseInt(match[1], 10),
  };
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

const loadLiveSheetRecords = async () => {
  const [
    paymentRecords,
    stripeEventRecords,
    telegramTokenRecords,
    telegramBindingRecords,
    monthlyReportRecords,
    emailLeadRecords,
  ] = await Promise.all([
    listPaymentRecords({ cacheTtlMs: 0, source: "sheets" }),
    listStripeEventRecords({ cacheTtlMs: 0, source: "sheets" }),
    listTelegramAccessTokenRecords({ cacheTtlMs: 0, source: "sheets" }),
    listTelegramUserBindingRecords({ cacheTtlMs: 0, source: "sheets" }),
    listMonthlySalesReportRunRecords({ cacheTtlMs: 0, source: "sheets" }),
    listEmailCampaignLeadRecords({ cacheTtlMs: 0, source: "sheets" }),
  ]);

  return {
    emailLeadRecords,
    monthlyReportRecords,
    paymentRecords,
    stripeEventRecords,
    telegramBindingRecords,
    telegramTokenRecords,
  };
};

const getProductLookup = async (
  db: ReturnType<typeof drizzle>,
): Promise<ProductLookup> => {
  const productRows = await db
    .select({
      externalProductId: products.externalProductId,
      id: products.id,
    })
    .from(products);

  return {
    byExternalId: new Map(productRows.map((row) => [row.externalProductId, row.id])),
  };
};

const getOfferLookup = async (db: ReturnType<typeof drizzle>): Promise<OfferLookup> => {
  const offerRows = await db
    .select({
      externalOfferId: productOffers.externalOfferId,
      id: productOffers.id,
      productId: productOffers.productId,
    })
    .from(productOffers);

  return {
    byExternalId: new Map(
      offerRows.map((row) => [
        row.externalOfferId,
        {
          id: row.id,
          productId: row.productId,
        },
      ]),
    ),
  };
};

const getExistingCustomerLookup = async (db: ReturnType<typeof drizzle>) => {
  const rows = await db
    .select({
      id: customers.id,
      normalizedEmail: customers.normalizedEmail,
    })
    .from(customers)
    .where(isNotNull(customers.normalizedEmail));

  return new Map(
    rows
      .map((row) => [row.normalizedEmail?.trim().toLowerCase() ?? "", row.id] as const)
      .filter(([normalizedEmail]) => Boolean(normalizedEmail)),
  );
};

type ExistingBackfillLookups = {
  entitlementIdByPaymentIntentId: Map<string, string>;
  keys: Record<GoogleSheetsBackfillStage, Set<string>>;
  purchaseIdByPaymentIntentId: Map<string, string>;
  updatedAtByKey: Record<GoogleSheetsBackfillStage, Map<string, Date>>;
};

const getExistingBackfillLookups = async (
  db: ReturnType<typeof drizzle>,
): Promise<ExistingBackfillLookups> => {
  const [
    purchaseRows,
    entitlementRows,
    stripeEventRows,
    tokenRows,
    bindingRows,
    reportRows,
    leadRows,
  ] = await Promise.all([
    db
      .select({
        id: purchases.id,
        paymentIntentId: purchases.paymentIntentId,
        updatedAt: purchases.updatedAt,
      })
      .from(purchases),
    db
      .select({
        id: accessEntitlements.id,
        purchaseId: accessEntitlements.purchaseId,
      })
      .from(accessEntitlements)
      .where(eq(accessEntitlements.accessKey, "primary")),
    db
      .select({
        stripeEventId: stripeEvents.stripeEventId,
        updatedAt: stripeEvents.updatedAt,
      })
      .from(stripeEvents),
    db
      .select({
        tokenId: telegramAccessTokens.tokenId,
        updatedAt: telegramAccessTokens.updatedAt,
      })
      .from(telegramAccessTokens),
    db
      .select({
        chatId: telegramUserBindings.chatId,
        purchaseId: telegramUserBindings.purchaseId,
        updatedAt: telegramUserBindings.updatedAt,
      })
      .from(telegramUserBindings),
    db
      .select({
        reportKey: monthlyReportRuns.reportKey,
        updatedAt: monthlyReportRuns.updatedAt,
      })
      .from(monthlyReportRuns),
    db
      .select({
        leadId: emailCampaignLeads.leadId,
        updatedAt: emailCampaignLeads.updatedAt,
      })
      .from(emailCampaignLeads),
  ]);
  const purchaseIdByPaymentIntentId = new Map(
    purchaseRows.map((row) => [row.paymentIntentId, row.id] as const),
  );
  const paymentIntentIdByPurchaseId = new Map(
    purchaseRows.map((row) => [row.id, row.paymentIntentId] as const),
  );
  const entitlementIdByPaymentIntentId = new Map<string, string>();

  for (const entitlement of entitlementRows) {
    const paymentIntentId = paymentIntentIdByPurchaseId.get(entitlement.purchaseId);

    if (paymentIntentId) {
      entitlementIdByPaymentIntentId.set(paymentIntentId, entitlement.id);
    }
  }

  return {
    entitlementIdByPaymentIntentId,
    keys: {
      emailCampaignLeads: new Set(leadRows.map((row) => row.leadId)),
      monthlyReportRuns: new Set(reportRows.map((row) => row.reportKey)),
      payments: new Set(purchaseRows.map((row) => row.paymentIntentId)),
      stripeEvents: new Set(stripeEventRows.map((row) => row.stripeEventId)),
      telegramAccessTokens: new Set(tokenRows.map((row) => row.tokenId)),
      telegramUserBindings: new Set(
        bindingRows.flatMap((row) => {
          const paymentIntentId = paymentIntentIdByPurchaseId.get(row.purchaseId);

          return paymentIntentId ? [`${paymentIntentId}\u0000${row.chatId}`] : [];
        }),
      ),
    },
    purchaseIdByPaymentIntentId,
    updatedAtByKey: {
      emailCampaignLeads: new Map(
        leadRows.map((row) => [row.leadId, row.updatedAt] as const),
      ),
      monthlyReportRuns: new Map(
        reportRows.map((row) => [row.reportKey, row.updatedAt] as const),
      ),
      payments: new Map(
        purchaseRows.map((row) => [row.paymentIntentId, row.updatedAt] as const),
      ),
      stripeEvents: new Map(
        stripeEventRows.map((row) => [row.stripeEventId, row.updatedAt] as const),
      ),
      telegramAccessTokens: new Map(
        tokenRows.map((row) => [row.tokenId, row.updatedAt] as const),
      ),
      telegramUserBindings: new Map(
        bindingRows.flatMap((row) => {
          const paymentIntentId = paymentIntentIdByPurchaseId.get(row.purchaseId);

          return paymentIntentId
            ? ([[`${paymentIntentId}\u0000${row.chatId}`, row.updatedAt]] as const)
            : [];
        }),
      ),
    },
  };
};

const getPaymentSideEffects = (
  paymentRecord: PaymentSheetRecord,
  sourceCutOffAt: Date,
) => {
  const sideEffects: Array<{
    kind:
      "purchase_success_email" | "admin_telegram_alert" | "successful_customer_export";
    provider: "resend" | "telegram" | null;
    status: "pending" | "sending" | "sent" | "skipped" | "failed";
    updatedAt: Date;
  }> = [];
  const fallbackUpdatedAt = parseRequiredDate(
    paymentRecord.updated_at || paymentRecord.first_seen_at,
    sourceCutOffAt,
  );
  const emailStatus = normalizeSideEffectStatus(paymentRecord.email_delivery_status);
  const alertStatus = normalizeSideEffectStatus(paymentRecord.with_mentor_alert_status);
  const successfulCustomerExportStatus =
    normalizeSideEffectStatus(paymentRecord.successful_customer_log_status) ??
    (paymentRecord.successful_customer_logged_at.trim() ? "sent" : null);

  if (emailStatus) {
    sideEffects.push({
      kind: "purchase_success_email",
      provider: "resend",
      status: emailStatus,
      updatedAt: parseDate(paymentRecord.email_delivery_updated_at) ?? fallbackUpdatedAt,
    });
  }

  if (alertStatus) {
    sideEffects.push({
      kind: "admin_telegram_alert",
      provider: "telegram",
      status: alertStatus,
      updatedAt:
        parseDate(paymentRecord.with_mentor_alert_updated_at) ?? fallbackUpdatedAt,
    });
  }

  if (successfulCustomerExportStatus) {
    sideEffects.push({
      kind: "successful_customer_export",
      provider: null,
      status: successfulCustomerExportStatus,
      updatedAt:
        parseDate(paymentRecord.successful_customer_logged_at) ?? fallbackUpdatedAt,
    });
  }

  return sideEffects;
};

type Database = ReturnType<typeof drizzle>;
type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type SheetRecords = Awaited<ReturnType<typeof loadLiveSheetRecords>>;
type TelegramTokenRecord = SheetRecords["telegramTokenRecords"][number];
type TelegramBindingRecord = SheetRecords["telegramBindingRecords"][number];
type MonthlyReportRecord = SheetRecords["monthlyReportRecords"][number];
type EmailLeadRecord = SheetRecords["emailLeadRecords"][number];

const toGoogleSheetsBackfillRecords = (
  records: SheetRecords,
): GoogleSheetsBackfillRecords => ({
  emailCampaignLeads: records.emailLeadRecords,
  monthlyReportRuns: records.monthlyReportRecords,
  payments: records.paymentRecords,
  stripeEvents: records.stripeEventRecords,
  successfulCustomers: [],
  telegramAccessTokens: records.telegramTokenRecords,
  telegramUserBindings: records.telegramBindingRecords,
});

type BackfillTransactionContext = {
  customerIdByEmail: Map<string, string>;
  entitlementIdByPaymentIntentId: Map<string, string>;
  now: Date;
  offerLookup: OfferLookup;
  productLookup: ProductLookup;
  purchaseIdByPaymentIntentId: Map<string, string>;
  stats: BackfillWriteStats;
  tx: DatabaseTransaction;
};

const resolveCatalogIds = ({
  offerExternalId,
  offerLookup,
  productExternalId,
  productLookup,
}: {
  offerExternalId: string;
  offerLookup: OfferLookup;
  productExternalId: string;
  productLookup: ProductLookup;
}): { offerId: string | null; productId: string | null } => {
  const offer = offerLookup.byExternalId.get(offerExternalId.trim());
  const productId =
    productLookup.byExternalId.get(productExternalId.trim()) ?? offer?.productId ?? null;

  return {
    offerId: offer?.id ?? null,
    productId,
  };
};

const upsertPaymentCustomer = async ({
  customerIdByEmail,
  normalizedEmail,
  now,
  paymentRecord,
  stats,
  tx,
}: Pick<BackfillTransactionContext, "customerIdByEmail" | "now" | "stats" | "tx"> & {
  normalizedEmail: string;
  paymentRecord: PaymentSheetRecord;
}): Promise<string | null> => {
  if (!normalizedEmail) {
    return null;
  }

  const existingCustomerId = customerIdByEmail.get(normalizedEmail);
  const customerValues = {
    addressLine: nullIfEmpty(paymentRecord.customer_address),
    city: nullIfEmpty(paymentRecord.customer_city),
    country: nullIfEmpty(paymentRecord.customer_country),
    email: normalizedEmail,
    fullName: nullIfEmpty(paymentRecord.customer_full_name),
    postalCode: nullIfEmpty(paymentRecord.customer_postal_code),
    telegramUsername: nullIfEmpty(paymentRecord.customer_nickname),
    updatedAt: now,
  };

  if (existingCustomerId) {
    await tx
      .update(customers)
      .set(customerValues)
      .where(and(eq(customers.id, existingCustomerId), lte(customers.updatedAt, now)));

    return existingCustomerId;
  }

  const [savedCustomer] = await tx
    .insert(customers)
    .values({
      ...customerValues,
      normalizedEmail,
    })
    .returning({ id: customers.id });

  // The mutable lookup prevents duplicate customers when an email appears more
  // than once in the same sheet snapshot.
  customerIdByEmail.set(normalizedEmail, savedCustomer.id);
  stats.customers += 1;

  return savedCustomer.id;
};

const createPurchaseValues = ({
  customerId,
  firstSeenAt,
  normalizedEmail,
  offerId,
  paymentIntentId,
  paymentRecord,
  productId,
}: {
  customerId: string | null;
  firstSeenAt: Date;
  normalizedEmail: string;
  offerId: string | null;
  paymentIntentId: string;
  paymentRecord: PaymentSheetRecord;
  productId: string | null;
}) => ({
  amountMinor: parseInteger(paymentRecord.amount),
  checkoutCurrency: nullIfEmpty(paymentRecord.checkout_currency),
  checkoutLocale: normalizeCheckoutLocale(paymentRecord.checkout_locale),
  checkoutSessionId: nullIfEmpty(paymentRecord.checkout_session_id),
  currency:
    trim(paymentRecord.currency) || trim(paymentRecord.checkout_currency) || "pln",
  customerAddressLineSnapshot: nullIfEmpty(paymentRecord.customer_address),
  customerCitySnapshot: nullIfEmpty(paymentRecord.customer_city),
  customerCountrySnapshot: nullIfEmpty(paymentRecord.customer_country),
  customerEmailSnapshot: normalizedEmail || null,
  customerFullNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
  customerId,
  customerPostalCodeSnapshot: nullIfEmpty(paymentRecord.customer_postal_code),
  customerTelegramUsernameSnapshot: nullIfEmpty(paymentRecord.customer_nickname),
  lastPaymentErrorCode: nullIfEmpty(paymentRecord.last_payment_error_code),
  lastPaymentErrorMessage: nullIfEmpty(paymentRecord.last_payment_error_message),
  latestEventId: nullIfEmpty(paymentRecord.latest_event_id),
  latestEventType: nullIfEmpty(paymentRecord.latest_event_type),
  lessonLanguage: normalizeLessonLanguage(paymentRecord.lesson_language),
  offerExternalId: nullIfEmpty(paymentRecord.offer_id),
  offerId,
  offerLabelSnapshot: nullIfEmpty(paymentRecord.offer_label),
  outcome: normalizeOutcome(paymentRecord.outcome),
  productExternalId: nullIfEmpty(paymentRecord.product_id),
  productId,
  productTitleSnapshot: nullIfEmpty(paymentRecord.product_title),
  purchaseItemSnapshot: nullIfEmpty(paymentRecord.purchase_item),
  source: getPurchaseSource(paymentIntentId),
  stripeStatus: trim(paymentRecord.status) || "unknown",
  updatedAt: parseRequiredDate(paymentRecord.updated_at, firstSeenAt),
});

const upsertPaymentPurchase = async ({
  customerId,
  firstSeenAt,
  normalizedEmail,
  offerId,
  paymentIntentId,
  paymentRecord,
  productId,
  tx,
}: Pick<BackfillTransactionContext, "tx"> & {
  customerId: string | null;
  firstSeenAt: Date;
  normalizedEmail: string;
  offerId: string | null;
  paymentIntentId: string;
  paymentRecord: PaymentSheetRecord;
  productId: string | null;
}): Promise<string> => {
  const purchaseValues = createPurchaseValues({
    customerId,
    firstSeenAt,
    normalizedEmail,
    offerId,
    paymentIntentId,
    paymentRecord,
    productId,
  });
  const [savedPurchase] = await tx
    .insert(purchases)
    .values({
      ...purchaseValues,
      firstSeenAt,
      paymentIntentId,
      succeededAt: getSaleTimestamp(),
    })
    .onConflictDoUpdate({
      set: purchaseValues,
      setWhere: lte(purchases.updatedAt, purchaseValues.updatedAt),
      target: purchases.paymentIntentId,
    })
    .returning({ id: purchases.id });

  if (savedPurchase) {
    return savedPurchase.id;
  }

  const [existingPurchase] = await tx
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.paymentIntentId, paymentIntentId))
    .limit(1);

  if (!existingPurchase) {
    throw new Error("backfill_purchase_resolution_failed");
  }

  return existingPurchase.id;
};

const upsertPaymentEntitlement = async ({
  customerId,
  now,
  offerId,
  paymentRecord,
  productId,
  purchaseId,
  tx,
}: Pick<BackfillTransactionContext, "now" | "tx"> & {
  customerId: string | null;
  offerId: string | null;
  paymentRecord: PaymentSheetRecord;
  productId: string | null;
  purchaseId: string;
}): Promise<string> => {
  const entitlementValues = {
    accessWorkflow: nullIfEmpty(paymentRecord.access_workflow),
    currentTokenId: nullIfEmpty(paymentRecord.telegram_token_id),
    customerId,
    deliveryChannel: nullIfEmpty(paymentRecord.delivery_channel),
    expiresAt: parseDate(paymentRecord.telegram_access_expires_at),
    externalTargetType: getExternalTargetType(paymentRecord),
    offerId,
    productId,
    revokedAt: parseDate(paymentRecord.telegram_access_revoked_at),
    startsAt: parseDate(paymentRecord.telegram_token_used_at),
    status: normalizeAccessStatus(paymentRecord.telegram_access_status, paymentRecord),
    telegramChatId: nullIfEmpty(paymentRecord.telegram_channel_chat_id),
    telegramUserId: nullIfEmpty(paymentRecord.telegram_user_id),
    telegramUsername: nullIfEmpty(paymentRecord.telegram_username),
    updatedAt: now,
  };
  const [savedEntitlement] = await tx
    .insert(accessEntitlements)
    .values({
      accessKey: "primary",
      ...entitlementValues,
      purchaseId,
    })
    .onConflictDoUpdate({
      set: entitlementValues,
      setWhere: lte(accessEntitlements.updatedAt, now),
      target: [accessEntitlements.purchaseId, accessEntitlements.accessKey],
    })
    .returning({ id: accessEntitlements.id });

  if (savedEntitlement) {
    return savedEntitlement.id;
  }

  const [existingEntitlement] = await tx
    .select({ id: accessEntitlements.id })
    .from(accessEntitlements)
    .where(
      and(
        eq(accessEntitlements.purchaseId, purchaseId),
        eq(accessEntitlements.accessKey, "primary"),
      ),
    )
    .limit(1);

  if (!existingEntitlement) {
    throw new Error("backfill_entitlement_resolution_failed");
  }

  return existingEntitlement.id;
};

const upsertPaymentInvoice = async ({
  firstSeenAt,
  normalizedEmail,
  now,
  paymentRecord,
  purchaseId,
  stats,
  tx,
}: Pick<BackfillTransactionContext, "now" | "stats" | "tx"> & {
  firstSeenAt: Date;
  normalizedEmail: string;
  paymentRecord: PaymentSheetRecord;
  purchaseId: string;
}): Promise<void> => {
  const invoiceNumber = paymentRecord.invoice_number.trim();
  const parsedInvoice = parseInvoiceNumber(paymentRecord.invoice_number);

  if (!invoiceNumber || !parsedInvoice) {
    if (invoiceNumber) {
      stats.skippedInvoices += 1;
    }

    return;
  }

  const issuedAt = parseRequiredDate(paymentRecord.invoice_issued_at, firstSeenAt);
  const invoiceValues = {
    amountMinor: parseInteger(paymentRecord.amount),
    buyerEmailSnapshot: normalizedEmail || null,
    buyerNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
    currency:
      trim(paymentRecord.checkout_currency) || trim(paymentRecord.currency) || "pln",
    issuedAt,
    sequenceMonth: parsedInvoice.sequenceMonth,
    sequenceNumber: parsedInvoice.sequenceNumber,
    sequenceYear: parsedInvoice.sequenceYear,
    updatedAt: now,
  };

  await tx
    .insert(invoices)
    .values({
      ...invoiceValues,
      buyerAddressSnapshot: [
        paymentRecord.customer_address.trim(),
        paymentRecord.customer_city.trim(),
        paymentRecord.customer_postal_code.trim(),
        paymentRecord.customer_country.trim(),
      ]
        .filter(Boolean)
        .join(", "),
      invoiceNumber,
      purchaseId,
    })
    .onConflictDoUpdate({
      set: invoiceValues,
      setWhere: lte(invoices.updatedAt, now),
      target: invoices.purchaseId,
    });

  stats.invoices += 1;
};

const upsertPaymentSideEffects = async ({
  paymentRecord,
  purchaseId,
  sourceCutOffAt,
  stats,
  tx,
}: Pick<BackfillTransactionContext, "stats" | "tx"> & {
  paymentRecord: PaymentSheetRecord;
  purchaseId: string;
  sourceCutOffAt: Date;
}): Promise<void> => {
  for (const sideEffect of getPaymentSideEffects(paymentRecord, sourceCutOffAt)) {
    const sideEffectValues = {
      failedAt: sideEffect.status === "failed" ? sideEffect.updatedAt : null,
      provider: sideEffect.provider,
      sentAt: sideEffect.status === "sent" ? sideEffect.updatedAt : null,
      status: sideEffect.status,
      updatedAt: sideEffect.updatedAt,
    };

    await tx
      .insert(purchaseSideEffects)
      .values({
        ...sideEffectValues,
        kind: sideEffect.kind,
        purchaseId,
      })
      .onConflictDoUpdate({
        set: sideEffectValues,
        setWhere: lte(purchaseSideEffects.updatedAt, sideEffect.updatedAt),
        target: [purchaseSideEffects.purchaseId, purchaseSideEffects.kind],
      });

    stats.purchaseSideEffects += 1;
  }
};

const backfillPayments = async ({
  context,
  paymentRecords,
}: {
  context: BackfillTransactionContext;
  paymentRecords: SheetRecords["paymentRecords"];
}): Promise<void> => {
  const eligiblePaymentRecords = paymentRecords.filter((row) =>
    row.payment_intent_id.trim(),
  );

  for (const paymentRecord of eligiblePaymentRecords) {
    const paymentIntentId = paymentRecord.payment_intent_id.trim();
    const normalizedEmail = normalizeEmail(paymentRecord.customer_email);
    const sourceUpdatedAt = parseRequiredDate(
      paymentRecord.updated_at || paymentRecord.first_seen_at,
      context.now,
    );
    const customerId = await upsertPaymentCustomer({
      customerIdByEmail: context.customerIdByEmail,
      normalizedEmail,
      now: sourceUpdatedAt,
      paymentRecord,
      stats: context.stats,
      tx: context.tx,
    });
    const { offerId, productId } = resolveCatalogIds({
      offerExternalId: paymentRecord.offer_id,
      offerLookup: context.offerLookup,
      productExternalId: paymentRecord.product_id,
      productLookup: context.productLookup,
    });
    const firstSeenAt = parseRequiredDate(
      paymentRecord.first_seen_at || paymentRecord.updated_at,
      context.now,
    );
    const purchaseId = await upsertPaymentPurchase({
      customerId,
      firstSeenAt,
      normalizedEmail,
      offerId,
      paymentIntentId,
      paymentRecord,
      productId,
      tx: context.tx,
    });

    context.stats.purchases += 1;
    context.purchaseIdByPaymentIntentId.set(paymentIntentId, purchaseId);

    const entitlementId = await upsertPaymentEntitlement({
      customerId,
      now: sourceUpdatedAt,
      offerId,
      paymentRecord,
      productId,
      purchaseId,
      tx: context.tx,
    });

    context.stats.accessEntitlements += 1;
    context.entitlementIdByPaymentIntentId.set(paymentIntentId, entitlementId);

    await upsertPaymentInvoice({
      firstSeenAt,
      normalizedEmail,
      now: sourceUpdatedAt,
      paymentRecord,
      purchaseId,
      stats: context.stats,
      tx: context.tx,
    });
    await upsertPaymentSideEffects({
      paymentRecord,
      purchaseId,
      sourceCutOffAt: sourceUpdatedAt,
      stats: context.stats,
      tx: context.tx,
    });
  }
};

const backfillStripeEvents = async ({
  context,
  eventRecords,
}: {
  context: BackfillTransactionContext;
  eventRecords: SheetRecords["stripeEventRecords"];
}): Promise<void> => {
  for (const eventRecord of eventRecords.filter((row) => row.event_id.trim())) {
    const purchaseId = context.purchaseIdByPaymentIntentId.get(
      eventRecord.payment_intent_id.trim(),
    );
    const processedAt = parseDate(eventRecord.processed_at) ?? context.now;
    const eventValues = {
      eventType: eventRecord.event_type.trim() || "unknown",
      outcomeSnapshot: nullIfEmpty(eventRecord.outcome),
      paymentIntentId: nullIfEmpty(eventRecord.payment_intent_id),
      paymentStatusSnapshot: nullIfEmpty(eventRecord.status),
      processedAt,
      processingStatus: "processed" as const,
      purchaseId: purchaseId ?? null,
      updatedAt: processedAt,
    };

    await context.tx
      .insert(stripeEvents)
      .values({
        ...eventValues,
        payload: {
          source: "google_sheets_backfill",
        },
        stripeEventId: eventRecord.event_id.trim(),
      })
      .onConflictDoUpdate({
        set: eventValues,
        setWhere: lte(stripeEvents.updatedAt, processedAt),
        target: stripeEvents.stripeEventId,
      });

    context.stats.stripeEvents += 1;

    if (!purchaseId && eventRecord.payment_intent_id.trim()) {
      context.stats.skippedStripeEvents += 1;
    }
  }
};

const createTelegramTokenValues = ({
  context,
  offerId,
  paymentIntentId,
  productId,
  purchaseId,
  tokenRecord,
}: {
  context: BackfillTransactionContext;
  offerId: string | null;
  paymentIntentId: string;
  productId: string | null;
  purchaseId: string;
  tokenRecord: TelegramTokenRecord;
}) => {
  const updatedAt = parseRequiredDate(
    tokenRecord.used_at || tokenRecord.created_at,
    context.now,
  );

  return {
    accessExpiresAt: parseDate(tokenRecord.access_expires_at),
    chatId: tokenRecord.chat_id.trim(),
    customerEmailSnapshot: nullIfEmpty(tokenRecord.customer_email),
    entitlementId: context.entitlementIdByPaymentIntentId.get(paymentIntentId) ?? null,
    expiresAt: parseRequiredDate(
      tokenRecord.expires_at,
      parseRequiredDate(tokenRecord.created_at, context.now),
    ),
    lastError: nullIfEmpty(tokenRecord.last_error),
    linkKind:
      tokenRecord.link_kind.trim() === "start_token"
        ? ("start_token" as const)
        : ("channel_invite" as const),
    offerId,
    productId,
    purchaseId,
    status: normalizeTokenStatus(tokenRecord.status),
    telegramUserId: nullIfEmpty(tokenRecord.telegram_user_id),
    telegramUsername: nullIfEmpty(tokenRecord.telegram_username),
    tokenHash: tokenRecord.token_hash.trim() || tokenRecord.token_id.trim(),
    tokenValue: nullIfEmpty(tokenRecord.token_value),
    usedAt: parseDate(tokenRecord.used_at),
    updatedAt,
  };
};

const backfillTelegramAccessTokens = async ({
  context,
  tokenRecords,
}: {
  context: BackfillTransactionContext;
  tokenRecords: SheetRecords["telegramTokenRecords"];
}): Promise<void> => {
  for (const tokenRecord of tokenRecords.filter((row) => row.token_id.trim())) {
    const paymentIntentId = tokenRecord.payment_intent_id.trim();
    const purchaseId = context.purchaseIdByPaymentIntentId.get(paymentIntentId);

    if (!purchaseId) {
      context.stats.skippedTelegramAccessTokens += 1;
      continue;
    }

    const { offerId, productId } = resolveCatalogIds({
      offerExternalId: tokenRecord.offer_id,
      offerLookup: context.offerLookup,
      productExternalId: tokenRecord.product_id,
      productLookup: context.productLookup,
    });
    const insertTokenValues = createTelegramTokenValues({
      context,
      offerId,
      paymentIntentId,
      productId,
      purchaseId,
      tokenRecord,
    });
    await context.tx
      .insert(telegramAccessTokens)
      .values({
        ...insertTokenValues,
        tokenId: tokenRecord.token_id.trim(),
      })
      .onConflictDoUpdate({
        set: createTelegramTokenValues({
          context,
          offerId,
          paymentIntentId,
          productId,
          purchaseId,
          tokenRecord,
        }),
        setWhere: lte(
          telegramAccessTokens.updatedAt,
          parseRequiredDate(tokenRecord.used_at || tokenRecord.created_at, context.now),
        ),
        target: telegramAccessTokens.tokenId,
      });

    context.stats.telegramAccessTokens += 1;
  }
};

const createTelegramBindingValues = ({
  bindingRecord,
  context,
  offerId,
  paymentIntentId,
  productId,
}: {
  bindingRecord: TelegramBindingRecord;
  context: BackfillTransactionContext;
  offerId: string | null;
  paymentIntentId: string;
  productId: string | null;
}) => {
  const updatedAt = parseRequiredDate(
    bindingRecord.last_seen_at || bindingRecord.bound_at,
    context.now,
  );

  return {
    accessExpiresAt: parseDate(bindingRecord.access_expires_at),
    boundAt: parseRequiredDate(bindingRecord.bound_at, context.now),
    customerEmailSnapshot: nullIfEmpty(bindingRecord.customer_email),
    entitlementId: context.entitlementIdByPaymentIntentId.get(paymentIntentId) ?? null,
    inviteLink: nullIfEmpty(bindingRecord.invite_link),
    lastSeenAt: parseRequiredDate(
      bindingRecord.last_seen_at,
      parseRequiredDate(bindingRecord.bound_at, context.now),
    ),
    offerId,
    productId,
    revokedAt: parseDate(bindingRecord.revoked_at),
    revokedReason: nullIfEmpty(bindingRecord.revoked_reason),
    status: normalizeBindingStatus(bindingRecord.status),
    telegramUsername: nullIfEmpty(bindingRecord.telegram_username),
    updatedAt,
  };
};

const backfillTelegramUserBindings = async ({
  bindingRecords,
  context,
}: {
  bindingRecords: SheetRecords["telegramBindingRecords"];
  context: BackfillTransactionContext;
}): Promise<void> => {
  for (const bindingRecord of bindingRecords.filter((row) =>
    row.payment_intent_id.trim(),
  )) {
    const paymentIntentId = bindingRecord.payment_intent_id.trim();
    const purchaseId = context.purchaseIdByPaymentIntentId.get(paymentIntentId);

    if (!purchaseId || !bindingRecord.telegram_user_id.trim()) {
      context.stats.skippedTelegramUserBindings += 1;
      continue;
    }

    const { offerId, productId } = resolveCatalogIds({
      offerExternalId: bindingRecord.offer_id,
      offerLookup: context.offerLookup,
      productExternalId: bindingRecord.product_id,
      productLookup: context.productLookup,
    });
    const insertBindingValues = createTelegramBindingValues({
      bindingRecord,
      context,
      offerId,
      paymentIntentId,
      productId,
    });
    await context.tx
      .insert(telegramUserBindings)
      .values({
        ...insertBindingValues,
        chatId: bindingRecord.chat_id.trim(),
        purchaseId,
        telegramUserId: bindingRecord.telegram_user_id.trim(),
      })
      .onConflictDoUpdate({
        set: createTelegramBindingValues({
          bindingRecord,
          context,
          offerId,
          paymentIntentId,
          productId,
        }),
        setWhere: lte(
          telegramUserBindings.updatedAt,
          parseRequiredDate(
            bindingRecord.last_seen_at || bindingRecord.bound_at,
            context.now,
          ),
        ),
        target: [telegramUserBindings.purchaseId, telegramUserBindings.chatId],
      });

    context.stats.telegramUserBindings += 1;
  }
};

const createMonthlyReportValues = ({
  now,
  reportRecord,
}: {
  now: Date;
  reportRecord: MonthlyReportRecord;
}) => {
  const updatedAt = parseRequiredDate(
    reportRecord.delivered_at_utc || reportRecord.generated_at_utc,
    now,
  );

  return {
    csvSha256: nullIfEmpty(reportRecord.csv_sha256),
    deliveredAtUtc: parseDate(reportRecord.delivered_at_utc),
    deliveredTo: nullIfEmpty(reportRecord.delivered_to),
    deliveryStatus: normalizeDeliveryStatus(reportRecord.delivery_status),
    generatedAtUtc: parseRequiredDate(reportRecord.generated_at_utc, now),
    periodEndUtc: parseRequiredDate(reportRecord.period_end_utc, now),
    periodStartUtc: parseRequiredDate(reportRecord.period_start_utc, now),
    reportFamily: reportRecord.report_family.trim() || "monthly_sales",
    rowCount: parseInteger(reportRecord.row_count),
    updatedAt,
  };
};

const backfillMonthlyReports = async ({
  context,
  reportRecords,
}: {
  context: BackfillTransactionContext;
  reportRecords: SheetRecords["monthlyReportRecords"];
}): Promise<void> => {
  for (const reportRecord of reportRecords.filter((row) => row.report_key.trim())) {
    const insertReportValues = createMonthlyReportValues({
      now: context.now,
      reportRecord,
    });
    await context.tx
      .insert(monthlyReportRuns)
      .values({
        ...insertReportValues,
        reportKey: reportRecord.report_key.trim(),
      })
      .onConflictDoUpdate({
        set: insertReportValues,
        setWhere: lte(monthlyReportRuns.updatedAt, insertReportValues.updatedAt),
        target: monthlyReportRuns.reportKey,
      });

    context.stats.monthlyReportRuns += 1;
  }
};

const createEmailLeadValues = ({
  leadRecord,
  normalizedEmail,
  now,
}: {
  leadRecord: EmailLeadRecord;
  normalizedEmail: string;
  now: Date;
}) => ({
  campaignKey: leadRecord.campaign_key.trim(),
  email: normalizedEmail,
  emailSendAttempts: parseInteger(leadRecord.email_send_attempts),
  emailSendStatus: normalizeEmailSendStatus(leadRecord.email_send_status),
  emailSentAt: parseDate(leadRecord.email_sent_at),
  fullName: leadRecord.full_name.trim(),
  lastEmailError: leadRecord.last_email_error.trim(),
  locale: leadRecord.locale.trim(),
  normalizedEmail,
  socialContact: leadRecord.social_contact.trim(),
  updatedAt: now,
});

const backfillEmailLeads = async ({
  context,
  leadRecords,
}: {
  context: BackfillTransactionContext;
  leadRecords: SheetRecords["emailLeadRecords"];
}): Promise<void> => {
  for (const leadRecord of leadRecords.filter((row) => row.lead_id.trim())) {
    const normalizedEmail = normalizeEmail(leadRecord.email);
    const sourceUpdatedAt = parseRequiredDate(
      leadRecord.email_sent_at || leadRecord.created_at,
      context.now,
    );
    const leadValues = createEmailLeadValues({
      leadRecord,
      normalizedEmail,
      now: sourceUpdatedAt,
    });

    await context.tx
      .insert(emailCampaignLeads)
      .values({
        ...leadValues,
        createdAt: parseRequiredDate(leadRecord.created_at, context.now),
        leadId: leadRecord.lead_id.trim(),
      })
      .onConflictDoUpdate({
        set: leadValues,
        setWhere: lte(emailCampaignLeads.updatedAt, sourceUpdatedAt),
        target: emailCampaignLeads.leadId,
      });

    context.stats.emailCampaignLeads += 1;
  }
};

const BACKFILL_LOCK_ID = 2_026_081_102;

type BackfillCliOptions = {
  batchSize: number;
  confirmation: string;
  dryRun: boolean;
  maxBatches: number | null;
  sourceDirectory: string;
  target: GoogleSheetsBackfillTarget | null;
};

type BackfillRunCheckpoint = {
  id: string;
  nextRowIndex: number;
  stage: GoogleSheetsBackfillStage;
  stats: GoogleSheetsBackfillStats;
  status: "running" | "failed" | "completed";
};

const getArgumentValue = (name: string) => {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));

  return argument?.slice(prefix.length).trim() ?? "";
};

const parsePositiveIntegerArgument = ({
  defaultValue,
  maximum,
  name,
}: {
  defaultValue: number | null;
  maximum?: number;
  name: string;
}) => {
  const value = getArgumentValue(name);

  if (!value) {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(value, 10);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < 1 ||
    (maximum !== undefined && parsedValue > maximum)
  ) {
    throw new Error(`backfill_${name.replaceAll("-", "_")}_invalid`);
  }

  return parsedValue;
};

const parseBackfillTarget = (value: string): GoogleSheetsBackfillTarget | null => {
  if (!value) {
    return null;
  }

  if (value === "development" || value === "production") {
    return value;
  }

  throw new Error("backfill_target_invalid");
};

const parseCliOptions = (): BackfillCliOptions => {
  const batchSizeValue = getArgumentValue("batch-size");
  const legacyLimitValue = getArgumentValue("limit");

  if (batchSizeValue && legacyLimitValue && batchSizeValue !== legacyLimitValue) {
    throw new Error("backfill_batch_size_conflict");
  }

  const batchSize = parsePositiveIntegerArgument({
    defaultValue: DEFAULT_GOOGLE_SHEETS_BACKFILL_BATCH_SIZE,
    maximum: MAX_GOOGLE_SHEETS_BACKFILL_BATCH_SIZE,
    name: batchSizeValue ? "batch-size" : legacyLimitValue ? "limit" : "batch-size",
  });

  if (batchSize === null) {
    throw new Error("backfill_batch_size_missing");
  }

  return {
    batchSize,
    confirmation: getArgumentValue("confirmation"),
    dryRun: !process.argv.includes("--write"),
    maxBatches: parsePositiveIntegerArgument({
      defaultValue: null,
      name: "max-batches",
    }),
    sourceDirectory: getArgumentValue("source-dir"),
    target: parseBackfillTarget(getArgumentValue("target").toLowerCase()),
  };
};

const assertWriteOptions: (
  options: BackfillCliOptions,
) => asserts options is BackfillCliOptions & {
  target: GoogleSheetsBackfillTarget;
} = (options) => {
  if (!options.target) {
    throw new Error("Pass --target=development or --target=production explicitly.");
  }

  if (!options.sourceDirectory) {
    throw new Error("Pass --source-dir with extracted immutable DATA-01 files.");
  }

  const expectedConfirmation = `backfill-${options.target}`;

  if (options.confirmation !== expectedConfirmation) {
    throw new Error(`Pass --confirmation=${expectedConfirmation} exactly.`);
  }
};

const isBackfillStage = (value: string): value is GoogleSheetsBackfillStage =>
  GOOGLE_SHEETS_BACKFILL_STAGES.some((stage) => stage === value);

const parseStoredStats = (value: unknown): GoogleSheetsBackfillStats => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("backfill_stats_invalid");
  }

  const parsedStats = createEmptyGoogleSheetsBackfillStats();

  for (const stage of GOOGLE_SHEETS_BACKFILL_STAGES) {
    const counts = (value as Record<string, unknown>)[stage];

    if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
      throw new Error(`backfill_stats_stage_invalid:${stage}`);
    }

    for (const key of ["conflicts", "inserted", "skipped", "updated"] as const) {
      const count = (counts as Record<string, unknown>)[key];

      if (!Number.isInteger(count) || (count as number) < 0) {
        throw new Error(`backfill_stats_count_invalid:${stage}:${key}`);
      }

      parsedStats[stage][key] = count as number;
    }
  }

  return parsedStats;
};

const cloneStats = (stats: GoogleSheetsBackfillStats): GoogleSheetsBackfillStats =>
  Object.fromEntries(
    GOOGLE_SHEETS_BACKFILL_STAGES.map((stage) => [stage, { ...stats[stage] }]),
  ) as GoogleSheetsBackfillStats;

const getOrCreateBackfillRun = async ({
  batchSize,
  db,
  source,
}: {
  batchSize: number;
  db: Database;
  source: Awaited<ReturnType<typeof loadGoogleSheetsBackfillSource>>;
}): Promise<BackfillRunCheckpoint> => {
  const [existingRun] = await db
    .select()
    .from(dataBackfillRuns)
    .where(
      and(
        eq(dataBackfillRuns.backfillKey, GOOGLE_SHEETS_BACKFILL_KEY),
        eq(dataBackfillRuns.targetEnvironment, source.target),
        eq(dataBackfillRuns.sourceFingerprint, source.fingerprint),
      ),
    )
    .limit(1);

  if (existingRun) {
    if (!isBackfillStage(existingRun.stage)) {
      throw new Error(`backfill_checkpoint_stage_invalid:${existingRun.stage}`);
    }

    const checkpoint = {
      id: existingRun.id,
      nextRowIndex: existingRun.nextRowIndex,
      stage: existingRun.stage,
      stats: parseStoredStats(existingRun.stats),
      status: existingRun.status,
    };

    if (existingRun.status !== "completed") {
      await db
        .update(dataBackfillRuns)
        .set({
          batchSize,
          lastErrorCode: null,
          status: "running",
          updatedAt: new Date(),
        })
        .where(eq(dataBackfillRuns.id, existingRun.id));

      checkpoint.status = "running";
    }

    return checkpoint;
  }

  const stats = createEmptyGoogleSheetsBackfillStats();
  const [createdRun] = await db
    .insert(dataBackfillRuns)
    .values({
      backfillKey: GOOGLE_SHEETS_BACKFILL_KEY,
      batchSize,
      sourceCaptureId: source.captureId,
      sourceCutOffAt: source.cutOffAt,
      sourceFingerprint: source.fingerprint,
      sourceRowCounts: source.rowCounts,
      stage: GOOGLE_SHEETS_BACKFILL_STAGES[0],
      stats,
      targetEnvironment: source.target,
    })
    .returning({ id: dataBackfillRuns.id });

  if (!createdRun) {
    throw new Error("backfill_checkpoint_create_failed");
  }

  return {
    id: createdRun.id,
    nextRowIndex: 0,
    stage: GOOGLE_SHEETS_BACKFILL_STAGES[0],
    stats,
    status: "running",
  };
};

const getSanitizedErrorCode = (error: unknown) => {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);

    if (/^[a-z0-9_.:-]{1,120}$/iu.test(code)) {
      return code;
    }
  }

  if (error instanceof Error && /^[a-z0-9_.:-]{1,120}$/iu.test(error.message)) {
    return error.message;
  }

  return error instanceof Error ? error.name.slice(0, 120) : "unknown_error";
};

const hasRequiredDependencies = ({
  counts,
  lookups,
  record,
  stage,
}: {
  counts: GoogleSheetsBackfillOperationCounts;
  lookups: ExistingBackfillLookups;
  record: GoogleSheetsBackfillBatch["records"][number]["record"];
  stage: GoogleSheetsBackfillStage;
}) => {
  const values = record as Record<string, string>;

  if (stage === "telegramAccessTokens") {
    if (
      !lookups.purchaseIdByPaymentIntentId.has(values.payment_intent_id?.trim() ?? "")
    ) {
      counts.conflicts += 1;
      return false;
    }
  }

  if (stage === "telegramUserBindings") {
    const paymentIntentId = values.payment_intent_id?.trim() ?? "";

    if (
      !paymentIntentId ||
      !values.chat_id?.trim() ||
      !values.telegram_user_id?.trim() ||
      !lookups.purchaseIdByPaymentIntentId.has(paymentIntentId)
    ) {
      counts.conflicts += 1;
      return false;
    }
  }

  return true;
};

const getRecordSourceUpdatedAt = ({
  fallback,
  record,
  stage,
}: {
  fallback: Date;
  record: GoogleSheetsBackfillBatch["records"][number]["record"];
  stage: GoogleSheetsBackfillStage;
}) => {
  const values = record as Record<string, string>;

  switch (stage) {
    case "payments":
      return parseRequiredDate(values.updated_at || values.first_seen_at, fallback);
    case "stripeEvents":
      return parseRequiredDate(values.processed_at, fallback);
    case "telegramAccessTokens":
      return parseRequiredDate(values.used_at || values.created_at, fallback);
    case "telegramUserBindings":
      return parseRequiredDate(values.last_seen_at || values.bound_at, fallback);
    case "monthlyReportRuns":
      return parseRequiredDate(
        values.delivered_at_utc || values.generated_at_utc,
        fallback,
      );
    case "emailCampaignLeads":
      return parseRequiredDate(values.email_sent_at || values.created_at, fallback);
  }
};

const processStageRecords = async ({
  context,
  records,
  stage,
}: {
  context: BackfillTransactionContext;
  records: GoogleSheetsBackfillBatch["records"][number]["record"][];
  stage: GoogleSheetsBackfillStage;
}) => {
  switch (stage) {
    case "payments":
      await backfillPayments({
        context,
        paymentRecords: records as SheetRecords["paymentRecords"],
      });
      return;
    case "stripeEvents":
      await backfillStripeEvents({
        context,
        eventRecords: records as SheetRecords["stripeEventRecords"],
      });
      return;
    case "telegramAccessTokens":
      await backfillTelegramAccessTokens({
        context,
        tokenRecords: records as SheetRecords["telegramTokenRecords"],
      });
      return;
    case "telegramUserBindings":
      await backfillTelegramUserBindings({
        bindingRecords: records as SheetRecords["telegramBindingRecords"],
        context,
      });
      return;
    case "monthlyReportRuns":
      await backfillMonthlyReports({
        context,
        reportRecords: records as SheetRecords["monthlyReportRecords"],
      });
      return;
    case "emailCampaignLeads":
      await backfillEmailLeads({
        context,
        leadRecords: records as SheetRecords["emailLeadRecords"],
      });
  }
};

const runBackfillBatch = async ({
  batch,
  checkpoint,
  customerIdByEmail,
  db,
  duplicateIndexes,
  lookups,
  offerLookup,
  productLookup,
  sourceCutOffAt,
  writeStats,
}: {
  batch: GoogleSheetsBackfillBatch;
  checkpoint: BackfillRunCheckpoint;
  customerIdByEmail: Map<string, string>;
  db: Database;
  duplicateIndexes: Set<number>;
  lookups: ExistingBackfillLookups;
  offerLookup: OfferLookup;
  productLookup: ProductLookup;
  sourceCutOffAt: Date;
  writeStats: BackfillWriteStats;
}) => {
  const nextStats = cloneStats(checkpoint.stats);
  const counts = nextStats[batch.stage];
  const eligibleRecords: GoogleSheetsBackfillBatch["records"][number]["record"][] = [];
  const eligibleKeys: string[] = [];
  const eligibleUpdatedAtByKey = new Map<string, Date>();

  for (const { index, record } of batch.records) {
    const key = getGoogleSheetsBackfillRecordKey(batch.stage, record);

    if (!key) {
      if (
        batch.stage === "telegramUserBindings" &&
        (record as Record<string, string>).payment_intent_id?.trim()
      ) {
        counts.conflicts += 1;
      } else {
        counts.skipped += 1;
      }
      continue;
    }

    if (duplicateIndexes.has(index)) {
      counts.conflicts += 1;
      continue;
    }

    if (!hasRequiredDependencies({ counts, lookups, record, stage: batch.stage })) {
      continue;
    }

    const sourceUpdatedAt = getRecordSourceUpdatedAt({
      fallback: sourceCutOffAt,
      record,
      stage: batch.stage,
    });
    const existingUpdatedAt = lookups.updatedAtByKey[batch.stage].get(key);

    if (existingUpdatedAt && existingUpdatedAt > sourceUpdatedAt) {
      counts.conflicts += 1;
      continue;
    }

    eligibleRecords.push(record);
    eligibleKeys.push(key);
    eligibleUpdatedAtByKey.set(key, sourceUpdatedAt);
  }

  await db.transaction(async (tx) => {
    const context: BackfillTransactionContext = {
      customerIdByEmail,
      entitlementIdByPaymentIntentId: lookups.entitlementIdByPaymentIntentId,
      now: sourceCutOffAt,
      offerLookup,
      productLookup,
      purchaseIdByPaymentIntentId: lookups.purchaseIdByPaymentIntentId,
      stats: writeStats,
      tx,
    };

    await processStageRecords({ context, records: eligibleRecords, stage: batch.stage });

    for (const key of eligibleKeys) {
      if (lookups.keys[batch.stage].has(key)) {
        counts.updated += 1;
      } else {
        counts.inserted += 1;
        lookups.keys[batch.stage].add(key);
      }

      lookups.updatedAtByKey[batch.stage].set(
        key,
        eligibleUpdatedAtByKey.get(key) ?? sourceCutOffAt,
      );
    }

    const completedAt = batch.completed ? new Date() : null;
    const [savedCheckpoint] = await tx
      .update(dataBackfillRuns)
      .set({
        completedAt,
        lastErrorCode: null,
        nextRowIndex: batch.nextRowIndex,
        stage: batch.nextStage,
        stats: nextStats,
        status: batch.completed ? "completed" : "running",
        updatedAt: new Date(),
      })
      .where(eq(dataBackfillRuns.id, checkpoint.id))
      .returning({ id: dataBackfillRuns.id });

    if (!savedCheckpoint) {
      throw new Error("backfill_checkpoint_update_failed");
    }
  });

  return {
    ...checkpoint,
    nextRowIndex: batch.nextRowIndex,
    stage: batch.nextStage,
    stats: nextStats,
    status: batch.completed ? ("completed" as const) : ("running" as const),
  };
};

const runSnapshotBackfill = async ({
  options,
  source,
}: {
  options: BackfillCliOptions & { target: GoogleSheetsBackfillTarget };
  source: Awaited<ReturnType<typeof loadGoogleSheetsBackfillSource>>;
}) => {
  const databaseSelection = getDatabaseEnvSelection("unpooled");

  if (databaseSelection.deploymentEnvironment !== options.target) {
    throw new Error(
      `Resolved ${databaseSelection.deploymentEnvironment} database for ${options.target} backfill.`,
    );
  }

  const client = postgres(
    getRequiredDatabaseUrlFromEnv({
      kind: "unpooled",
      purpose: `${options.target} Google Sheets backfill`,
    }),
    {
      max: 1,
      prepare: false,
    },
  );
  const db = drizzle(client);
  let lockAcquired = false;
  let checkpoint: BackfillRunCheckpoint | null = null;

  try {
    const [lock] = await client<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(${BACKFILL_LOCK_ID}) AS acquired
    `;
    lockAcquired = Boolean(lock?.acquired);

    if (!lockAcquired) {
      throw new Error("backfill_lock_unavailable");
    }

    checkpoint = await getOrCreateBackfillRun({
      batchSize: options.batchSize,
      db,
      source,
    });

    if (checkpoint.status === "completed") {
      console.warn(
        JSON.stringify({
          captureId: source.captureId,
          sourceFingerprint: source.fingerprint,
          stats: checkpoint.stats,
          status: "already_completed",
          target: source.target,
        }),
      );
      return;
    }

    const productLookup = await getProductLookup(db);
    const offerLookup = await getOfferLookup(db);
    const customerIdByEmail = await getExistingCustomerLookup(db);
    const lookups = await getExistingBackfillLookups(db);
    const writeStats = { ...EMPTY_WRITE_STATS };
    const duplicateIndexes = Object.fromEntries(
      GOOGLE_SHEETS_BACKFILL_STAGES.map((stage) => [
        stage,
        getGoogleSheetsBackfillDuplicateIndexes(source.records, stage),
      ]),
    ) as Record<GoogleSheetsBackfillStage, Set<number>>;
    let processedBatches = 0;

    while (checkpoint.status !== "completed") {
      if (options.maxBatches !== null && processedBatches >= options.maxBatches) {
        break;
      }

      const batch = getNextGoogleSheetsBackfillBatch({
        batchSize: options.batchSize,
        nextRowIndex: checkpoint.nextRowIndex,
        records: source.records,
        stage: checkpoint.stage,
      });

      checkpoint = await runBackfillBatch({
        batch,
        checkpoint,
        customerIdByEmail,
        db,
        duplicateIndexes: duplicateIndexes[batch.stage],
        lookups,
        offerLookup,
        productLookup,
        sourceCutOffAt: source.cutOffAt,
        writeStats,
      });
      processedBatches += 1;
    }

    console.warn(
      JSON.stringify({
        captureId: source.captureId,
        checkpoint: {
          nextRowIndex: checkpoint.nextRowIndex,
          stage: checkpoint.stage,
        },
        processedBatches,
        sourceFingerprint: source.fingerprint,
        stats: checkpoint.stats,
        status: checkpoint.status === "completed" ? "completed" : "paused",
        target: source.target,
      }),
    );
  } catch (error) {
    if (checkpoint && checkpoint.status !== "completed") {
      await db
        .update(dataBackfillRuns)
        .set({
          lastErrorCode: getSanitizedErrorCode(error),
          status: "failed",
          updatedAt: new Date(),
        })
        .where(eq(dataBackfillRuns.id, checkpoint.id));
    }

    throw error;
  } finally {
    if (lockAcquired) {
      await client`SELECT pg_advisory_unlock(${BACKFILL_LOCK_ID})`;
    }

    await client.end();
  }
};

const backfill = async (options: BackfillCliOptions) => {
  if (options.target) {
    process.env.DATABASE_ENV = options.target;
  }

  loadDatabaseEnvConfig();

  if (options.dryRun && !options.sourceDirectory) {
    const liveRecords = await loadLiveSheetRecords();
    const records = toGoogleSheetsBackfillRecords(liveRecords);

    console.warn(
      JSON.stringify({
        plan: getGoogleSheetsBackfillPlan(records),
        source: "live_read_only_google_sheets",
        status: "dry_run",
      }),
    );
    console.warn(
      "Write mode requires an extracted immutable DATA-01 source and explicit target confirmation.",
    );
    return;
  }

  if (!options.target) {
    throw new Error("Pass --target with --source-dir.");
  }

  const source = await loadGoogleSheetsBackfillSource({
    directory: options.sourceDirectory,
    expectedTarget: options.target,
  });

  if (options.dryRun) {
    console.warn(
      JSON.stringify({
        captureId: source.captureId,
        cutOffAt: source.cutOffAt.toISOString(),
        plan: getGoogleSheetsBackfillPlan(source.records),
        sourceFingerprint: source.fingerprint,
        status: "dry_run",
        target: source.target,
      }),
    );
    return;
  }

  assertWriteOptions(options);
  await runSnapshotBackfill({ options, source });
};

backfill(parseCliOptions()).catch((error) => {
  console.error(
    "Google Sheets backfill failed",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
