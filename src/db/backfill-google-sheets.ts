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

const normalizeEmailSendStatus = (value: string): "pending" | "sent" | "failed" => {
  const normalizedValue = trim(value);

  if (
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

    await db.transaction(async (tx) => {
      const purchaseIdByPaymentIntentId = new Map<string, string>();
      const entitlementIdByPaymentIntentId = new Map<string, string>();
      const paymentRecords = records.paymentRecords
        .filter((row) => row.payment_intent_id.trim())
        .slice(0, limit ?? undefined);

      for (const paymentRecord of paymentRecords) {
        const paymentIntentId = paymentRecord.payment_intent_id.trim();
        const normalizedEmail = normalizeEmail(paymentRecord.customer_email);
        let customerId: string | null = null;

        if (normalizedEmail) {
          const existingCustomerId = customerIdByEmail.get(normalizedEmail);

          if (existingCustomerId) {
            customerId = existingCustomerId;
            await tx
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
              .where(eq(customers.id, existingCustomerId));
          } else {
            const [savedCustomer] = await tx
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

            customerId = savedCustomer.id;
            customerIdByEmail.set(normalizedEmail, savedCustomer.id);
            stats.customers += 1;
          }
        }

        const offer = offerLookup.byExternalId.get(paymentRecord.offer_id.trim());
        const productId =
          productLookup.byExternalId.get(paymentRecord.product_id.trim()) ??
          offer?.productId ??
          null;
        const firstSeenAt = parseRequiredDate(
          paymentRecord.first_seen_at || paymentRecord.updated_at,
        );
        const [savedPurchase] = await tx
          .insert(purchases)
          .values({
            amountMinor: parseInteger(paymentRecord.amount),
            checkoutCurrency: nullIfEmpty(paymentRecord.checkout_currency),
            checkoutLocale: normalizeCheckoutLocale(paymentRecord.checkout_locale),
            checkoutSessionId: nullIfEmpty(paymentRecord.checkout_session_id),
            currency:
              trim(paymentRecord.currency) ||
              trim(paymentRecord.checkout_currency) ||
              "pln",
            customerAddressLineSnapshot: nullIfEmpty(paymentRecord.customer_address),
            customerCitySnapshot: nullIfEmpty(paymentRecord.customer_city),
            customerCountrySnapshot: nullIfEmpty(paymentRecord.customer_country),
            customerEmailSnapshot: normalizedEmail || null,
            customerFullNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
            customerId,
            customerPostalCodeSnapshot: nullIfEmpty(paymentRecord.customer_postal_code),
            customerTelegramUsernameSnapshot: nullIfEmpty(
              paymentRecord.customer_nickname,
            ),
            firstSeenAt,
            lastPaymentErrorCode: nullIfEmpty(paymentRecord.last_payment_error_code),
            lastPaymentErrorMessage: nullIfEmpty(
              paymentRecord.last_payment_error_message,
            ),
            latestEventId: nullIfEmpty(paymentRecord.latest_event_id),
            latestEventType: nullIfEmpty(paymentRecord.latest_event_type),
            lessonLanguage: normalizeLessonLanguage(paymentRecord.lesson_language),
            offerExternalId: nullIfEmpty(paymentRecord.offer_id),
            offerId: offer?.id ?? null,
            offerLabelSnapshot: nullIfEmpty(paymentRecord.offer_label),
            outcome: normalizeOutcome(paymentRecord.outcome),
            paymentIntentId,
            productExternalId: nullIfEmpty(paymentRecord.product_id),
            productId,
            productTitleSnapshot: nullIfEmpty(paymentRecord.product_title),
            purchaseItemSnapshot: nullIfEmpty(paymentRecord.purchase_item),
            source: getPurchaseSource(paymentIntentId),
            stripeStatus: trim(paymentRecord.status) || "unknown",
            succeededAt: getSaleTimestamp(),
            updatedAt: parseRequiredDate(paymentRecord.updated_at, firstSeenAt),
          })
          .onConflictDoUpdate({
            set: {
              amountMinor: parseInteger(paymentRecord.amount),
              checkoutCurrency: nullIfEmpty(paymentRecord.checkout_currency),
              checkoutLocale: normalizeCheckoutLocale(paymentRecord.checkout_locale),
              checkoutSessionId: nullIfEmpty(paymentRecord.checkout_session_id),
              currency:
                trim(paymentRecord.currency) ||
                trim(paymentRecord.checkout_currency) ||
                "pln",
              customerAddressLineSnapshot: nullIfEmpty(paymentRecord.customer_address),
              customerCitySnapshot: nullIfEmpty(paymentRecord.customer_city),
              customerCountrySnapshot: nullIfEmpty(paymentRecord.customer_country),
              customerEmailSnapshot: normalizedEmail || null,
              customerFullNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
              customerId,
              customerPostalCodeSnapshot: nullIfEmpty(paymentRecord.customer_postal_code),
              customerTelegramUsernameSnapshot: nullIfEmpty(
                paymentRecord.customer_nickname,
              ),
              lastPaymentErrorCode: nullIfEmpty(paymentRecord.last_payment_error_code),
              lastPaymentErrorMessage: nullIfEmpty(
                paymentRecord.last_payment_error_message,
              ),
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
              source: getPurchaseSource(paymentIntentId),
              stripeStatus: trim(paymentRecord.status) || "unknown",
              updatedAt: parseRequiredDate(paymentRecord.updated_at, firstSeenAt),
            },
            target: purchases.paymentIntentId,
          })
          .returning({ id: purchases.id });

        stats.purchases += 1;
        purchaseIdByPaymentIntentId.set(paymentIntentId, savedPurchase.id);

        const [savedEntitlement] = await tx
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
            purchaseId: savedPurchase.id,
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
          })
          .returning({ id: accessEntitlements.id });

        stats.accessEntitlements += 1;
        entitlementIdByPaymentIntentId.set(paymentIntentId, savedEntitlement.id);

        const parsedInvoice = parseInvoiceNumber(paymentRecord.invoice_number);

        if (paymentRecord.invoice_number.trim() && parsedInvoice) {
          const issuedAt = parseRequiredDate(
            paymentRecord.invoice_issued_at,
            firstSeenAt,
          );

          await tx
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
              buyerEmailSnapshot: normalizedEmail || null,
              buyerNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
              currency:
                trim(paymentRecord.checkout_currency) ||
                trim(paymentRecord.currency) ||
                "pln",
              invoiceNumber: paymentRecord.invoice_number.trim(),
              issuedAt,
              purchaseId: savedPurchase.id,
              sequenceMonth: parsedInvoice.sequenceMonth,
              sequenceNumber: parsedInvoice.sequenceNumber,
              sequenceYear: parsedInvoice.sequenceYear,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              set: {
                amountMinor: parseInteger(paymentRecord.amount),
                buyerEmailSnapshot: normalizedEmail || null,
                buyerNameSnapshot: nullIfEmpty(paymentRecord.customer_full_name),
                currency:
                  trim(paymentRecord.checkout_currency) ||
                  trim(paymentRecord.currency) ||
                  "pln",
                issuedAt,
                sequenceMonth: parsedInvoice.sequenceMonth,
                sequenceNumber: parsedInvoice.sequenceNumber,
                sequenceYear: parsedInvoice.sequenceYear,
                updatedAt: now,
              },
              target: invoices.purchaseId,
            });

          stats.invoices += 1;
        } else if (paymentRecord.invoice_number.trim()) {
          stats.skippedInvoices += 1;
        }

        for (const sideEffect of getPaymentSideEffects(paymentRecord)) {
          await tx
            .insert(purchaseSideEffects)
            .values({
              failedAt: sideEffect.status === "failed" ? sideEffect.updatedAt : null,
              provider: sideEffect.provider,
              purchaseId: savedPurchase.id,
              sentAt: sideEffect.status === "sent" ? sideEffect.updatedAt : null,
              status: sideEffect.status,
              kind: sideEffect.kind,
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

          stats.purchaseSideEffects += 1;
        }
      }

      for (const eventRecord of records.stripeEventRecords.filter((row) =>
        row.event_id.trim(),
      )) {
        const purchaseId = purchaseIdByPaymentIntentId.get(
          eventRecord.payment_intent_id.trim(),
        );

        await tx
          .insert(stripeEvents)
          .values({
            eventType: eventRecord.event_type.trim() || "unknown",
            outcomeSnapshot: nullIfEmpty(eventRecord.outcome),
            payload: {
              source: "google_sheets_backfill",
            },
            paymentIntentId: nullIfEmpty(eventRecord.payment_intent_id),
            paymentStatusSnapshot: nullIfEmpty(eventRecord.status),
            processedAt: parseDate(eventRecord.processed_at) ?? now,
            processingStatus: "processed",
            purchaseId: purchaseId ?? null,
            stripeEventId: eventRecord.event_id.trim(),
            updatedAt: now,
          })
          .onConflictDoUpdate({
            set: {
              eventType: eventRecord.event_type.trim() || "unknown",
              outcomeSnapshot: nullIfEmpty(eventRecord.outcome),
              paymentIntentId: nullIfEmpty(eventRecord.payment_intent_id),
              paymentStatusSnapshot: nullIfEmpty(eventRecord.status),
              processedAt: parseDate(eventRecord.processed_at) ?? now,
              processingStatus: "processed",
              purchaseId: purchaseId ?? null,
              updatedAt: now,
            },
            target: stripeEvents.stripeEventId,
          });

        stats.stripeEvents += 1;

        if (!purchaseId && eventRecord.payment_intent_id.trim()) {
          stats.skippedStripeEvents += 1;
        }
      }

      for (const tokenRecord of records.telegramTokenRecords.filter((row) =>
        row.token_id.trim(),
      )) {
        const paymentIntentId = tokenRecord.payment_intent_id.trim();
        const purchaseId = purchaseIdByPaymentIntentId.get(paymentIntentId);

        if (!purchaseId) {
          stats.skippedTelegramAccessTokens += 1;
          continue;
        }

        const offer = offerLookup.byExternalId.get(tokenRecord.offer_id.trim());
        const productId =
          productLookup.byExternalId.get(tokenRecord.product_id.trim()) ??
          offer?.productId ??
          null;

        await tx
          .insert(telegramAccessTokens)
          .values({
            accessExpiresAt: parseDate(tokenRecord.access_expires_at),
            chatId: tokenRecord.chat_id.trim(),
            customerEmailSnapshot: nullIfEmpty(tokenRecord.customer_email),
            entitlementId: entitlementIdByPaymentIntentId.get(paymentIntentId) ?? null,
            expiresAt: parseRequiredDate(
              tokenRecord.expires_at,
              parseRequiredDate(tokenRecord.created_at),
            ),
            lastError: nullIfEmpty(tokenRecord.last_error),
            linkKind:
              tokenRecord.link_kind.trim() === "start_token"
                ? "start_token"
                : "channel_invite",
            offerId: offer?.id ?? null,
            productId,
            purchaseId,
            status: normalizeTokenStatus(tokenRecord.status),
            telegramUserId: nullIfEmpty(tokenRecord.telegram_user_id),
            telegramUsername: nullIfEmpty(tokenRecord.telegram_username),
            tokenHash: tokenRecord.token_hash.trim() || tokenRecord.token_id.trim(),
            tokenId: tokenRecord.token_id.trim(),
            tokenValue: nullIfEmpty(tokenRecord.token_value),
            usedAt: parseDate(tokenRecord.used_at),
            updatedAt: now,
          })
          .onConflictDoUpdate({
            set: {
              accessExpiresAt: parseDate(tokenRecord.access_expires_at),
              chatId: tokenRecord.chat_id.trim(),
              customerEmailSnapshot: nullIfEmpty(tokenRecord.customer_email),
              entitlementId: entitlementIdByPaymentIntentId.get(paymentIntentId) ?? null,
              expiresAt: parseRequiredDate(
                tokenRecord.expires_at,
                parseRequiredDate(tokenRecord.created_at),
              ),
              lastError: nullIfEmpty(tokenRecord.last_error),
              linkKind:
                tokenRecord.link_kind.trim() === "start_token"
                  ? "start_token"
                  : "channel_invite",
              offerId: offer?.id ?? null,
              productId,
              purchaseId,
              status: normalizeTokenStatus(tokenRecord.status),
              telegramUserId: nullIfEmpty(tokenRecord.telegram_user_id),
              telegramUsername: nullIfEmpty(tokenRecord.telegram_username),
              tokenHash: tokenRecord.token_hash.trim() || tokenRecord.token_id.trim(),
              tokenValue: nullIfEmpty(tokenRecord.token_value),
              usedAt: parseDate(tokenRecord.used_at),
              updatedAt: now,
            },
            target: telegramAccessTokens.tokenId,
          });

        stats.telegramAccessTokens += 1;
      }

      for (const bindingRecord of records.telegramBindingRecords.filter((row) =>
        row.payment_intent_id.trim(),
      )) {
        const paymentIntentId = bindingRecord.payment_intent_id.trim();
        const purchaseId = purchaseIdByPaymentIntentId.get(paymentIntentId);

        if (!purchaseId || !bindingRecord.telegram_user_id.trim()) {
          stats.skippedTelegramUserBindings += 1;
          continue;
        }

        const offer = offerLookup.byExternalId.get(bindingRecord.offer_id.trim());
        const productId =
          productLookup.byExternalId.get(bindingRecord.product_id.trim()) ??
          offer?.productId ??
          null;

        await tx
          .insert(telegramUserBindings)
          .values({
            accessExpiresAt: parseDate(bindingRecord.access_expires_at),
            boundAt: parseRequiredDate(bindingRecord.bound_at),
            chatId: bindingRecord.chat_id.trim(),
            customerEmailSnapshot: nullIfEmpty(bindingRecord.customer_email),
            entitlementId: entitlementIdByPaymentIntentId.get(paymentIntentId) ?? null,
            inviteLink: nullIfEmpty(bindingRecord.invite_link),
            lastSeenAt: parseRequiredDate(
              bindingRecord.last_seen_at,
              parseRequiredDate(bindingRecord.bound_at),
            ),
            offerId: offer?.id ?? null,
            productId,
            purchaseId,
            revokedAt: parseDate(bindingRecord.revoked_at),
            revokedReason: nullIfEmpty(bindingRecord.revoked_reason),
            status: normalizeBindingStatus(bindingRecord.status),
            telegramUserId: bindingRecord.telegram_user_id.trim(),
            telegramUsername: nullIfEmpty(bindingRecord.telegram_username),
            updatedAt: now,
          })
          .onConflictDoUpdate({
            set: {
              accessExpiresAt: parseDate(bindingRecord.access_expires_at),
              boundAt: parseRequiredDate(bindingRecord.bound_at),
              customerEmailSnapshot: nullIfEmpty(bindingRecord.customer_email),
              entitlementId: entitlementIdByPaymentIntentId.get(paymentIntentId) ?? null,
              inviteLink: nullIfEmpty(bindingRecord.invite_link),
              lastSeenAt: parseRequiredDate(
                bindingRecord.last_seen_at,
                parseRequiredDate(bindingRecord.bound_at),
              ),
              offerId: offer?.id ?? null,
              productId,
              revokedAt: parseDate(bindingRecord.revoked_at),
              revokedReason: nullIfEmpty(bindingRecord.revoked_reason),
              status: normalizeBindingStatus(bindingRecord.status),
              telegramUsername: nullIfEmpty(bindingRecord.telegram_username),
              updatedAt: now,
            },
            target: [telegramUserBindings.purchaseId, telegramUserBindings.chatId],
          });

        stats.telegramUserBindings += 1;
      }

      for (const reportRecord of records.monthlyReportRecords.filter((row) =>
        row.report_key.trim(),
      )) {
        await tx
          .insert(monthlyReportRuns)
          .values({
            csvSha256: nullIfEmpty(reportRecord.csv_sha256),
            deliveredAtUtc: parseDate(reportRecord.delivered_at_utc),
            deliveredTo: nullIfEmpty(reportRecord.delivered_to),
            deliveryStatus: normalizeDeliveryStatus(reportRecord.delivery_status),
            generatedAtUtc: parseRequiredDate(reportRecord.generated_at_utc),
            periodEndUtc: parseRequiredDate(reportRecord.period_end_utc),
            periodStartUtc: parseRequiredDate(reportRecord.period_start_utc),
            reportFamily: reportRecord.report_family.trim() || "monthly_sales",
            reportKey: reportRecord.report_key.trim(),
            rowCount: parseInteger(reportRecord.row_count),
            updatedAt: now,
          })
          .onConflictDoUpdate({
            set: {
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
            },
            target: monthlyReportRuns.reportKey,
          });

        stats.monthlyReportRuns += 1;
      }

      for (const leadRecord of records.emailLeadRecords.filter((row) =>
        row.lead_id.trim(),
      )) {
        const normalizedEmail = normalizeEmail(leadRecord.email);

        await tx
          .insert(emailCampaignLeads)
          .values({
            campaignKey: leadRecord.campaign_key.trim(),
            createdAt: parseRequiredDate(leadRecord.created_at),
            email: normalizedEmail,
            emailSendAttempts: parseInteger(leadRecord.email_send_attempts),
            emailSendStatus: normalizeEmailSendStatus(leadRecord.email_send_status),
            emailSentAt: parseDate(leadRecord.email_sent_at),
            fullName: leadRecord.full_name.trim(),
            lastEmailError: leadRecord.last_email_error.trim(),
            leadId: leadRecord.lead_id.trim(),
            locale: leadRecord.locale.trim(),
            normalizedEmail,
            socialContact: leadRecord.social_contact.trim(),
            updatedAt: now,
          })
          .onConflictDoUpdate({
            set: {
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
            },
            target: emailCampaignLeads.leadId,
          });

        stats.emailCampaignLeads += 1;
      }
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
