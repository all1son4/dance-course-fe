import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";

import {
  PAYMENT_SHEET_HEADERS,
  type PaymentSheetRecord,
} from "@/lib/google-sheets-schema";

import { getDatabase } from "./client";
import {
  accessEntitlements,
  customers,
  invoices,
  productOffers,
  products,
  purchases,
  purchaseSideEffects,
  stripeEvents,
} from "./schema";

const trim = (value: string | null | undefined) => value?.trim() ?? "";
const nullIfEmpty = (value: string | null | undefined) => trim(value) || null;
const normalizeEmail = (value: string | null | undefined) => trim(value).toLowerCase();

const emptyPaymentRecord = (): PaymentSheetRecord =>
  Object.fromEntries(
    PAYMENT_SHEET_HEADERS.map((header) => [header, ""]),
  ) as PaymentSheetRecord;

const parseInteger = (value: string | null | undefined, fallback = 0) => {
  const parsedValue = Number.parseInt(trim(value), 10);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const parseDate = (value: string | null | undefined) => {
  const timestamp = Date.parse(trim(value));

  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
};

const parseTimestamp = (value: string | null | undefined) => {
  const timestamp = Date.parse(trim(value));

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const parseRequiredDate = (
  value: string | null | undefined,
  fallback: Date = new Date(),
) => parseDate(value) ?? fallback;

const toIso = (date: Date | null | undefined) => date?.toISOString() ?? "";

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

const getSaleTimestamp = () => null;

const getPurchaseSource = (paymentIntentId: string) =>
  paymentIntentId.startsWith("adm_offer_pi_") ? "admin_offer_link" : "stripe";

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

const getPaymentSideEffects = (paymentRecord: PaymentSheetRecord) => {
  const fallbackUpdatedAt = parseRequiredDate(
    paymentRecord.updated_at || paymentRecord.first_seen_at,
  );
  const emailStatus = normalizeSideEffectStatus(paymentRecord.email_delivery_status);
  const alertStatus = normalizeSideEffectStatus(paymentRecord.with_mentor_alert_status);
  const successfulCustomerStatus =
    normalizeSideEffectStatus(paymentRecord.successful_customer_log_status) ??
    (paymentRecord.successful_customer_logged_at.trim() ? "sent" : null);

  return [
    emailStatus
      ? {
          kind: "purchase_success_email" as const,
          provider: "resend" as const,
          status: emailStatus,
          updatedAt:
            parseDate(paymentRecord.email_delivery_updated_at) ?? fallbackUpdatedAt,
        }
      : null,
    alertStatus
      ? {
          kind: "admin_telegram_alert" as const,
          provider: "telegram" as const,
          status: alertStatus,
          updatedAt:
            parseDate(paymentRecord.with_mentor_alert_updated_at) ?? fallbackUpdatedAt,
        }
      : null,
    successfulCustomerStatus
      ? {
          kind: "successful_customer_export" as const,
          provider: null,
          status: successfulCustomerStatus,
          updatedAt:
            parseDate(paymentRecord.successful_customer_logged_at) ?? fallbackUpdatedAt,
        }
      : null,
  ].filter((sideEffect) => sideEffect !== null);
};

type PurchaseRow = typeof purchases.$inferSelect;
type EntitlementRow = typeof accessEntitlements.$inferSelect;
type InvoiceRow = typeof invoices.$inferSelect;
type SideEffectRow = typeof purchaseSideEffects.$inferSelect;
type PaymentRecordTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];
type PaymentOfferReference = Pick<typeof productOffers.$inferSelect, "id" | "productId">;
type ParsedInvoice = NonNullable<ReturnType<typeof parseInvoiceNumber>>;

type PaymentRecordHydrationLookups = {
  entitlementByPurchaseId: Map<string, EntitlementRow>;
  invoiceByPurchaseId: Map<string, InvoiceRow>;
  sideEffectsByPurchaseId: Map<string, SideEffectRow[]>;
};

const indexEntitlementsByPurchaseId = (
  entitlementRows: EntitlementRow[],
): Map<string, EntitlementRow> => {
  const entitlementByPurchaseId = new Map<string, EntitlementRow>();

  for (const entitlement of entitlementRows) {
    const currentEntitlement = entitlementByPurchaseId.get(entitlement.purchaseId);

    // A purchase can also hold hub access; sheet-compatible fields describe primary access.
    if (
      !currentEntitlement ||
      (entitlement.accessKey === "primary" && currentEntitlement.accessKey !== "primary")
    ) {
      entitlementByPurchaseId.set(entitlement.purchaseId, entitlement);
    }
  }

  return entitlementByPurchaseId;
};

const groupSideEffectsByPurchaseId = (
  sideEffectRows: SideEffectRow[],
): Map<string, SideEffectRow[]> => {
  const sideEffectsByPurchaseId = new Map<string, SideEffectRow[]>();

  for (const sideEffect of sideEffectRows) {
    const purchaseSideEffectsForPurchase =
      sideEffectsByPurchaseId.get(sideEffect.purchaseId) ?? [];

    purchaseSideEffectsForPurchase.push(sideEffect);
    sideEffectsByPurchaseId.set(sideEffect.purchaseId, purchaseSideEffectsForPurchase);
  }

  return sideEffectsByPurchaseId;
};

const createPaymentRecordHydrationLookups = ({
  entitlementRows,
  invoiceRows,
  sideEffectRows,
}: {
  entitlementRows: EntitlementRow[];
  invoiceRows: InvoiceRow[];
  sideEffectRows: SideEffectRow[];
}): PaymentRecordHydrationLookups => ({
  entitlementByPurchaseId: indexEntitlementsByPurchaseId(entitlementRows),
  invoiceByPurchaseId: new Map(invoiceRows.map((row) => [row.purchaseId, row] as const)),
  sideEffectsByPurchaseId: groupSideEffectsByPurchaseId(sideEffectRows),
});

const populatePurchaseFields = ({
  purchase,
  record,
  successfulCustomerSideEffect,
}: {
  purchase: PurchaseRow;
  record: PaymentSheetRecord;
  successfulCustomerSideEffect: SideEffectRow | undefined;
}): void => {
  record.payment_intent_id = purchase.paymentIntentId;
  record.customer_email = purchase.customerEmailSnapshot ?? "";
  record.customer_full_name = purchase.customerFullNameSnapshot ?? "";
  record.customer_nickname = purchase.customerTelegramUsernameSnapshot ?? "";
  record.customer_country = purchase.customerCountrySnapshot ?? "";
  record.latest_event_id = purchase.latestEventId ?? "";
  record.latest_event_type = purchase.latestEventType ?? "";
  record.status = purchase.stripeStatus;
  record.outcome = purchase.outcome;
  record.amount = String(purchase.amountMinor);
  record.currency = purchase.currency;
  record.product_id = purchase.productExternalId ?? "";
  record.product_title = purchase.productTitleSnapshot ?? "";
  record.offer_id = purchase.offerExternalId ?? "";
  record.offer_label = purchase.offerLabelSnapshot ?? "";
  record.checkout_currency = purchase.checkoutCurrency ?? "";
  record.checkout_locale = purchase.checkoutLocale ?? "";
  record.lesson_language = purchase.lessonLanguage ?? "";
  record.last_payment_error_code = purchase.lastPaymentErrorCode ?? "";
  record.last_payment_error_message = purchase.lastPaymentErrorMessage ?? "";
  record.first_seen_at = toIso(purchase.firstSeenAt);
  record.successful_customer_logged_at = toIso(successfulCustomerSideEffect?.sentAt);
  record.updated_at = toIso(purchase.updatedAt);
  record.checkout_session_id = purchase.checkoutSessionId ?? "";
  record.purchase_item = purchase.purchaseItemSnapshot ?? "";
};

const populateAccessFields = ({
  entitlement,
  purchase,
  record,
}: {
  entitlement: EntitlementRow | undefined;
  purchase: PurchaseRow;
  record: PaymentSheetRecord;
}): void => {
  record.delivery_channel = entitlement?.deliveryChannel ?? "";
  record.access_workflow = entitlement?.accessWorkflow ?? "";
  record.telegram_access_status = entitlement?.status ?? "";
  record.telegram_token_id = entitlement?.currentTokenId ?? "";
  record.telegram_token_expires_at = "";
  record.telegram_token_used_at = toIso(entitlement?.startsAt);
  record.telegram_user_id = entitlement?.telegramUserId ?? "";
  record.telegram_username = entitlement?.telegramUsername ?? "";
  record.telegram_channel_chat_id = entitlement?.telegramChatId ?? "";
  record.telegram_inspiration_chat_id = purchase.inspirationChatIdSnapshot ?? "";
  record.telegram_inspiration_access_expires_at = toIso(
    purchase.inspirationAccessExpiresAtSnapshot,
  );
  record.telegram_access_expires_at = toIso(entitlement?.expiresAt);
  record.telegram_access_revoked_at = toIso(entitlement?.revokedAt);
};

const populateDeliveryFields = ({
  alertSideEffect,
  emailSideEffect,
  invoice,
  purchase,
  record,
  successfulCustomerSideEffect,
}: {
  alertSideEffect: SideEffectRow | undefined;
  emailSideEffect: SideEffectRow | undefined;
  invoice: InvoiceRow | undefined;
  purchase: PurchaseRow;
  record: PaymentSheetRecord;
  successfulCustomerSideEffect: SideEffectRow | undefined;
}): void => {
  record.email_delivery_status = emailSideEffect?.status ?? "";
  record.email_delivery_updated_at = toIso(emailSideEffect?.updatedAt);
  record.with_mentor_alert_status = alertSideEffect?.status ?? "";
  record.with_mentor_alert_updated_at = toIso(alertSideEffect?.updatedAt);
  record.customer_address = purchase.customerAddressLineSnapshot ?? "";
  record.customer_city = purchase.customerCitySnapshot ?? "";
  record.customer_postal_code = purchase.customerPostalCodeSnapshot ?? "";
  record.invoice_number = invoice?.invoiceNumber ?? "";
  record.invoice_issued_at = toIso(invoice?.issuedAt);
  record.successful_customer_log_status = successfulCustomerSideEffect?.status ?? "";
};

const hydratePaymentRecord = (
  purchase: PurchaseRow,
  lookups: PaymentRecordHydrationLookups,
): PaymentSheetRecord => {
  const record = emptyPaymentRecord();
  const entitlement = lookups.entitlementByPurchaseId.get(purchase.id);
  const invoice = lookups.invoiceByPurchaseId.get(purchase.id);
  const sideEffects = lookups.sideEffectsByPurchaseId.get(purchase.id) ?? [];
  const emailSideEffect = sideEffects.find(
    (sideEffect) => sideEffect.kind === "purchase_success_email",
  );
  const alertSideEffect = sideEffects.find(
    (sideEffect) => sideEffect.kind === "admin_telegram_alert",
  );
  const successfulCustomerSideEffect = sideEffects.find(
    (sideEffect) => sideEffect.kind === "successful_customer_export",
  );

  populatePurchaseFields({
    purchase,
    record,
    successfulCustomerSideEffect,
  });
  populateAccessFields({
    entitlement,
    purchase,
    record,
  });
  populateDeliveryFields({
    alertSideEffect,
    emailSideEffect,
    invoice,
    purchase,
    record,
    successfulCustomerSideEffect,
  });

  return record;
};

const hydratePaymentRecords = async (
  purchaseRows: PurchaseRow[],
): Promise<PaymentSheetRecord[]> => {
  if (purchaseRows.length === 0) {
    return [];
  }

  const db = getDatabase();
  const purchaseIds = purchaseRows.map((purchase) => purchase.id);
  const [entitlementRows, invoiceRows, sideEffectRows] = await Promise.all([
    db
      .select()
      .from(accessEntitlements)
      .where(inArray(accessEntitlements.purchaseId, purchaseIds)),
    db.select().from(invoices).where(inArray(invoices.purchaseId, purchaseIds)),
    db
      .select()
      .from(purchaseSideEffects)
      .where(inArray(purchaseSideEffects.purchaseId, purchaseIds)),
  ]);
  const lookups = createPaymentRecordHydrationLookups({
    entitlementRows,
    invoiceRows,
    sideEffectRows,
  });

  return purchaseRows.map((purchase) => hydratePaymentRecord(purchase, lookups));
};

export const findPaymentRecordByIntentIdFromDatabase = async (
  paymentIntentId: string,
) => {
  const normalizedPaymentIntentId = paymentIntentId.trim();

  if (!normalizedPaymentIntentId) {
    return null;
  }

  const db = getDatabase();
  const rows = await db
    .select()
    .from(purchases)
    .where(eq(purchases.paymentIntentId, normalizedPaymentIntentId))
    .limit(1);
  const [record] = await hydratePaymentRecords(rows);

  return record ?? null;
};

export const listPaymentRecordsFromDatabase = async () => {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(purchases)
    .orderBy(purchases.firstSeenAt, purchases.paymentIntentId);

  return hydratePaymentRecords(rows);
};

export const findLatestPaymentRecordByCheckoutSessionIdFromDatabase = async (
  checkoutSessionId: string,
) => {
  const normalizedCheckoutSessionId = checkoutSessionId.trim();

  if (!normalizedCheckoutSessionId) {
    return null;
  }

  const db = getDatabase();
  const rows = await db
    .select()
    .from(purchases)
    .where(eq(purchases.checkoutSessionId, normalizedCheckoutSessionId))
    .orderBy(purchases.updatedAt, purchases.firstSeenAt)
    .limit(10);
  const records = await hydratePaymentRecords(rows);

  return (
    records.sort((left, right) => {
      const rightTs = parseTimestamp(right.updated_at || right.first_seen_at);
      const leftTs = parseTimestamp(left.updated_at || left.first_seen_at);

      return rightTs - leftTs;
    })[0] ?? null
  );
};

const upsertPaymentCustomer = async ({
  normalizedEmail,
  now,
  paymentRecord,
  transaction,
}: {
  normalizedEmail: string;
  now: Date;
  paymentRecord: PaymentSheetRecord;
  transaction: PaymentRecordTransaction;
}): Promise<string> => {
  const [existingCustomer] = await transaction
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.normalizedEmail, normalizedEmail))
    .limit(1);

  if (existingCustomer) {
    await transaction
      .update(customers)
      .set({
        addressLine: nullIfEmpty(paymentRecord.customer_address),
        city: nullIfEmpty(paymentRecord.customer_city),
        country: nullIfEmpty(paymentRecord.customer_country),
        email: normalizedEmail,
        fullName: nullIfEmpty(paymentRecord.customer_full_name),
        postalCode: nullIfEmpty(paymentRecord.customer_postal_code),
        telegramUsername: nullIfEmpty(paymentRecord.customer_nickname),
        updatedAt: now,
      })
      .where(eq(customers.id, existingCustomer.id));

    return existingCustomer.id;
  }

  const [savedCustomer] = await transaction
    .insert(customers)
    .values({
      addressLine: nullIfEmpty(paymentRecord.customer_address),
      city: nullIfEmpty(paymentRecord.customer_city),
      country: nullIfEmpty(paymentRecord.customer_country),
      email: normalizedEmail,
      fullName: nullIfEmpty(paymentRecord.customer_full_name),
      normalizedEmail,
      postalCode: nullIfEmpty(paymentRecord.customer_postal_code),
      telegramUsername: nullIfEmpty(paymentRecord.customer_nickname),
      updatedAt: now,
    })
    .returning({ id: customers.id });

  return savedCustomer.id;
};

const findPaymentOffer = (
  externalOfferId: string,
  transaction: PaymentRecordTransaction,
) =>
  transaction
    .select({
      id: productOffers.id,
      productId: productOffers.productId,
    })
    .from(productOffers)
    .where(eq(productOffers.externalOfferId, externalOfferId))
    .limit(1);

const findPaymentProduct = (
  externalProductId: string,
  transaction: PaymentRecordTransaction,
) =>
  transaction
    .select({ id: products.id })
    .from(products)
    .where(eq(products.externalProductId, externalProductId))
    .limit(1);

const upsertPaymentPurchase = async ({
  customerId,
  normalizedEmail,
  offer,
  paymentIntentId,
  paymentRecord,
  productId,
  transaction,
}: {
  customerId: string | null;
  normalizedEmail: string;
  offer: PaymentOfferReference | undefined;
  paymentIntentId: string;
  paymentRecord: PaymentSheetRecord;
  productId: string | null;
  transaction: PaymentRecordTransaction;
}): Promise<{
  firstSeenAt: Date;
  purchaseId: string;
}> => {
  const firstSeenAt = parseRequiredDate(
    paymentRecord.first_seen_at || paymentRecord.updated_at,
  );
  const existingPurchase = await transaction
    .select({
      settlementAmountMinor: purchases.settlementAmountMinor,
      settlementCurrency: purchases.settlementCurrency,
      stripeBalanceTransactionId: purchases.stripeBalanceTransactionId,
      stripeExchangeRate: purchases.stripeExchangeRate,
      stripeFeeAmountMinor: purchases.stripeFeeAmountMinor,
      stripeNetAmountMinor: purchases.stripeNetAmountMinor,
      succeededAt: purchases.succeededAt,
    })
    .from(purchases)
    .where(eq(purchases.paymentIntentId, paymentIntentId))
    .limit(1);
  // Sheet-compatible records do not carry settlement data, so mirrors must retain it.
  const purchaseValues = {
    amountMinor: parseInteger(paymentRecord.amount),
    checkoutCurrency: nullIfEmpty(paymentRecord.checkout_currency),
    checkoutLocale: normalizeCheckoutLocale(paymentRecord.checkout_locale),
    checkoutSessionId: nullIfEmpty(paymentRecord.checkout_session_id),
    currency:
      trim(paymentRecord.currency) || trim(paymentRecord.checkout_currency) || "pln",
    customerAddressLineSnapshot: nullIfEmpty(paymentRecord.customer_address),
    customerCitySnapshot: nullIfEmpty(paymentRecord.customer_city),
    customerCountrySnapshot: nullIfEmpty(paymentRecord.customer_country),
    customerEmailSnapshot: normalizedEmail || nullIfEmpty(paymentRecord.customer_email),
    customerFullNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
    customerId,
    customerPostalCodeSnapshot: nullIfEmpty(paymentRecord.customer_postal_code),
    customerTelegramUsernameSnapshot: nullIfEmpty(paymentRecord.customer_nickname),
    inspirationChatIdSnapshot: nullIfEmpty(paymentRecord.telegram_inspiration_chat_id),
    lastPaymentErrorCode: nullIfEmpty(paymentRecord.last_payment_error_code),
    lastPaymentErrorMessage: nullIfEmpty(paymentRecord.last_payment_error_message),
    latestEventId: nullIfEmpty(paymentRecord.latest_event_id),
    latestEventType: nullIfEmpty(paymentRecord.latest_event_type),
    lessonLanguage: normalizeLessonLanguage(paymentRecord.lesson_language),
    offerExternalId: nullIfEmpty(paymentRecord.offer_id),
    offerId: offer?.id ?? null,
    offerLabelSnapshot: nullIfEmpty(paymentRecord.offer_label),
    outcome: normalizeOutcome(paymentRecord.outcome),
    productExternalId: nullIfEmpty(paymentRecord.product_id),
    productId,
    productTitleSnapshot: nullIfEmpty(paymentRecord.product_title),
    purchaseItemSnapshot: nullIfEmpty(paymentRecord.purchase_item),
    settlementAmountMinor: existingPurchase[0]?.settlementAmountMinor ?? null,
    settlementCurrency: existingPurchase[0]?.settlementCurrency ?? null,
    source: getPurchaseSource(paymentIntentId),
    stripeBalanceTransactionId: existingPurchase[0]?.stripeBalanceTransactionId ?? null,
    stripeExchangeRate: existingPurchase[0]?.stripeExchangeRate ?? null,
    stripeFeeAmountMinor: existingPurchase[0]?.stripeFeeAmountMinor ?? null,
    stripeNetAmountMinor: existingPurchase[0]?.stripeNetAmountMinor ?? null,
    stripeStatus: trim(paymentRecord.status) || "unknown",
    succeededAt: getSaleTimestamp() ?? existingPurchase[0]?.succeededAt ?? null,
    updatedAt: parseRequiredDate(paymentRecord.updated_at, firstSeenAt),
  };
  const [savedPurchase] = await transaction
    .insert(purchases)
    .values({
      ...purchaseValues,
      firstSeenAt,
      paymentIntentId,
    })
    .onConflictDoUpdate({
      set: purchaseValues,
      target: purchases.paymentIntentId,
    })
    .returning({ id: purchases.id });

  return {
    firstSeenAt,
    purchaseId: savedPurchase.id,
  };
};

const upsertPaymentEntitlement = async ({
  customerId,
  now,
  offer,
  paymentRecord,
  productId,
  purchaseId,
  transaction,
}: {
  customerId: string | null;
  now: Date;
  offer: PaymentOfferReference | undefined;
  paymentRecord: PaymentSheetRecord;
  productId: string | null;
  purchaseId: string;
  transaction: PaymentRecordTransaction;
}): Promise<void> => {
  await transaction
    .insert(accessEntitlements)
    .values({
      accessKey: "primary",
      accessWorkflow: nullIfEmpty(paymentRecord.access_workflow),
      currentTokenId: nullIfEmpty(paymentRecord.telegram_token_id),
      customerId,
      deliveryChannel: nullIfEmpty(paymentRecord.delivery_channel),
      expiresAt: parseDate(paymentRecord.telegram_access_expires_at),
      externalTargetType: getExternalTargetType(paymentRecord),
      offerId: offer?.id ?? null,
      productId,
      purchaseId,
      revokedAt: parseDate(paymentRecord.telegram_access_revoked_at),
      startsAt: parseDate(paymentRecord.telegram_token_used_at),
      status: normalizeAccessStatus(paymentRecord.telegram_access_status, paymentRecord),
      telegramChatId: nullIfEmpty(paymentRecord.telegram_channel_chat_id),
      telegramUserId: nullIfEmpty(paymentRecord.telegram_user_id),
      telegramUsername: nullIfEmpty(paymentRecord.telegram_username),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        accessWorkflow: nullIfEmpty(paymentRecord.access_workflow),
        currentTokenId: nullIfEmpty(paymentRecord.telegram_token_id),
        customerId,
        deliveryChannel: nullIfEmpty(paymentRecord.delivery_channel),
        expiresAt: parseDate(paymentRecord.telegram_access_expires_at),
        externalTargetType: getExternalTargetType(paymentRecord),
        offerId: offer?.id ?? null,
        productId,
        revokedAt: parseDate(paymentRecord.telegram_access_revoked_at),
        startsAt: parseDate(paymentRecord.telegram_token_used_at),
        status: normalizeAccessStatus(
          paymentRecord.telegram_access_status,
          paymentRecord,
        ),
        telegramChatId: nullIfEmpty(paymentRecord.telegram_channel_chat_id),
        telegramUserId: nullIfEmpty(paymentRecord.telegram_user_id),
        telegramUsername: nullIfEmpty(paymentRecord.telegram_username),
        updatedAt: now,
      },
      target: [accessEntitlements.purchaseId, accessEntitlements.accessKey],
    });
};

const upsertPaymentInvoice = async ({
  firstSeenAt,
  normalizedEmail,
  now,
  parsedInvoice,
  paymentRecord,
  purchaseId,
  transaction,
}: {
  firstSeenAt: Date;
  normalizedEmail: string;
  now: Date;
  parsedInvoice: ParsedInvoice;
  paymentRecord: PaymentSheetRecord;
  purchaseId: string;
  transaction: PaymentRecordTransaction;
}): Promise<void> => {
  const issuedAt = parseRequiredDate(paymentRecord.invoice_issued_at, firstSeenAt);

  await transaction
    .insert(invoices)
    .values({
      amountMinor: parseInteger(paymentRecord.amount),
      buyerAddressSnapshot: [
        paymentRecord.customer_address.trim(),
        paymentRecord.customer_city.trim(),
        paymentRecord.customer_postal_code.trim(),
        paymentRecord.customer_country.trim(),
      ]
        .filter(Boolean)
        .join(", "),
      buyerEmailSnapshot: normalizedEmail || nullIfEmpty(paymentRecord.customer_email),
      buyerNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
      currency:
        trim(paymentRecord.checkout_currency) || trim(paymentRecord.currency) || "pln",
      invoiceNumber: paymentRecord.invoice_number.trim(),
      issuedAt,
      purchaseId,
      sequenceMonth: parsedInvoice.sequenceMonth,
      sequenceNumber: parsedInvoice.sequenceNumber,
      sequenceYear: parsedInvoice.sequenceYear,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        amountMinor: parseInteger(paymentRecord.amount),
        buyerEmailSnapshot: normalizedEmail || nullIfEmpty(paymentRecord.customer_email),
        buyerNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
        currency:
          trim(paymentRecord.checkout_currency) || trim(paymentRecord.currency) || "pln",
        issuedAt,
        sequenceMonth: parsedInvoice.sequenceMonth,
        sequenceNumber: parsedInvoice.sequenceNumber,
        sequenceYear: parsedInvoice.sequenceYear,
        updatedAt: now,
      },
      target: invoices.purchaseId,
    });
};

const upsertPaymentSideEffects = async ({
  paymentRecord,
  purchaseId,
  transaction,
}: {
  paymentRecord: PaymentSheetRecord;
  purchaseId: string;
  transaction: PaymentRecordTransaction;
}): Promise<void> => {
  for (const sideEffect of getPaymentSideEffects(paymentRecord)) {
    await transaction
      .insert(purchaseSideEffects)
      .values({
        failedAt: sideEffect.status === "failed" ? sideEffect.updatedAt : null,
        kind: sideEffect.kind,
        provider: sideEffect.provider,
        purchaseId,
        sentAt: sideEffect.status === "sent" ? sideEffect.updatedAt : null,
        status: sideEffect.status,
        updatedAt: sideEffect.updatedAt,
      })
      .onConflictDoUpdate({
        set: {
          failedAt: sideEffect.status === "failed" ? sideEffect.updatedAt : null,
          provider: sideEffect.provider,
          sentAt: sideEffect.status === "sent" ? sideEffect.updatedAt : null,
          status: sideEffect.status,
          updatedAt: sideEffect.updatedAt,
        },
        target: [purchaseSideEffects.purchaseId, purchaseSideEffects.kind],
      });
  }
};

export const upsertPaymentRecordToDatabase = async (
  paymentRecord: PaymentSheetRecord,
) => {
  const db = getDatabase();
  const now = new Date();
  const paymentIntentId = paymentRecord.payment_intent_id.trim();

  if (!paymentIntentId) {
    return paymentRecord;
  }

  await db.transaction(async (tx) => {
    const normalizedEmail = normalizeEmail(paymentRecord.customer_email);
    const customerId = normalizedEmail
      ? await upsertPaymentCustomer({
          normalizedEmail,
          now,
          paymentRecord,
          transaction: tx,
        })
      : null;

    const [offer] = paymentRecord.offer_id.trim()
      ? await findPaymentOffer(paymentRecord.offer_id.trim(), tx)
      : [];
    const [product] = paymentRecord.product_id.trim()
      ? await findPaymentProduct(paymentRecord.product_id.trim(), tx)
      : [];
    const productId = product?.id ?? offer?.productId ?? null;
    const { firstSeenAt, purchaseId } = await upsertPaymentPurchase({
      customerId,
      normalizedEmail,
      offer,
      paymentIntentId,
      paymentRecord,
      productId,
      transaction: tx,
    });

    await upsertPaymentEntitlement({
      customerId,
      now,
      offer,
      paymentRecord,
      productId,
      purchaseId,
      transaction: tx,
    });

    const parsedInvoice = parseInvoiceNumber(paymentRecord.invoice_number);

    if (parsedInvoice) {
      await upsertPaymentInvoice({
        firstSeenAt,
        normalizedEmail,
        now,
        parsedInvoice,
        paymentRecord,
        purchaseId,
        transaction: tx,
      });
    }

    await upsertPaymentSideEffects({
      paymentRecord,
      purchaseId,
      transaction: tx,
    });
  });

  return (
    (await findPaymentRecordByIntentIdFromDatabase(paymentIntentId)) ?? paymentRecord
  );
};

export const listSucceededPaymentRecordsFromDatabaseInUtcRange = async ({
  endUtcIsoExclusive,
  startUtcIso,
}: {
  endUtcIsoExclusive: string;
  startUtcIso: string;
}) => {
  const startDate = new Date(startUtcIso);
  const endDate = new Date(endUtcIsoExclusive);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return [] as PaymentSheetRecord[];
  }

  const db = getDatabase();
  const rows = await db
    .select({
      purchase: purchases,
    })
    .from(purchases)
    .innerJoin(
      stripeEvents,
      and(
        eq(stripeEvents.paymentIntentId, purchases.paymentIntentId),
        eq(stripeEvents.eventType, "payment_intent.succeeded"),
      ),
    )
    .where(
      and(
        eq(purchases.outcome, "succeeded"),
        eq(purchases.source, "stripe"),
        eq(stripeEvents.processingStatus, "processed"),
        eq(stripeEvents.outcomeSnapshot, "succeeded"),
        gte(stripeEvents.stripeCreatedAt, startDate),
        lt(stripeEvents.stripeCreatedAt, endDate),
      ),
    )
    .orderBy(asc(stripeEvents.stripeCreatedAt), asc(purchases.paymentIntentId));
  const seenPaymentIntentIds = new Set<string>();
  const purchasesByFirstSucceededEvent = rows
    .map((row) => row.purchase)
    .filter((purchase) => {
      if (seenPaymentIntentIds.has(purchase.paymentIntentId)) {
        return false;
      }

      seenPaymentIntentIds.add(purchase.paymentIntentId);
      return true;
    });
  const records = await hydratePaymentRecords(purchasesByFirstSucceededEvent);

  return records;
};
