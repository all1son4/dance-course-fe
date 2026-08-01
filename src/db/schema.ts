import { sql } from "drizzle-orm";
import {
  boolean,
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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
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
    uniqueIndex("product_offers_external_offer_id_idx").on(table.externalOfferId),
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
      .$type<"processed" | "skipped" | "failed">(),
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
    uniqueIndex("stripe_events_stripe_event_id_idx").on(table.stripeEventId),
    index("stripe_events_payment_intent_id_idx").on(table.paymentIntentId),
    index("stripe_events_purchase_id_idx").on(table.purchaseId),
    index("stripe_events_processed_at_idx").on(table.processedAt),
  ],
);

export const purchaseSideEffects = pgTable(
  "purchase_side_effects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    kind: text("kind")
      .notNull()
      .$type<
        "purchase_success_email" | "admin_telegram_alert" | "successful_customer_export"
      >(),
    provider: text("provider").$type<"resend" | "telegram">(),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<"pending" | "sending" | "sent" | "skipped" | "failed">(),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    recipient: text("recipient"),
    externalMessageId: text("external_message_id"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("purchase_side_effects_purchase_kind_idx").on(
      table.purchaseId,
      table.kind,
    ),
    index("purchase_side_effects_status_idx").on(table.status),
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
    uniqueIndex("invoices_purchase_id_idx").on(table.purchaseId),
    uniqueIndex("invoices_invoice_number_idx").on(table.invoiceNumber),
    uniqueIndex("invoices_sequence_idx").on(
      table.sequenceYear,
      table.sequenceMonth,
      table.sequenceNumber,
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
    uniqueIndex("access_entitlements_purchase_key_idx").on(
      table.purchaseId,
      table.accessKey,
    ),
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
      .$type<"blocked" | "excluded" | "failed" | "pending" | "sent">(),
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
