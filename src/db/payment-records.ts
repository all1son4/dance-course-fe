import { and, desc, eq, inArray } from "drizzle-orm";

import {
  createEmptyPaymentRecord,
  type PaymentRecordSnapshot,
} from "@/lib/payment-record";

import { getDatabase } from "./client";
import { accessEntitlements, invoices, purchases, purchaseSideEffects } from "./schema";

const trim = (value: string | null | undefined) => value?.trim() ?? "";

type PaymentSideEffectStatus = "pending" | "sending" | "sent" | "skipped" | "failed";
type StoredPaymentSideEffectStatus = PaymentSideEffectStatus | "dead_letter";

const LEASED_PAYMENT_SIDE_EFFECT_STATUSES = new Set<PaymentSideEffectStatus>([
  "pending",
  "sending",
]);

const serializePaymentSideEffectStatus = (
  sideEffect:
    | {
        leaseToken: string | null;
        status: StoredPaymentSideEffectStatus;
      }
    | null
    | undefined,
) => {
  if (!sideEffect) {
    return "";
  }

  if (sideEffect.status === "dead_letter") {
    return "failed";
  }

  const leaseToken = trim(sideEffect.leaseToken);

  return leaseToken && LEASED_PAYMENT_SIDE_EFFECT_STATUSES.has(sideEffect.status)
    ? `${sideEffect.status}:${leaseToken}`
    : sideEffect.status;
};

const toIso = (date: Date | null | undefined) => date?.toISOString() ?? "";

type PurchaseRow = typeof purchases.$inferSelect;
type EntitlementRow = typeof accessEntitlements.$inferSelect;
type InvoiceRow = typeof invoices.$inferSelect;
type SideEffectRow = typeof purchaseSideEffects.$inferSelect;
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
    if (!sideEffect.purchaseId) {
      continue;
    }

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
}: {
  purchase: PurchaseRow;
  record: PaymentRecordSnapshot;
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
  record: PaymentRecordSnapshot;
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
}: {
  alertSideEffect: SideEffectRow | undefined;
  emailSideEffect: SideEffectRow | undefined;
  invoice: InvoiceRow | undefined;
  purchase: PurchaseRow;
  record: PaymentRecordSnapshot;
}): void => {
  record.email_delivery_status = serializePaymentSideEffectStatus(emailSideEffect);
  record.email_delivery_updated_at = toIso(emailSideEffect?.updatedAt);
  record.with_mentor_alert_status = serializePaymentSideEffectStatus(alertSideEffect);
  record.with_mentor_alert_updated_at = toIso(alertSideEffect?.updatedAt);
  record.customer_address = purchase.customerAddressLineSnapshot ?? "";
  record.customer_city = purchase.customerCitySnapshot ?? "";
  record.customer_postal_code = purchase.customerPostalCodeSnapshot ?? "";
  record.invoice_number = invoice?.invoiceNumber ?? "";
  record.invoice_issued_at = toIso(invoice?.issuedAt);
};

const hydratePaymentRecord = (
  purchase: PurchaseRow,
  lookups: PaymentRecordHydrationLookups,
): PaymentRecordSnapshot => {
  const record = createEmptyPaymentRecord();
  const entitlement = lookups.entitlementByPurchaseId.get(purchase.id);
  const invoice = lookups.invoiceByPurchaseId.get(purchase.id);
  const sideEffects = lookups.sideEffectsByPurchaseId.get(purchase.id) ?? [];
  const emailSideEffect = sideEffects.find(
    (sideEffect) => sideEffect.kind === "purchase_success_email",
  );
  const alertSideEffect = sideEffects.find(
    (sideEffect) => sideEffect.kind === "admin_telegram_alert",
  );

  populatePurchaseFields({
    purchase,
    record,
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
  });

  return record;
};

const hydratePaymentRecords = async (
  purchaseRows: PurchaseRow[],
): Promise<PaymentRecordSnapshot[]> => {
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
      .where(
        and(
          inArray(purchaseSideEffects.purchaseId, purchaseIds),
          inArray(purchaseSideEffects.kind, [
            "purchase_success_email",
            "admin_telegram_alert",
          ]),
        ),
      ),
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
    .orderBy(desc(purchases.updatedAt), desc(purchases.firstSeenAt), desc(purchases.id))
    .limit(1);
  const records = await hydratePaymentRecords(rows);

  return records[0] ?? null;
};
