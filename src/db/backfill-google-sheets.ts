import { eq, isNotNull } from "drizzle-orm";
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

import { getRequiredDatabaseUrlFromEnv } from "./env";
import { loadDatabaseEnvConfig } from "./load-env";
import {
  accessEntitlements,
  customers,
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

loadDatabaseEnvConfig();

type BackfillStats = {
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

const EMPTY_STATS: BackfillStats = {
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

const loadSheetRecords = async () => {
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

const readOnlyPlan = ({
  emailLeadRecords,
  monthlyReportRecords,
  paymentRecords,
  stripeEventRecords,
  telegramBindingRecords,
  telegramTokenRecords,
}: Awaited<ReturnType<typeof loadSheetRecords>>) => ({
  emailCampaignLeads: emailLeadRecords.filter((row) => row.lead_id.trim()).length,
  monthlyReportRuns: monthlyReportRecords.filter((row) => row.report_key.trim()).length,
  payments: paymentRecords.filter((row) => row.payment_intent_id.trim()).length,
  stripeEvents: stripeEventRecords.filter((row) => row.event_id.trim()).length,
  telegramAccessTokens: telegramTokenRecords.filter((row) => row.token_id.trim()).length,
  telegramUserBindings: telegramBindingRecords.filter((row) =>
    row.payment_intent_id.trim(),
  ).length,
});

const getPaymentSideEffects = (paymentRecord: PaymentSheetRecord) => {
  const sideEffects: Array<{
    kind:
      | "purchase_success_email"
      | "admin_telegram_alert"
      | "successful_customer_export";
    provider: "resend" | "telegram" | null;
    status: "pending" | "sending" | "sent" | "skipped" | "failed";
    updatedAt: Date;
  }> = [];
  const fallbackUpdatedAt = parseRequiredDate(
    paymentRecord.updated_at || paymentRecord.first_seen_at,
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
type SheetRecords = Awaited<ReturnType<typeof loadSheetRecords>>;
type TelegramTokenRecord = SheetRecords["telegramTokenRecords"][number];
type TelegramBindingRecord = SheetRecords["telegramBindingRecords"][number];
type MonthlyReportRecord = SheetRecords["monthlyReportRecords"][number];
type EmailLeadRecord = SheetRecords["emailLeadRecords"][number];

type BackfillTransactionContext = {
  customerIdByEmail: Map<string, string>;
  entitlementIdByPaymentIntentId: Map<string, string>;
  now: Date;
  offerLookup: OfferLookup;
  productLookup: ProductLookup;
  purchaseIdByPaymentIntentId: Map<string, string>;
  stats: BackfillStats;
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
      .where(eq(customers.id, existingCustomerId));

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
      target: purchases.paymentIntentId,
    })
    .returning({ id: purchases.id });

  return savedPurchase.id;
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
      target: [accessEntitlements.purchaseId, accessEntitlements.accessKey],
    })
    .returning({ id: accessEntitlements.id });

  return savedEntitlement.id;
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
      target: invoices.purchaseId,
    });

  stats.invoices += 1;
};

const upsertPaymentSideEffects = async ({
  paymentRecord,
  purchaseId,
  stats,
  tx,
}: Pick<BackfillTransactionContext, "stats" | "tx"> & {
  paymentRecord: PaymentSheetRecord;
  purchaseId: string;
}): Promise<void> => {
  for (const sideEffect of getPaymentSideEffects(paymentRecord)) {
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
        target: [purchaseSideEffects.purchaseId, purchaseSideEffects.kind],
      });

    stats.purchaseSideEffects += 1;
  }
};

const backfillPayments = async ({
  context,
  limit,
  paymentRecords,
}: {
  context: BackfillTransactionContext;
  limit: number | null;
  paymentRecords: SheetRecords["paymentRecords"];
}): Promise<void> => {
  const limitedPaymentRecords = paymentRecords
    .filter((row) => row.payment_intent_id.trim())
    .slice(0, limit ?? undefined);

  for (const paymentRecord of limitedPaymentRecords) {
    const paymentIntentId = paymentRecord.payment_intent_id.trim();
    const normalizedEmail = normalizeEmail(paymentRecord.customer_email);
    const customerId = await upsertPaymentCustomer({
      customerIdByEmail: context.customerIdByEmail,
      normalizedEmail,
      now: context.now,
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
      now: context.now,
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
      now: context.now,
      paymentRecord,
      purchaseId,
      stats: context.stats,
      tx: context.tx,
    });
    await upsertPaymentSideEffects({
      paymentRecord,
      purchaseId,
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
    const eventValues = {
      eventType: eventRecord.event_type.trim() || "unknown",
      outcomeSnapshot: nullIfEmpty(eventRecord.outcome),
      paymentIntentId: nullIfEmpty(eventRecord.payment_intent_id),
      paymentStatusSnapshot: nullIfEmpty(eventRecord.status),
      processedAt: parseDate(eventRecord.processed_at) ?? context.now,
      processingStatus: "processed" as const,
      purchaseId: purchaseId ?? null,
      updatedAt: context.now,
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
}) => ({
  accessExpiresAt: parseDate(tokenRecord.access_expires_at),
  chatId: tokenRecord.chat_id.trim(),
  customerEmailSnapshot: nullIfEmpty(tokenRecord.customer_email),
  entitlementId: context.entitlementIdByPaymentIntentId.get(paymentIntentId) ?? null,
  expiresAt: parseRequiredDate(
    tokenRecord.expires_at,
    parseRequiredDate(tokenRecord.created_at),
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
  updatedAt: context.now,
});

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
}) => ({
  accessExpiresAt: parseDate(bindingRecord.access_expires_at),
  boundAt: parseRequiredDate(bindingRecord.bound_at),
  customerEmailSnapshot: nullIfEmpty(bindingRecord.customer_email),
  entitlementId: context.entitlementIdByPaymentIntentId.get(paymentIntentId) ?? null,
  inviteLink: nullIfEmpty(bindingRecord.invite_link),
  lastSeenAt: parseRequiredDate(
    bindingRecord.last_seen_at,
    parseRequiredDate(bindingRecord.bound_at),
  ),
  offerId,
  productId,
  revokedAt: parseDate(bindingRecord.revoked_at),
  revokedReason: nullIfEmpty(bindingRecord.revoked_reason),
  status: normalizeBindingStatus(bindingRecord.status),
  telegramUsername: nullIfEmpty(bindingRecord.telegram_username),
  updatedAt: context.now,
});

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
}) => ({
  csvSha256: nullIfEmpty(reportRecord.csv_sha256),
  deliveredAtUtc: parseDate(reportRecord.delivered_at_utc),
  deliveredTo: nullIfEmpty(reportRecord.delivered_to),
  deliveryStatus: normalizeDeliveryStatus(reportRecord.delivery_status),
  generatedAtUtc: parseRequiredDate(reportRecord.generated_at_utc),
  periodEndUtc: parseRequiredDate(reportRecord.period_end_utc),
  periodStartUtc: parseRequiredDate(reportRecord.period_start_utc),
  reportFamily: reportRecord.report_family.trim() || "monthly_sales",
  rowCount: parseInteger(reportRecord.row_count),
  updatedAt: now,
});

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
        set: createMonthlyReportValues({
          now: context.now,
          reportRecord,
        }),
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
    const leadValues = createEmailLeadValues({
      leadRecord,
      normalizedEmail,
      now: context.now,
    });

    await context.tx
      .insert(emailCampaignLeads)
      .values({
        ...leadValues,
        createdAt: parseRequiredDate(leadRecord.created_at),
        leadId: leadRecord.lead_id.trim(),
      })
      .onConflictDoUpdate({
        set: leadValues,
        target: emailCampaignLeads.leadId,
      });

    context.stats.emailCampaignLeads += 1;
  }
};

const runBackfillTransaction = async ({
  customerIdByEmail,
  db,
  limit,
  now,
  offerLookup,
  productLookup,
  records,
  stats,
}: {
  customerIdByEmail: Map<string, string>;
  db: Database;
  limit: number | null;
  now: Date;
  offerLookup: OfferLookup;
  productLookup: ProductLookup;
  records: SheetRecords;
  stats: BackfillStats;
}): Promise<void> => {
  await db.transaction(async (tx) => {
    const context: BackfillTransactionContext = {
      customerIdByEmail,
      entitlementIdByPaymentIntentId: new Map<string, string>(),
      now,
      offerLookup,
      productLookup,
      purchaseIdByPaymentIntentId: new Map<string, string>(),
      stats,
      tx,
    };

    // Dependent sheets intentionally replay in this order and share one transaction:
    // later records can only reference purchases and entitlements created in this run.
    await backfillPayments({
      context,
      limit,
      paymentRecords: records.paymentRecords,
    });
    await backfillStripeEvents({
      context,
      eventRecords: records.stripeEventRecords,
    });
    await backfillTelegramAccessTokens({
      context,
      tokenRecords: records.telegramTokenRecords,
    });
    await backfillTelegramUserBindings({
      bindingRecords: records.telegramBindingRecords,
      context,
    });
    await backfillMonthlyReports({
      context,
      reportRecords: records.monthlyReportRecords,
    });
    await backfillEmailLeads({
      context,
      leadRecords: records.emailLeadRecords,
    });
  });
};

const backfill = async ({ dryRun, limit }: { dryRun: boolean; limit: number | null }) => {
  const records = await loadSheetRecords();
  const plannedCounts = readOnlyPlan(records);

  if (dryRun) {
    console.warn("Google Sheets backfill dry run", plannedCounts);
    console.warn("Run npm run db:backfill:sheets -- --write to insert/update rows.");
    return;
  }

  const client = postgres(
    getRequiredDatabaseUrlFromEnv({
      kind: "unpooled",
      purpose: "Google Sheets backfill",
    }),
    {
      max: 1,
      prepare: false,
    },
  );
  const db = drizzle(client);
  const stats = { ...EMPTY_STATS };
  const now = new Date();

  try {
    const productLookup = await getProductLookup(db);
    const offerLookup = await getOfferLookup(db);
    const customerIdByEmail = await getExistingCustomerLookup(db);

    await runBackfillTransaction({
      customerIdByEmail,
      db,
      limit,
      now,
      offerLookup,
      productLookup,
      records,
      stats,
    });

    console.warn("Google Sheets backfill completed", {
      plannedCounts,
      stats,
    });
  } finally {
    await client.end();
  }
};

const parseLimit = () => {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));

  if (!limitArg) {
    return null;
  }

  const limit = Number.parseInt(limitArg.slice("--limit=".length), 10);

  return Number.isFinite(limit) && limit > 0 ? limit : null;
};

backfill({
  dryRun: !process.argv.includes("--write"),
  limit: parseLimit(),
}).catch((error) => {
  console.error("Google Sheets backfill failed", error);
  process.exitCode = 1;
});
