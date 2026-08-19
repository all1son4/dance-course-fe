import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    externalProductId: text("external_product_id").notNull(),
    slug: text("slug").notNull(),
    type: text("type").notNull().$type<"course" | "choreo">(),
    title: text("title").notNull(),
    titleKey: text("title_key"),
    description: jsonb("description").notNull().$type<string[]>(),
    descriptionKeys: jsonb("description_keys").notNull().$type<string[]>(),
    accessNote: text("access_note"),
    accessNoteKey: text("access_note_key"),
    defaultOfferExternalId: text("default_offer_external_id"),
    isActive: boolean("is_active").notNull().default(true),
    // `isActive` says the product exists in the catalogue at all; `salesEnabled`
    // says money may be taken for it. Closing sales keeps the product - and its
    // prices - readable so the storefront can render "closed" instead of an error.
    salesEnabled: boolean("sales_enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("products_type_check", sql`${table.type} IN ('course', 'choreo')`),
    uniqueIndex("products_code_idx").on(table.code),
    uniqueIndex("products_external_product_id_idx").on(table.externalProductId),
    uniqueIndex("products_slug_idx").on(table.slug),
  ],
);

export const productOffers = pgTable(
  "product_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalOfferId: text("external_offer_id").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    code: text("code")
      .notNull()
      .$type<
        | "standard"
        | "library-access"
        | "without-mentor"
        | "with-mentor"
        | "renewal-discount"
        | "renewal-library-access"
      >(),
    label: text("label").notNull(),
    labelKey: text("label_key"),
    deliveryChannel: text("delivery_channel"),
    accessWorkflow: text("access_workflow"),
    telegramAccessDurationDays: integer("telegram_access_duration_days"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "product_offers_code_check",
      sql`${table.code} IN (
        'standard',
        'library-access',
        'without-mentor',
        'with-mentor',
        'renewal-discount',
        'renewal-library-access'
      )`,
    ),
    check(
      "product_offers_ranges_check",
      sql`${table.sortOrder} >= 0
        AND (${table.telegramAccessDurationDays} IS NULL
          OR ${table.telegramAccessDurationDays} >= 0)`,
    ),
    uniqueIndex("product_offers_external_offer_id_idx").on(table.externalOfferId),
    uniqueIndex("product_offers_id_product_id_idx").on(table.id, table.productId),
    index("product_offers_product_id_idx").on(table.productId),
    index("product_offers_product_code_idx").on(table.productId, table.code),
  ],
);

export const telegramChats = pgTable(
  "telegram_chats",
  {
    chatId: text("chat_id").primaryKey(),
    title: text("title").notNull(),
    type: text("type").notNull(),
    registeredByTelegramUserId: text("registered_by_telegram_user_id"),
    registeredByTelegramUsername: text("registered_by_telegram_username"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("telegram_chats_is_active_idx").on(table.isActive),
    index("telegram_chats_title_idx").on(table.title),
  ],
);

export const renewalCampaigns = pgTable(
  "renewal_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    sourceChatId: text("source_chat_id")
      .notNull()
      .references(() => telegramChats.chatId, { onDelete: "restrict" }),
    targetChatId: text("target_chat_id")
      .notNull()
      .references(() => telegramChats.chatId, { onDelete: "restrict" }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    offerId: uuid("offer_id").references(() => productOffers.id, {
      onDelete: "set null",
    }),
    productExternalId: text("product_external_id").notNull(),
    offerExternalId: text("offer_external_id").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("active").$type<"active" | "archived">(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "renewal_campaigns_status_check",
      sql`${table.status} IN ('active', 'archived')`,
    ),
    foreignKey({
      columns: [table.offerId, table.productId],
      foreignColumns: [productOffers.id, productOffers.productId],
      name: "renewal_campaigns_offer_product_fk",
    }),
    uniqueIndex("renewal_campaigns_slug_idx").on(table.slug),
    uniqueIndex("renewal_campaigns_active_target_offer_idx")
      .on(table.targetChatId, table.offerExternalId)
      .where(sql`${table.status} = 'active'`),
    index("renewal_campaigns_status_idx").on(table.status),
    index("renewal_campaigns_source_chat_idx").on(table.sourceChatId),
    index("renewal_campaigns_target_chat_idx").on(table.targetChatId),
  ],
);

export const renewalCampaignSourceChats = pgTable(
  "renewal_campaign_source_chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => renewalCampaigns.id, { onDelete: "cascade" }),
    chatId: text("chat_id")
      .notNull()
      .references(() => telegramChats.chatId, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("renewal_campaign_source_chats_campaign_chat_idx").on(
      table.campaignId,
      table.chatId,
    ),
    index("renewal_campaign_source_chats_chat_idx").on(table.chatId),
  ],
);

export const onlineGroupCampaigns = pgTable(
  "online_group_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    regularChatId: text("regular_chat_id")
      .notNull()
      .references(() => telegramChats.chatId, { onDelete: "restrict" }),
    libraryChatId: text("library_chat_id")
      .notNull()
      .references(() => telegramChats.chatId, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("active").$type<"active" | "archived">(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "online_group_campaigns_status_check",
      sql`${table.status} IN ('active', 'archived')`,
    ),
    uniqueIndex("online_group_campaigns_single_active_idx")
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
    index("online_group_campaigns_created_at_idx").on(table.createdAt),
  ],
);

export const telegramRenewalVerifications = pgTable(
  "telegram_renewal_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => renewalCampaigns.id, { onDelete: "cascade" }),
    checkoutSessionId: text("checkout_session_id").notNull(),
    telegramUserId: text("telegram_user_id").notNull(),
    telegramUsername: text("telegram_username"),
    telegramName: text("telegram_name"),
    sourceChatId: text("source_chat_id").notNull(),
    targetChatId: text("target_chat_id").notNull(),
    status: text("status").notNull().$type<"verified" | "not_member" | "failed">(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "telegram_renewal_verifications_status_check",
      sql`${table.status} IN ('verified', 'not_member', 'failed')`,
    ),
    uniqueIndex("telegram_renewal_verifications_checkout_campaign_idx").on(
      table.checkoutSessionId,
      table.campaignId,
    ),
    index("telegram_renewal_verifications_user_idx").on(table.telegramUserId),
    index("telegram_renewal_verifications_expires_idx").on(table.expiresAt),
  ],
);

export const offerPrices = pgTable(
  "offer_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => productOffers.id, { onDelete: "cascade" }),
    currency: text("currency").notNull().$type<"pln" | "eur">(),
    amountMinor: integer("amount_minor").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("offer_prices_currency_check", sql`${table.currency} IN ('pln', 'eur')`),
    check("offer_prices_amount_minor_check", sql`${table.amountMinor} > 0`),
    uniqueIndex("offer_prices_offer_currency_idx").on(table.offerId, table.currency),
    index("offer_prices_currency_idx").on(table.currency),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email"),
    normalizedEmail: text("normalized_email"),
    fullName: text("full_name"),
    telegramUsername: text("telegram_username"),
    country: text("country"),
    addressLine: text("address_line"),
    city: text("city"),
    postalCode: text("postal_code"),
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("customers_normalized_email_idx").on(table.normalizedEmail),
    uniqueIndex("customers_stripe_customer_id_idx").on(table.stripeCustomerId),
  ],
);

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentIntentId: text("payment_intent_id").notNull(),
    checkoutSessionId: text("checkout_session_id"),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    customerEmailSnapshot: text("customer_email_snapshot"),
    customerFullNameSnapshot: text("customer_full_name_snapshot"),
    customerTelegramUsernameSnapshot: text("customer_telegram_username_snapshot"),
    inspirationChatIdSnapshot: text("inspiration_chat_id_snapshot"),
    inspirationAccessExpiresAtSnapshot: timestamp(
      "inspiration_access_expires_at_snapshot",
      { withTimezone: true },
    ),
    customerCountrySnapshot: text("customer_country_snapshot"),
    customerAddressLineSnapshot: text("customer_address_line_snapshot"),
    customerCitySnapshot: text("customer_city_snapshot"),
    customerPostalCodeSnapshot: text("customer_postal_code_snapshot"),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    offerId: uuid("offer_id").references(() => productOffers.id, {
      onDelete: "set null",
    }),
    productExternalId: text("product_external_id"),
    offerExternalId: text("offer_external_id"),
    productTitleSnapshot: text("product_title_snapshot"),
    offerLabelSnapshot: text("offer_label_snapshot"),
    purchaseItemSnapshot: text("purchase_item_snapshot"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    settlementAmountMinor: integer("settlement_amount_minor"),
    settlementCurrency: text("settlement_currency"),
    stripeFeeAmountMinor: integer("stripe_fee_amount_minor"),
    stripeNetAmountMinor: integer("stripe_net_amount_minor"),
    stripeBalanceTransactionId: text("stripe_balance_transaction_id"),
    stripeExchangeRate: text("stripe_exchange_rate"),
    checkoutCurrency: text("checkout_currency"),
    checkoutLocale: text("checkout_locale").$type<"ru" | "en" | "pl">(),
    lessonLanguage: text("lesson_language").$type<"ru" | "en">(),
    stripeStatus: text("stripe_status").notNull(),
    outcome: text("outcome")
      .notNull()
      .$type<"succeeded" | "processing" | "requires_action" | "failed" | "canceled">(),
    latestEventId: text("latest_event_id"),
    latestEventType: text("latest_event_type"),
    lastPaymentErrorCode: text("last_payment_error_code"),
    lastPaymentErrorMessage: text("last_payment_error_message"),
    source: text("source").notNull().default("stripe"),
    livemode: boolean("livemode").notNull().default(false),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    succeededAt: timestamp("succeeded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("purchases_amount_minor_check", sql`${table.amountMinor} >= 0`),
    check(
      "purchases_currency_check",
      sql`${table.currency} IN ('pln', 'eur')
        AND (${table.checkoutCurrency} IS NULL
          OR ${table.checkoutCurrency} IN ('pln', 'eur'))
        AND (${table.settlementCurrency} IS NULL
          OR LENGTH(BTRIM(${table.settlementCurrency})) = 3)`,
    ),
    check(
      "purchases_money_ranges_check",
      sql`(${table.settlementAmountMinor} IS NULL OR ${table.settlementAmountMinor} >= 0)
        AND (${table.stripeFeeAmountMinor} IS NULL OR ${table.stripeFeeAmountMinor} >= 0)`,
    ),
    check(
      "purchases_locale_language_check",
      sql`(${table.checkoutLocale} IS NULL OR ${table.checkoutLocale} IN ('ru', 'en', 'pl'))
        AND (${table.lessonLanguage} IS NULL OR ${table.lessonLanguage} IN ('ru', 'en'))`,
    ),
    check(
      "purchases_outcome_check",
      sql`${table.outcome} IN (
        'succeeded',
        'processing',
        'requires_action',
        'failed',
        'canceled'
      )`,
    ),
    check(
      "purchases_source_check",
      sql`${table.source} IN ('stripe', 'admin_offer_link')`,
    ),
    foreignKey({
      columns: [table.offerId, table.productId],
      foreignColumns: [productOffers.id, productOffers.productId],
      name: "purchases_offer_product_fk",
    }),
    uniqueIndex("purchases_payment_intent_id_idx").on(table.paymentIntentId),
    index("purchases_checkout_session_id_idx").on(table.checkoutSessionId),
    index("purchases_customer_id_idx").on(table.customerId),
    index("purchases_customer_email_snapshot_idx").on(table.customerEmailSnapshot),
    index("purchases_product_external_id_idx").on(table.productExternalId),
    index("purchases_offer_external_id_idx").on(table.offerExternalId),
    index("purchases_product_offer_idx").on(table.productId, table.offerId),
    index("purchases_succeeded_at_idx").on(table.succeededAt),
    index("purchases_outcome_succeeded_at_idx").on(table.outcome, table.succeededAt),
    index("purchases_stripe_balance_transaction_id_idx").on(
      table.stripeBalanceTransactionId,
    ),
  ],
);

export const checkoutConsentEvidence = pgTable(
  "checkout_consent_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentIntentId: text("payment_intent_id").notNull(),
    checkoutSessionId: text("checkout_session_id").notNull(),
    checkoutLocale: text("checkout_locale").notNull().$type<"ru" | "en" | "pl">(),
    productExternalId: text("product_external_id").notNull(),
    offerExternalId: text("offer_external_id").notNull(),
    currency: text("currency").notNull().$type<"pln" | "eur">(),
    immediateAccessConsent: boolean("immediate_access_consent").notNull(),
    withdrawalNoticeAcknowledgement: boolean(
      "withdrawal_notice_acknowledgement",
    ).notNull(),
    privacyPolicyAcknowledgement: boolean("privacy_policy_acknowledgement").notNull(),
    digitalContentAgreement: boolean("digital_content_agreement").notNull(),
    immediateAccessConsentVersion: text("immediate_access_consent_version").notNull(),
    withdrawalNoticeAcknowledgementVersion: text(
      "withdrawal_notice_acknowledgement_version",
    ).notNull(),
    privacyPolicyAcknowledgementVersion: text(
      "privacy_policy_acknowledgement_version",
    ).notNull(),
    digitalContentAgreementVersion: text("digital_content_agreement_version").notNull(),
    privacyPolicyVersion: text("privacy_policy_version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
    source: text("source").notNull(),
    schemaVersion: text("schema_version").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("checkout_consent_evidence_payment_intent_idx").on(table.paymentIntentId),
    index("checkout_consent_evidence_checkout_session_idx").on(table.checkoutSessionId),
    check(
      "checkout_consent_evidence_all_accepted_check",
      sql`${table.immediateAccessConsent}
        AND ${table.withdrawalNoticeAcknowledgement}
        AND ${table.privacyPolicyAcknowledgement}
        AND ${table.digitalContentAgreement}`,
    ),
    check(
      "checkout_consent_evidence_locale_check",
      sql`${table.checkoutLocale} IN ('ru', 'en', 'pl')`,
    ),
    check(
      "checkout_consent_evidence_currency_check",
      sql`${table.currency} IN ('pln', 'eur')`,
    ),
  ],
);

export const stripeEvents = pgTable(
  "stripe_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stripeEventId: text("stripe_event_id").notNull(),
    eventType: text("event_type").notNull(),
    paymentIntentId: text("payment_intent_id"),
    purchaseId: uuid("purchase_id").references(() => purchases.id, {
      onDelete: "set null",
    }),
    stripeCreatedAt: timestamp("stripe_created_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingStatus: text("processing_status")
      .notNull()
      .$type<
        "pending" | "processing" | "processed" | "skipped" | "failed" | "dead_letter"
      >(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    providerPayloadVerified: boolean("provider_payload_verified")
      .notNull()
      .default(false),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    paymentStatusSnapshot: text("payment_status_snapshot"),
    outcomeSnapshot: text("outcome_snapshot"),
    livemode: boolean("livemode").notNull().default(false),
    apiVersion: text("api_version"),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "stripe_events_evidence_check",
      sql`BTRIM(${table.stripeEventId}) <> ''
        AND BTRIM(${table.eventType}) <> ''
        AND JSONB_TYPEOF(${table.payload}) = 'object'
        AND (
          NOT ${table.providerPayloadVerified}
          OR ${table.stripeCreatedAt} IS NOT NULL
        )`,
    ),
    check(
      "stripe_events_lifecycle_check",
      sql`${table.processingStatus} IN (
          'pending',
          'processing',
          'processed',
          'skipped',
          'failed',
          'dead_letter'
        )
        AND ${table.attemptCount} >= 0
        AND (
          ${table.processingStatus} <> 'processing'
          OR (
            NULLIF(BTRIM(${table.leaseToken}), '') IS NOT NULL
            AND ${table.leaseExpiresAt} IS NOT NULL
          )
        )
        AND (
          ${table.processingStatus} <> 'dead_letter'
          OR ${table.deadLetteredAt} IS NOT NULL
        )
        AND (
          ${table.processingStatus} NOT IN ('processed', 'skipped')
          OR ${table.processedAt} IS NOT NULL
        )`,
    ),
    uniqueIndex("stripe_events_stripe_event_id_idx").on(table.stripeEventId),
    index("stripe_events_payment_intent_id_idx").on(table.paymentIntentId),
    index("stripe_events_purchase_id_idx").on(table.purchaseId),
    index("stripe_events_processed_at_idx").on(table.processedAt),
    index("stripe_events_inbox_claim_idx")
      .on(
        table.processingStatus,
        table.nextAttemptAt,
        table.leaseExpiresAt,
        table.receivedAt,
      )
      .where(sql`${table.processingStatus} IN ('pending', 'processing', 'failed')`),
  ],
);

export const purchaseSideEffects = pgTable(
  "purchase_side_effects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseId: uuid("purchase_id").references(() => purchases.id, {
      onDelete: "cascade",
    }),
    deduplicationKey: text("deduplication_key").notNull().default(""),
    kind: text("kind")
      .notNull()
      .$type<
        | "purchase_success_email"
        | "admin_telegram_alert"
        | "successful_customer_export"
        | "telegram_access_delivery"
        | "monthly_report_delivery"
        | "campaign_email_delivery"
        | "google_sheets_export"
      >(),
    provider: text("provider").$type<
      "resend" | "telegram" | "google_sheets" | "internal"
    >(),
    payload: jsonb("payload")
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<Record<string, unknown>>(),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<"pending" | "sending" | "sent" | "skipped" | "failed" | "dead_letter">(),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    recipient: text("recipient"),
    externalMessageId: text("external_message_id"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("purchase_side_effects_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check(
      "purchase_side_effects_lifecycle_check",
      sql`BTRIM(${table.deduplicationKey}) <> ''
        AND JSONB_TYPEOF(${table.payload}) = 'object'
        AND ${table.status} IN (
          'pending',
          'sending',
          'sent',
          'skipped',
          'failed',
          'dead_letter'
        )
        AND (
          ${table.status} <> 'dead_letter'
          OR ${table.deadLetteredAt} IS NOT NULL
        )`,
    ),
    uniqueIndex("purchase_side_effects_purchase_kind_idx").on(
      table.purchaseId,
      table.kind,
    ),
    uniqueIndex("purchase_side_effects_deduplication_key_idx").on(table.deduplicationKey),
    index("purchase_side_effects_status_idx").on(table.status),
    index("purchase_side_effects_claim_idx")
      .on(table.status, table.nextAttemptAt, table.leaseExpiresAt, table.createdAt)
      .where(sql`${table.status} IN ('pending', 'sending', 'failed')`),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    invoiceNumber: text("invoice_number").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    sequenceYear: integer("sequence_year").notNull(),
    sequenceMonth: integer("sequence_month").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    buyerNameSnapshot: text("buyer_name_snapshot"),
    buyerEmailSnapshot: text("buyer_email_snapshot"),
    buyerAddressSnapshot: text("buyer_address_snapshot"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    pdfStorageKey: text("pdf_storage_key"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "invoices_ranges_check",
      sql`${table.sequenceYear} BETWEEN 2000 AND 9999
        AND ${table.sequenceMonth} BETWEEN 1 AND 12
        AND ${table.sequenceNumber} > 0
        AND ${table.amountMinor} >= 0
        AND ${table.currency} IN ('pln', 'eur')`,
    ),
    uniqueIndex("invoices_purchase_id_idx").on(table.purchaseId),
    uniqueIndex("invoices_invoice_number_idx").on(table.invoiceNumber),
    uniqueIndex("invoices_sequence_idx").on(
      table.sequenceYear,
      table.sequenceMonth,
      table.sequenceNumber,
    ),
  ],
);

export const invoiceSequences = pgTable(
  "invoice_sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequenceYear: integer("sequence_year").notNull(),
    sequenceMonth: integer("sequence_month").notNull(),
    lastSequence: integer("last_sequence").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "invoice_sequences_ranges_check",
      sql`${table.sequenceYear} BETWEEN 2000 AND 9999
        AND ${table.sequenceMonth} BETWEEN 1 AND 12
        AND ${table.lastSequence} > 0`,
    ),
    uniqueIndex("invoice_sequences_year_month_idx").on(
      table.sequenceYear,
      table.sequenceMonth,
    ),
  ],
);

export const accessEntitlements = pgTable(
  "access_entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    offerId: uuid("offer_id").references(() => productOffers.id, {
      onDelete: "set null",
    }),
    accessKey: text("access_key").notNull().default("primary"),
    deliveryChannel: text("delivery_channel"),
    accessWorkflow: text("access_workflow"),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<
        | "pending"
        | "not_required"
        | "token_issued"
        | "activated"
        | "expired"
        | "revoked"
        | "left_channel"
        | "link_failed"
        | "manual_pending"
        | "manual_done"
      >(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    externalTargetType: text("external_target_type").$type<
      "telegram_chat" | "telegram_bot" | "manual"
    >(),
    telegramChatId: text("telegram_chat_id"),
    telegramUserId: text("telegram_user_id"),
    telegramUsername: text("telegram_username"),
    currentTokenId: text("current_token_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "access_entitlements_status_check",
      sql`${table.status} IN (
        'pending',
        'not_required',
        'token_issued',
        'activated',
        'expired',
        'revoked',
        'left_channel',
        'link_failed',
        'manual_pending',
        'manual_done'
      )`,
    ),
    check(
      "access_entitlements_external_target_type_check",
      sql`${table.externalTargetType} IS NULL
        OR ${table.externalTargetType} IN ('telegram_chat', 'telegram_bot', 'manual')`,
    ),
    foreignKey({
      columns: [table.offerId, table.productId],
      foreignColumns: [productOffers.id, productOffers.productId],
      name: "access_entitlements_offer_product_fk",
    }),
    uniqueIndex("access_entitlements_purchase_key_idx").on(
      table.purchaseId,
      table.accessKey,
    ),
    uniqueIndex("access_entitlements_id_purchase_id_idx").on(table.id, table.purchaseId),
    index("access_entitlements_status_idx").on(table.status),
    index("access_entitlements_telegram_user_idx").on(table.telegramUserId),
    index("access_entitlements_expires_at_idx").on(table.expiresAt),
  ],
);

export const telegramAccessTokens = pgTable(
  "telegram_access_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenId: text("token_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenValue: text("token_value"),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    entitlementId: uuid("entitlement_id").references(() => accessEntitlements.id, {
      onDelete: "set null",
    }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    offerId: uuid("offer_id").references(() => productOffers.id, {
      onDelete: "set null",
    }),
    customerEmailSnapshot: text("customer_email_snapshot"),
    linkKind: text("link_kind").notNull().$type<"channel_invite" | "start_token">(),
    chatId: text("chat_id"),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
    status: text("status").notNull().$type<"issued" | "used" | "expired" | "revoked">(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    telegramUserId: text("telegram_user_id"),
    telegramUsername: text("telegram_username"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "telegram_access_tokens_kind_status_check",
      sql`${table.linkKind} IN ('channel_invite', 'start_token')
        AND ${table.status} IN ('issued', 'used', 'expired', 'revoked')`,
    ),
    check(
      "telegram_access_tokens_used_claim_check",
      sql`${table.status} <> 'used' OR NULLIF(BTRIM(${table.telegramUserId}), '') IS NOT NULL`,
    ),
    foreignKey({
      columns: [table.entitlementId, table.purchaseId],
      foreignColumns: [accessEntitlements.id, accessEntitlements.purchaseId],
      name: "telegram_access_tokens_entitlement_purchase_fk",
    }),
    uniqueIndex("telegram_access_tokens_token_id_idx").on(table.tokenId),
    uniqueIndex("telegram_access_tokens_token_hash_idx").on(table.tokenHash),
    index("telegram_access_tokens_purchase_id_idx").on(table.purchaseId),
    index("telegram_access_tokens_status_expires_at_idx").on(
      table.status,
      table.expiresAt,
    ),
  ],
);

export const telegramUserBindings = pgTable(
  "telegram_user_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    entitlementId: uuid("entitlement_id").references(() => accessEntitlements.id, {
      onDelete: "set null",
    }),
    telegramUserId: text("telegram_user_id").notNull(),
    telegramUsername: text("telegram_username"),
    customerEmailSnapshot: text("customer_email_snapshot"),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    offerId: uuid("offer_id").references(() => productOffers.id, {
      onDelete: "set null",
    }),
    chatId: text("chat_id"),
    inviteLink: text("invite_link"),
    boundAt: timestamp("bound_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    status: text("status").notNull().$type<"active" | "left" | "revoked">(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "telegram_user_bindings_status_check",
      sql`${table.status} IN ('active', 'left', 'revoked')`,
    ),
    foreignKey({
      columns: [table.entitlementId, table.purchaseId],
      foreignColumns: [accessEntitlements.id, accessEntitlements.purchaseId],
      name: "telegram_user_bindings_entitlement_purchase_fk",
    }),
    uniqueIndex("telegram_user_bindings_purchase_chat_idx").on(
      table.purchaseId,
      table.chatId,
    ),
    index("telegram_user_bindings_telegram_user_chat_idx").on(
      table.telegramUserId,
      table.chatId,
    ),
    index("telegram_user_bindings_status_idx").on(table.status),
    index("telegram_user_bindings_customer_email_idx").on(table.customerEmailSnapshot),
  ],
);

export const monthlyReportRuns = pgTable(
  "monthly_report_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportKey: text("report_key").notNull(),
    reportFamily: text("report_family").notNull(),
    periodStartUtc: timestamp("period_start_utc", { withTimezone: true }).notNull(),
    periodEndUtc: timestamp("period_end_utc", { withTimezone: true }).notNull(),
    generatedAtUtc: timestamp("generated_at_utc", { withTimezone: true }).notNull(),
    deliveryStatus: text("delivery_status")
      .notNull()
      .$type<"sent" | "skipped" | "failed">(),
    deliveredAtUtc: timestamp("delivered_at_utc", { withTimezone: true }),
    deliveredTo: text("delivered_to"),
    rowCount: integer("row_count").notNull().default(0),
    csvSha256: text("csv_sha256"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "monthly_report_runs_status_range_check",
      sql`${table.deliveryStatus} IN ('sent', 'skipped', 'failed')
        AND ${table.rowCount} >= 0
        AND ${table.periodEndUtc} > ${table.periodStartUtc}`,
    ),
    uniqueIndex("monthly_report_runs_report_key_idx").on(table.reportKey),
    index("monthly_report_runs_period_idx").on(table.periodStartUtc, table.periodEndUtc),
  ],
);

export const emailCampaignLeads = pgTable(
  "email_campaign_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: text("lead_id").notNull(),
    campaignKey: text("campaign_key").notNull(),
    emailSendStatus: text("email_send_status")
      .notNull()
      .default("pending")
      .$type<"blocked" | "excluded" | "failed" | "pending" | "sending" | "sent">(),
    fullName: text("full_name").notNull().default(""),
    socialContact: text("social_contact").notNull().default(""),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    locale: text("locale").notNull().default(""),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    emailSendAttempts: integer("email_send_attempts").notNull().default(0),
    lastEmailError: text("last_email_error").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "email_campaign_leads_status_attempts_check",
      sql`${table.emailSendStatus} IN (
          'blocked',
          'excluded',
          'failed',
          'pending',
          'sending',
          'sent'
        )
        AND ${table.emailSendAttempts} >= 0`,
    ),
    uniqueIndex("email_campaign_leads_lead_id_idx").on(table.leadId),
    uniqueIndex("email_campaign_leads_campaign_email_idx").on(
      table.campaignKey,
      table.normalizedEmail,
    ),
    index("email_campaign_leads_campaign_key_idx").on(table.campaignKey),
    index("email_campaign_leads_email_send_status_idx").on(table.emailSendStatus),
    index("email_campaign_leads_created_at_idx").on(table.createdAt),
  ],
);

export const dataBackfillRuns = pgTable(
  "data_backfill_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    backfillKey: text("backfill_key").notNull(),
    targetEnvironment: text("target_environment")
      .notNull()
      .$type<"development" | "production">(),
    sourceCaptureId: text("source_capture_id").notNull(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    sourceCutOffAt: timestamp("source_cut_off_at", { withTimezone: true }).notNull(),
    sourceRowCounts: jsonb("source_row_counts").notNull().$type<Record<string, number>>(),
    batchSize: integer("batch_size").notNull(),
    stage: text("stage")
      .notNull()
      .$type<
        | "payments"
        | "stripeEvents"
        | "telegramAccessTokens"
        | "telegramUserBindings"
        | "monthlyReportRuns"
        | "emailCampaignLeads"
      >(),
    nextRowIndex: integer("next_row_index").notNull().default(0),
    status: text("status")
      .notNull()
      .default("running")
      .$type<"running" | "failed" | "completed">(),
    stats: jsonb("stats").notNull().$type<
      Record<
        string,
        {
          conflicts: number;
          inserted: number;
          skipped: number;
          updated: number;
        }
      >
    >(),
    lastErrorCode: text("last_error_code"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "data_backfill_runs_identity_check",
      sql`BTRIM(${table.backfillKey}) <> ''
        AND BTRIM(${table.sourceCaptureId}) <> ''
        AND ${table.sourceFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "data_backfill_runs_state_check",
      sql`${table.targetEnvironment} IN ('development', 'production')
        AND ${table.status} IN ('running', 'failed', 'completed')
        AND ${table.stage} IN (
          'payments',
          'stripeEvents',
          'telegramAccessTokens',
          'telegramUserBindings',
          'monthlyReportRuns',
          'emailCampaignLeads'
        )
        AND ${table.batchSize} BETWEEN 1 AND 500
        AND ${table.nextRowIndex} >= 0
        AND JSONB_TYPEOF(${table.sourceRowCounts}) = 'object'
        AND JSONB_TYPEOF(${table.stats}) = 'object'
        AND (
          ${table.status} <> 'completed'
          OR ${table.completedAt} IS NOT NULL
        )`,
    ),
    uniqueIndex("data_backfill_runs_source_idx").on(
      table.backfillKey,
      table.targetEnvironment,
      table.sourceFingerprint,
    ),
    index("data_backfill_runs_status_idx").on(
      table.targetEnvironment,
      table.status,
      table.updatedAt,
    ),
  ],
);
