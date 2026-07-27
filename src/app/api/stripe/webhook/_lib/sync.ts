import type Stripe from "stripe";

import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";
import {
  appendStripeEventRecord,
  appendSuccessfulCustomerRecord,
  findPaymentRecordByIntentId,
  findStripeEventRecordByEventId,
  type PaymentSheetRecord,
  upsertPaymentRecord,
} from "@/lib/google-sheets";
import { getLocalizedOfferMetadataByOfferId } from "@/lib/sellable-products-localization";
import { toUtcIso } from "@/lib/time";

import {
  getManagedPaymentIntentSnapshot,
  getStripeServer,
} from "../../payment-intent/lib";

const SUPPORTED_PAYMENT_INTENT_EVENT_TYPES = new Set([
  "payment_intent.canceled",
  "payment_intent.payment_failed",
  "payment_intent.processing",
  "payment_intent.requires_action",
  "payment_intent.succeeded",
]);
const SUPPORTED_CHECKOUT_SESSION_EVENT_TYPES = new Set(["checkout.session.completed"]);
const SUCCESSFUL_CUSTOMER_LOG_EVENT_TYPE = "payment_intent.succeeded";
const SUCCESSFUL_CUSTOMER_LOG_PENDING_PREFIX = "pending:";
const SUCCESSFUL_CUSTOMER_LOG_SENT_STATUS = "sent";
const SUCCESSFUL_CUSTOMER_LOG_LEASE_TTL_MS = 2 * 60 * 1000;
const SUCCESSFUL_CUSTOMER_LOG_WAIT_RETRIES = 4;
const SUCCESSFUL_CUSTOMER_LOG_WAIT_DELAY_MS = 500;
const pendingStripeWebhookSyncs = new Map<string, Promise<StripePaymentWebhookResult>>();
const pendingStripePaymentIntentSyncs = new Map<string, Promise<void>>();
const WITH_MENTOR_OFFER_IDS = new Set(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.offers
      .filter((offer) => offer.code === "with-mentor")
      .map((offer) => offer.id),
  ),
);
const WITHOUT_MENTOR_OFFER_IDS = new Set(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.offers
      .filter((offer) => offer.code === "without-mentor")
      .map((offer) => offer.id),
  ),
);
const FIRST_TOUCH_OFFER_IDS = new Set(
  SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.code === "first-touch" ? product.offers.map((offer) => offer.id) : [],
  ),
);
const PAYMENT_METADATA_KEYS = {
  accessWorkflow: ["access_workflow", "accessWorkflow"],
  checkoutCurrency: ["checkout_currency", "checkoutCurrency"],
  checkoutLocale: [
    "checkout_locale",
    "checkoutLocale",
    "checkout_language",
    "checkoutLanguage",
    "locale",
  ],
  checkoutSessionId: ["checkout_session_id", "checkoutSessionId"],
  customerAddress: ["customer_address", "customerAddress", "address"],
  customerCity: ["customer_city", "customerCity", "city"],
  customerCountry: ["customer_country", "customerCountry", "country"],
  customerFullName: ["customer_full_name", "customerFullName", "full_name", "fullName"],
  customerNickname: [
    "customer_nickname",
    "customerNickname",
    "telegram_username",
    "telegramUsername",
    "telegram",
  ],
  customerPostalCode: [
    "customer_postal_code",
    "customerPostalCode",
    "postal_code",
    "postalCode",
  ],
  deliveryChannel: ["delivery_channel", "deliveryChannel"],
  lessonLanguage: [
    "lesson_language",
    "lessonLanguage",
    "materials_language",
    "materialsLanguage",
    "material_language",
    "materialLanguage",
  ],
  offerId: ["offer_id", "offerId", "offer"],
  offerLabel: ["offer_label", "offerLabel"],
  productId: ["product_id", "productId", "product"],
  productTitle: ["product_title", "productTitle"],
  telegramChannelChatId: ["telegram_channel_chat_id", "telegramChannelChatId"],
  telegramInspirationChatId: [
    "telegram_inspiration_chat_id",
    "telegramInspirationChatId",
  ],
  telegramUserId: ["telegram_user_id", "telegramUserId"],
  telegramUsername: ["telegram_username", "telegramUsername"],
} as const;
const CHECKOUT_CUSTOM_FIELD_KEYS = {
  customerNickname: [
    "telegram",
    "telegramusername",
    "telegram_username",
    "customernickname",
    "customer_nickname",
  ],
  lessonLanguage: [
    "lessonlanguage",
    "lesson_language",
    "materiallanguage",
    "material_language",
    "materialslanguage",
    "materials_language",
    "materials",
  ],
} as const;

type StripePaymentWebhookResult = {
  duplicate: boolean;
  eventId: string;
  eventType: string;
  paymentRecord: PaymentSheetRecord;
  received: true;
  skipped: boolean;
};

type StripePaymentSourceContext = {
  checkoutSession: Stripe.Checkout.Session | null;
  lineItemLabel: string;
  paymentLink: Stripe.PaymentLink | null;
};

type StripeMetadata = Record<string, string>;

type PaymentRecordMappingContext = {
  checkoutSession: Stripe.Checkout.Session | null;
  existingRecord: PaymentSheetRecord | null;
  paymentIntent: Stripe.PaymentIntent;
  paymentIntentMetadata: StripeMetadata;
  sourceContext: StripePaymentSourceContext | null;
  sourceMetadata: StripeMetadata;
};

type ResolvedCheckoutDetails = {
  checkoutCurrency: string;
  checkoutLocale: string;
  checkoutSessionId: string;
  offerId: string;
  offerLabel: string;
  productId: string;
  productTitle: string;
};

type ResolvedCustomerDetails = {
  address: string;
  city: string;
  country: string;
  email: string;
  fullName: string;
  lessonLanguage: string;
  nickname: string;
  postalCode: string;
};

type ResolvedAccessDetails = {
  accessWorkflow: string;
  deliveryChannel: string;
  telegramAccessStatus: string;
  telegramChannelChatId: string;
  telegramInspirationChatId: string;
};

type PreservedAccessDetails = {
  accessWorkflow: string;
  deliveryChannel: string;
  telegramAccessStatus: string;
};

type CreatePaymentSheetRecordInput = {
  access: ResolvedAccessDetails;
  checkout: ResolvedCheckoutDetails;
  context: PaymentRecordMappingContext;
  customer: ResolvedCustomerDetails;
  event: Stripe.Event;
  snapshot: ReturnType<typeof getManagedPaymentIntentSnapshot>;
  timestamp: string;
};

const getPurchaseItemLabel = (paymentRecord: PaymentSheetRecord) => {
  const productTitle = paymentRecord.product_title.trim();
  const offerLabel = paymentRecord.offer_label.trim();

  if (productTitle && offerLabel) {
    return `${productTitle} — ${offerLabel}`;
  }

  if (productTitle) {
    return productTitle;
  }

  return offerLabel;
};

const getCustomerFullAddress = (paymentRecord: PaymentSheetRecord) =>
  [
    paymentRecord.customer_address.trim(),
    paymentRecord.customer_city.trim(),
    paymentRecord.customer_postal_code.trim(),
  ]
    .filter(Boolean)
    .join(", ");

const buildPurchaseItemLabel = (productTitle: string, offerLabel: string) => {
  const normalizedProductTitle = productTitle.trim();
  const normalizedOfferLabel = offerLabel.trim();

  if (normalizedProductTitle && normalizedOfferLabel) {
    return `${normalizedProductTitle} — ${normalizedOfferLabel}`;
  }

  return normalizedProductTitle || normalizedOfferLabel;
};

const trimString = (value: string | null | undefined) => value?.trim() ?? "";

const emptyIfNull = (value: string | null | undefined): string => value ?? "";

const sleep = (delayMs: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

const normalizeStripeLookupKey = (value: string | null | undefined) =>
  trimString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");

const getStripeMetadata = (metadata: Stripe.Metadata | null | undefined) =>
  (metadata ?? {}) as StripeMetadata;

const getMetadataValue = (
  paymentIntentMetadata: StripeMetadata,
  sourceMetadata: StripeMetadata,
  keys: readonly string[],
) => {
  // PaymentIntent metadata is written by our checkout API and is the most reliable
  // source. PaymentLink/Checkout metadata is kept as a compatibility fallback.
  for (const key of keys) {
    const paymentIntentValue = trimString(paymentIntentMetadata[key]);

    if (paymentIntentValue) {
      return paymentIntentValue;
    }
  }

  for (const key of keys) {
    const sourceValue = trimString(sourceMetadata[key]);

    if (sourceValue) {
      return sourceValue;
    }
  }

  return "";
};

const getCheckoutSessionPaymentIntentId = (session: Stripe.Checkout.Session) => {
  if (typeof session.payment_intent === "string") {
    return session.payment_intent;
  }

  return session.payment_intent?.id ?? "";
};

const getEventPaymentIntentId = (event: Stripe.Event) => {
  if (SUPPORTED_PAYMENT_INTENT_EVENT_TYPES.has(event.type)) {
    return (event.data.object as Stripe.PaymentIntent).id ?? "";
  }

  if (SUPPORTED_CHECKOUT_SESSION_EVENT_TYPES.has(event.type)) {
    return getCheckoutSessionPaymentIntentId(
      event.data.object as Stripe.Checkout.Session,
    );
  }

  return "";
};

const getCustomFieldValue = (
  checkoutSession: Stripe.Checkout.Session | null,
  keys: readonly string[],
) => {
  const normalizedKeys = new Set(keys.map((key) => normalizeStripeLookupKey(key)));

  for (const field of checkoutSession?.custom_fields ?? []) {
    const fieldKey = normalizeStripeLookupKey(field.key);
    const fieldLabel = normalizeStripeLookupKey(field.label.custom);

    if (!normalizedKeys.has(fieldKey) && !normalizedKeys.has(fieldLabel)) {
      continue;
    }

    if (field.type === "dropdown") {
      return trimString(field.dropdown?.value);
    }

    if (field.type === "numeric") {
      return trimString(field.numeric?.value);
    }

    return trimString(field.text?.value);
  }

  return "";
};

const getCheckoutSessionAddressLine = (checkoutSession: Stripe.Checkout.Session | null) =>
  [
    checkoutSession?.customer_details?.address?.line1,
    checkoutSession?.customer_details?.address?.line2,
    checkoutSession?.customer_details?.address?.state,
  ]
    .map((value) => trimString(value))
    .filter(Boolean)
    .join(", ");

const getPaymentLinkId = (checkoutSession: Stripe.Checkout.Session | null) => {
  const paymentLink = checkoutSession?.payment_link;

  if (typeof paymentLink === "string") {
    return paymentLink;
  }

  return paymentLink?.id ?? "";
};

const getSourceMetadata = (sourceContext: StripePaymentSourceContext | null) => ({
  ...getStripeMetadata(sourceContext?.paymentLink?.metadata),
  ...getStripeMetadata(sourceContext?.checkoutSession?.metadata),
});

const getCheckoutSessionLineItemLabel = async (
  checkoutSession: Stripe.Checkout.Session | null,
) => {
  const stripe = getStripeServer();

  if (!stripe || !checkoutSession?.id) {
    return "";
  }

  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(checkoutSession.id, {
      limit: 1,
    });
    const lineItem = lineItems.data[0];

    return trimString(lineItem?.description);
  } catch (error) {
    console.error("Failed to retrieve Stripe Checkout Session line item", {
      checkoutSessionId: checkoutSession.id,
      error,
    });

    return "";
  }
};

const getPaymentLink = async (checkoutSession: Stripe.Checkout.Session | null) => {
  const stripe = getStripeServer();
  const paymentLinkId = getPaymentLinkId(checkoutSession);

  if (!stripe || !paymentLinkId) {
    return null;
  }

  try {
    return await stripe.paymentLinks.retrieve(paymentLinkId);
  } catch (error) {
    console.error("Failed to retrieve Stripe Payment Link", {
      error,
      paymentLinkId,
    });

    return null;
  }
};

const getCheckoutSessionForPaymentIntent = async (
  paymentIntent: Stripe.PaymentIntent,
) => {
  const stripe = getStripeServer();

  if (!stripe) {
    return null;
  }

  try {
    const sessions = await stripe.checkout.sessions.list({
      limit: 1,
      payment_intent: paymentIntent.id,
    });

    return sessions.data[0] ?? null;
  } catch (error) {
    console.error("Failed to retrieve Stripe Checkout Session for PaymentIntent", {
      error,
      paymentIntentId: paymentIntent.id,
    });

    return null;
  }
};

const shouldLookupCheckoutSession = (paymentIntent: Stripe.PaymentIntent) => {
  const metadata = getStripeMetadata(paymentIntent.metadata);

  if (!trimString(paymentIntent.receipt_email)) {
    return true;
  }

  return [
    metadata.checkout_session_id,
    metadata.customer_country,
    metadata.customer_full_name,
    metadata.customer_nickname,
    metadata.offer_id,
    metadata.product_id,
  ].some((value) => !trimString(value));
};

const getPaymentSourceContext = async (
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent,
): Promise<StripePaymentSourceContext> => {
  // Older Payment Link events may miss product/offer metadata on the intent itself.
  // When that happens, enrich the record from the related Checkout Session and link.
  const checkoutSession = SUPPORTED_CHECKOUT_SESSION_EVENT_TYPES.has(event.type)
    ? (event.data.object as Stripe.Checkout.Session)
    : shouldLookupCheckoutSession(paymentIntent)
      ? await getCheckoutSessionForPaymentIntent(paymentIntent)
      : null;

  const [lineItemLabel, paymentLink] = await Promise.all([
    getCheckoutSessionLineItemLabel(checkoutSession),
    getPaymentLink(checkoutSession),
  ]);

  return {
    checkoutSession,
    lineItemLabel,
    paymentLink,
  };
};

const getPaymentIntentForEvent = async (event: Stripe.Event) => {
  if (SUPPORTED_PAYMENT_INTENT_EVENT_TYPES.has(event.type)) {
    return event.data.object as Stripe.PaymentIntent;
  }

  const stripe = getStripeServer();
  const checkoutSession = event.data.object as Stripe.Checkout.Session;
  const paymentIntent = checkoutSession.payment_intent;

  if (!stripe || !paymentIntent) {
    return null;
  }

  if (typeof paymentIntent !== "string") {
    return paymentIntent;
  }

  return stripe.paymentIntents.retrieve(paymentIntent);
};

const getAccessWorkflowByOfferId = (offerId: string) => {
  const configuredWorkflow = SELLABLE_PRODUCTS_LIST.flatMap((product) => product.offers)
    .find((offer) => offer.id === offerId)
    ?.accessWorkflow?.trim();

  if (configuredWorkflow) {
    return configuredWorkflow;
  }

  if (FIRST_TOUCH_OFFER_IDS.has(offerId)) {
    return "telegram-chat";
  }

  if (WITHOUT_MENTOR_OFFER_IDS.has(offerId)) {
    return "telegram-channel";
  }

  if (WITH_MENTOR_OFFER_IDS.has(offerId)) {
    return "with-mentor";
  }

  return "telegram-chat";
};

const getDeliveryChannelByOfferId = (offerId: string) =>
  SELLABLE_PRODUCTS_LIST.flatMap((product) => product.offers)
    .find((offer) => offer.id === offerId)
    ?.deliveryChannel?.trim() || "telegram";

const createPaymentRecordMappingContext = (
  paymentIntent: Stripe.PaymentIntent,
  existingRecord: PaymentSheetRecord | null,
  sourceContext: StripePaymentSourceContext | null,
): PaymentRecordMappingContext => ({
  checkoutSession: sourceContext?.checkoutSession ?? null,
  existingRecord,
  paymentIntent,
  paymentIntentMetadata: getStripeMetadata(paymentIntent.metadata),
  sourceContext,
  sourceMetadata: getSourceMetadata(sourceContext),
});

const getContextMetadataValue = (
  context: PaymentRecordMappingContext,
  keys: readonly string[],
): string =>
  getMetadataValue(context.paymentIntentMetadata, context.sourceMetadata, keys);

const resolveRecordCheckoutCurrency = (context: PaymentRecordMappingContext): string =>
  getContextMetadataValue(context, PAYMENT_METADATA_KEYS.checkoutCurrency) ||
  context.checkoutSession?.currency ||
  context.existingRecord?.checkout_currency ||
  "";

const resolveRecordCheckoutLocale = (context: PaymentRecordMappingContext): string =>
  getContextMetadataValue(context, PAYMENT_METADATA_KEYS.checkoutLocale) ||
  trimString(context.checkoutSession?.locale) ||
  context.existingRecord?.checkout_locale ||
  "";

const resolveRecordOfferId = (context: PaymentRecordMappingContext): string =>
  getContextMetadataValue(context, PAYMENT_METADATA_KEYS.offerId) ||
  context.existingRecord?.offer_id ||
  "";

const resolveRecordOfferLabel = (
  context: PaymentRecordMappingContext,
  localizedMetadata: ReturnType<typeof getLocalizedOfferMetadataByOfferId>,
): string =>
  getContextMetadataValue(context, PAYMENT_METADATA_KEYS.offerLabel) ||
  localizedMetadata?.offerLabel ||
  context.existingRecord?.offer_label ||
  "";

const resolveRecordProductId = (
  context: PaymentRecordMappingContext,
  localizedMetadata: ReturnType<typeof getLocalizedOfferMetadataByOfferId>,
): string =>
  getContextMetadataValue(context, PAYMENT_METADATA_KEYS.productId) ||
  localizedMetadata?.productId ||
  context.existingRecord?.product_id ||
  "";

const resolveRecordProductTitle = (
  context: PaymentRecordMappingContext,
  localizedMetadata: ReturnType<typeof getLocalizedOfferMetadataByOfferId>,
): string =>
  getContextMetadataValue(context, PAYMENT_METADATA_KEYS.productTitle) ||
  localizedMetadata?.productTitle ||
  context.sourceContext?.lineItemLabel ||
  context.paymentIntent.description ||
  context.existingRecord?.product_title ||
  "";

const resolveCheckoutDetails = (
  context: PaymentRecordMappingContext,
): ResolvedCheckoutDetails => {
  const checkoutCurrency = resolveRecordCheckoutCurrency(context);
  const checkoutLocale = resolveRecordCheckoutLocale(context);
  const offerId = resolveRecordOfferId(context);
  const localizedMetadata = getLocalizedOfferMetadataByOfferId(offerId, checkoutLocale);

  return {
    checkoutCurrency,
    checkoutLocale,
    checkoutSessionId:
      getContextMetadataValue(context, PAYMENT_METADATA_KEYS.checkoutSessionId) ||
      context.checkoutSession?.id ||
      "",
    offerId,
    offerLabel: resolveRecordOfferLabel(context, localizedMetadata),
    productId: resolveRecordProductId(context, localizedMetadata),
    productTitle: resolveRecordProductTitle(context, localizedMetadata),
  };
};

const resolveRecordCustomerAddress = (context: PaymentRecordMappingContext): string =>
  getContextMetadataValue(context, PAYMENT_METADATA_KEYS.customerAddress) ||
  getCheckoutSessionAddressLine(context.checkoutSession) ||
  context.existingRecord?.customer_address ||
  "";

const resolveRecordCustomerCity = (context: PaymentRecordMappingContext): string =>
  getContextMetadataValue(context, PAYMENT_METADATA_KEYS.customerCity) ||
  trimString(context.checkoutSession?.customer_details?.address?.city) ||
  context.existingRecord?.customer_city ||
  "";

const resolveRecordCustomerCountry = (context: PaymentRecordMappingContext): string =>
  getContextMetadataValue(context, PAYMENT_METADATA_KEYS.customerCountry) ||
  context.checkoutSession?.customer_details?.address?.country ||
  context.existingRecord?.customer_country ||
  "";

const resolveRecordCustomerEmail = (context: PaymentRecordMappingContext): string =>
  context.paymentIntent.receipt_email ||
  trimString(context.checkoutSession?.customer_details?.email) ||
  context.existingRecord?.customer_email ||
  "";

const resolveRecordCustomerFullName = (context: PaymentRecordMappingContext): string =>
  getContextMetadataValue(context, PAYMENT_METADATA_KEYS.customerFullName) ||
  trimString(context.checkoutSession?.customer_details?.name) ||
  context.existingRecord?.customer_full_name ||
  "";

const resolveRecordCustomerNickname = (context: PaymentRecordMappingContext): string =>
  getContextMetadataValue(context, PAYMENT_METADATA_KEYS.customerNickname) ||
  getCustomFieldValue(
    context.checkoutSession,
    CHECKOUT_CUSTOM_FIELD_KEYS.customerNickname,
  ) ||
  context.existingRecord?.customer_nickname ||
  "";

const resolveRecordCustomerPostalCode = (context: PaymentRecordMappingContext): string =>
  getContextMetadataValue(context, PAYMENT_METADATA_KEYS.customerPostalCode) ||
  trimString(context.checkoutSession?.customer_details?.address?.postal_code) ||
  context.existingRecord?.customer_postal_code ||
  "";

const resolveRecordLessonLanguage = (context: PaymentRecordMappingContext): string =>
  getContextMetadataValue(context, PAYMENT_METADATA_KEYS.lessonLanguage) ||
  getCustomFieldValue(
    context.checkoutSession,
    CHECKOUT_CUSTOM_FIELD_KEYS.lessonLanguage,
  ) ||
  context.existingRecord?.lesson_language ||
  "";

const resolveCustomerDetails = (
  context: PaymentRecordMappingContext,
): ResolvedCustomerDetails => ({
  address: resolveRecordCustomerAddress(context),
  city: resolveRecordCustomerCity(context),
  country: resolveRecordCustomerCountry(context),
  email: resolveRecordCustomerEmail(context),
  fullName: resolveRecordCustomerFullName(context),
  lessonLanguage: resolveRecordLessonLanguage(context),
  nickname: resolveRecordCustomerNickname(context),
  postalCode: resolveRecordCustomerPostalCode(context),
});

const isTelegramAccessOffer = ({
  accessWorkflow,
  deliveryChannel,
  offerId,
}: {
  accessWorkflow: string;
  deliveryChannel: string;
  offerId: string;
}): boolean =>
  FIRST_TOUCH_OFFER_IDS.has(offerId) ||
  WITHOUT_MENTOR_OFFER_IDS.has(offerId) ||
  WITH_MENTOR_OFFER_IDS.has(offerId) ||
  accessWorkflow === "telegram-renewal" ||
  deliveryChannel === "telegram";

const resolveAccessDetails = (
  context: PaymentRecordMappingContext,
  offerId: string,
): ResolvedAccessDetails => {
  const accessWorkflow =
    getContextMetadataValue(context, PAYMENT_METADATA_KEYS.accessWorkflow) ||
    getAccessWorkflowByOfferId(offerId);
  const deliveryChannel =
    getContextMetadataValue(context, PAYMENT_METADATA_KEYS.deliveryChannel) ||
    getDeliveryChannelByOfferId(offerId);

  return {
    accessWorkflow,
    deliveryChannel,
    telegramAccessStatus: isTelegramAccessOffer({
      accessWorkflow,
      deliveryChannel,
      offerId,
    })
      ? "pending"
      : "not_required",
    telegramChannelChatId: getContextMetadataValue(
      context,
      PAYMENT_METADATA_KEYS.telegramChannelChatId,
    ),
    telegramInspirationChatId: getContextMetadataValue(
      context,
      PAYMENT_METADATA_KEYS.telegramInspirationChatId,
    ),
  };
};

const getExistingRecordValue = (
  context: PaymentRecordMappingContext,
  field: keyof PaymentSheetRecord,
): string => context.existingRecord?.[field] ?? "";

const resolvePreservedAccessDetails = (
  context: PaymentRecordMappingContext,
  checkout: ResolvedCheckoutDetails,
  access: ResolvedAccessDetails,
): PreservedAccessDetails => {
  const existingAccessWorkflow = getExistingRecordValue(context, "access_workflow");
  const existingDeliveryChannel = getExistingRecordValue(context, "delivery_channel");
  const existingTelegramAccessStatus = getExistingRecordValue(
    context,
    "telegram_access_status",
  );
  const isSameOffer = context.existingRecord?.offer_id === checkout.offerId;

  // Stripe status events may arrive out of order; keep delivery progress only
  // when the persisted row still belongs to the same offer.
  return {
    accessWorkflow:
      existingAccessWorkflow && isSameOffer
        ? existingAccessWorkflow
        : access.accessWorkflow,
    deliveryChannel:
      existingDeliveryChannel && isSameOffer
        ? existingDeliveryChannel
        : access.deliveryChannel,
    telegramAccessStatus:
      existingTelegramAccessStatus && isSameOffer
        ? existingTelegramAccessStatus
        : access.telegramAccessStatus,
  };
};

const createPaymentSheetRecord = ({
  access,
  checkout,
  context,
  customer,
  event,
  snapshot,
  timestamp,
}: CreatePaymentSheetRecordInput): PaymentSheetRecord => {
  const preservedAccess = resolvePreservedAccessDetails(context, checkout, access);

  return {
    amount: String(snapshot.amount),
    checkout_currency: checkout.checkoutCurrency,
    currency: snapshot.currency,
    customer_address: customer.address,
    customer_city: customer.city,
    customer_country: customer.country,
    customer_email: customer.email,
    customer_full_name: customer.fullName,
    customer_nickname: customer.nickname,
    customer_postal_code: customer.postalCode,
    checkout_session_id: checkout.checkoutSessionId,
    delivery_channel: preservedAccess.deliveryChannel,
    access_workflow: preservedAccess.accessWorkflow,
    email_delivery_status: getExistingRecordValue(context, "email_delivery_status"),
    email_delivery_updated_at: getExistingRecordValue(
      context,
      "email_delivery_updated_at",
    ),
    first_seen_at: getExistingRecordValue(context, "first_seen_at") || timestamp,
    invoice_issued_at: getExistingRecordValue(context, "invoice_issued_at"),
    invoice_number: getExistingRecordValue(context, "invoice_number"),
    successful_customer_log_status: getExistingRecordValue(
      context,
      "successful_customer_log_status",
    ),
    last_payment_error_code: emptyIfNull(snapshot.lastPaymentErrorCode),
    last_payment_error_message: emptyIfNull(snapshot.lastPaymentErrorMessage),
    latest_event_id: event.id,
    latest_event_type: event.type,
    offer_id: checkout.offerId,
    offer_label: checkout.offerLabel,
    outcome: snapshot.outcome,
    payment_intent_id: snapshot.paymentIntentId,
    product_id: checkout.productId,
    product_title: checkout.productTitle,
    lesson_language: customer.lessonLanguage,
    checkout_locale: checkout.checkoutLocale,
    purchase_item:
      buildPurchaseItemLabel(checkout.productTitle, checkout.offerLabel) ||
      getExistingRecordValue(context, "purchase_item") ||
      "",
    successful_customer_logged_at: getExistingRecordValue(
      context,
      "successful_customer_logged_at",
    ),
    telegram_access_status: preservedAccess.telegramAccessStatus,
    telegram_token_expires_at: getExistingRecordValue(
      context,
      "telegram_token_expires_at",
    ),
    telegram_token_id: getExistingRecordValue(context, "telegram_token_id"),
    telegram_token_used_at: getExistingRecordValue(context, "telegram_token_used_at"),
    telegram_user_id:
      getExistingRecordValue(context, "telegram_user_id") ||
      getContextMetadataValue(context, PAYMENT_METADATA_KEYS.telegramUserId),
    telegram_username:
      getExistingRecordValue(context, "telegram_username") ||
      getContextMetadataValue(context, PAYMENT_METADATA_KEYS.telegramUsername),
    telegram_channel_chat_id:
      getExistingRecordValue(context, "telegram_channel_chat_id") ||
      access.telegramChannelChatId,
    telegram_access_expires_at: getExistingRecordValue(
      context,
      "telegram_access_expires_at",
    ),
    telegram_access_revoked_at: getExistingRecordValue(
      context,
      "telegram_access_revoked_at",
    ),
    telegram_inspiration_chat_id:
      getExistingRecordValue(context, "telegram_inspiration_chat_id") ||
      access.telegramInspirationChatId,
    telegram_inspiration_access_expires_at: getExistingRecordValue(
      context,
      "telegram_inspiration_access_expires_at",
    ),
    status: snapshot.status,
    updated_at: timestamp,
    with_mentor_alert_status: getExistingRecordValue(context, "with_mentor_alert_status"),
    with_mentor_alert_updated_at: getExistingRecordValue(
      context,
      "with_mentor_alert_updated_at",
    ),
  };
};

const mapPaymentIntentToPaymentRecord = (
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent,
  existingRecord: PaymentSheetRecord | null,
  sourceContext: StripePaymentSourceContext | null,
): PaymentSheetRecord => {
  const snapshot = getManagedPaymentIntentSnapshot(paymentIntent);
  const timestamp = toUtcIso();
  const context = createPaymentRecordMappingContext(
    paymentIntent,
    existingRecord,
    sourceContext,
  );
  const checkout = resolveCheckoutDetails(context);
  const customer = resolveCustomerDetails(context);
  const access = resolveAccessDetails(context, checkout.offerId);

  return createPaymentSheetRecord({
    access,
    checkout,
    context,
    customer,
    event,
    snapshot,
    timestamp,
  });
};

export const isSupportedStripePaymentIntentEvent = (eventType: string) =>
  SUPPORTED_PAYMENT_INTENT_EVENT_TYPES.has(eventType) ||
  SUPPORTED_CHECKOUT_SESSION_EVENT_TYPES.has(eventType);

const withPaymentIntentSyncLock = async <T>(
  paymentIntentId: string,
  task: () => Promise<T>,
) => {
  const normalizedPaymentIntentId = paymentIntentId.trim();

  if (!normalizedPaymentIntentId) {
    return task();
  }

  const previousSync = pendingStripePaymentIntentSyncs.get(normalizedPaymentIntentId);
  const previousSyncSafe = previousSync ?? Promise.resolve();
  let releaseLock!: () => void;
  const lockReleasePromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  // Stripe can deliver several status events for one PaymentIntent almost at once.
  // Queue writes per intent so Google Sheets keeps a single coherent row.
  const lockQueueEntry = previousSyncSafe.then(() => lockReleasePromise);

  pendingStripePaymentIntentSyncs.set(normalizedPaymentIntentId, lockQueueEntry);

  await previousSyncSafe;

  try {
    return await task();
  } finally {
    releaseLock();

    if (
      pendingStripePaymentIntentSyncs.get(normalizedPaymentIntentId) === lockQueueEntry
    ) {
      pendingStripePaymentIntentSyncs.delete(normalizedPaymentIntentId);
    }
  }
};

// Payment Links can deliver Checkout Session and PaymentIntent webhooks close
// together, sometimes on different serverless instances. Store a short-lived
// lease in Payments so SuccessfulCustomers is written once per PaymentIntent.
const getSuccessfulCustomerLogLeaseStatus = (eventId: string) =>
  `${SUCCESSFUL_CUSTOMER_LOG_PENDING_PREFIX}${Date.now()}:${eventId}`;

const getSuccessfulCustomerLogLeaseTimestamp = (status: string) => {
  if (!status.startsWith(SUCCESSFUL_CUSTOMER_LOG_PENDING_PREFIX)) {
    return 0;
  }

  const timestamp = Number(
    status.slice(SUCCESSFUL_CUSTOMER_LOG_PENDING_PREFIX.length).split(":")[0],
  );

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const isFreshSuccessfulCustomerLogLease = (status: string) => {
  const timestamp = getSuccessfulCustomerLogLeaseTimestamp(status);

  return timestamp > 0 && timestamp + SUCCESSFUL_CUSTOMER_LOG_LEASE_TTL_MS > Date.now();
};

const hasCompletedSuccessfulCustomerLog = (paymentRecord: PaymentSheetRecord) =>
  paymentRecord.successful_customer_log_status.trim() ===
    SUCCESSFUL_CUSTOMER_LOG_SENT_STATUS ||
  Boolean(paymentRecord.successful_customer_logged_at.trim());

const getFreshPaymentRecord = async (fallbackPaymentRecord: PaymentSheetRecord) =>
  (await findPaymentRecordByIntentId(fallbackPaymentRecord.payment_intent_id, {
    cacheTtlMs: 0,
    source: "sheets",
  })) ?? fallbackPaymentRecord;

const waitForSuccessfulCustomerLogLease = async (paymentRecord: PaymentSheetRecord) => {
  let latestPaymentRecord = paymentRecord;

  for (let attempt = 0; attempt < SUCCESSFUL_CUSTOMER_LOG_WAIT_RETRIES; attempt += 1) {
    await sleep(SUCCESSFUL_CUSTOMER_LOG_WAIT_DELAY_MS);

    latestPaymentRecord = await getFreshPaymentRecord(latestPaymentRecord);

    if (hasCompletedSuccessfulCustomerLog(latestPaymentRecord)) {
      return {
        completed: true,
        paymentRecord: latestPaymentRecord,
      };
    }

    if (
      !isFreshSuccessfulCustomerLogLease(
        latestPaymentRecord.successful_customer_log_status.trim(),
      )
    ) {
      return {
        completed: false,
        paymentRecord: latestPaymentRecord,
      };
    }
  }

  return {
    completed: false,
    paymentRecord: latestPaymentRecord,
  };
};

const tryAcquireSuccessfulCustomerLogLease = async ({
  event,
  paymentRecord,
}: {
  event: Stripe.Event;
  paymentRecord: PaymentSheetRecord;
}) => {
  let latestPaymentRecord = await getFreshPaymentRecord(paymentRecord);

  if (hasCompletedSuccessfulCustomerLog(latestPaymentRecord)) {
    return {
      acquired: false,
      paymentRecord: latestPaymentRecord,
    };
  }

  const currentStatus = latestPaymentRecord.successful_customer_log_status.trim();

  if (isFreshSuccessfulCustomerLogLease(currentStatus)) {
    const leaseResult = await waitForSuccessfulCustomerLogLease(latestPaymentRecord);

    if (leaseResult.completed) {
      return {
        acquired: false,
        paymentRecord: leaseResult.paymentRecord,
      };
    }

    throw new Error("successful_customer_log_in_progress");
  }

  const leaseStatus = getSuccessfulCustomerLogLeaseStatus(event.id);
  const now = toUtcIso();

  await upsertPaymentRecord({
    ...latestPaymentRecord,
    successful_customer_log_status: leaseStatus,
    updated_at: now,
  });

  latestPaymentRecord = await getFreshPaymentRecord(latestPaymentRecord);

  if (hasCompletedSuccessfulCustomerLog(latestPaymentRecord)) {
    return {
      acquired: false,
      paymentRecord: latestPaymentRecord,
    };
  }

  if (latestPaymentRecord.successful_customer_log_status.trim() === leaseStatus) {
    return {
      acquired: true,
      paymentRecord: latestPaymentRecord,
    };
  }

  const leaseResult = await waitForSuccessfulCustomerLogLease(latestPaymentRecord);

  if (leaseResult.completed) {
    return {
      acquired: false,
      paymentRecord: leaseResult.paymentRecord,
    };
  }

  throw new Error("successful_customer_log_in_progress");
};

const appendSuccessfulCustomerRecordOnce = async ({
  event,
  paymentRecord,
}: {
  event: Stripe.Event;
  paymentRecord: PaymentSheetRecord;
}) => {
  if (
    event.type !== SUCCESSFUL_CUSTOMER_LOG_EVENT_TYPE ||
    paymentRecord.outcome !== "succeeded"
  ) {
    return paymentRecord;
  }

  const lease = await tryAcquireSuccessfulCustomerLogLease({
    event,
    paymentRecord,
  });

  if (!lease.acquired) {
    return lease.paymentRecord;
  }

  try {
    await appendSuccessfulCustomerRecord({
      payment_intent_id: lease.paymentRecord.payment_intent_id,
      customer_country: lease.paymentRecord.customer_country,
      customer_email: lease.paymentRecord.customer_email,
      customer_full_address: getCustomerFullAddress(lease.paymentRecord),
      customer_full_name: lease.paymentRecord.customer_full_name,
      customer_nickname: lease.paymentRecord.customer_nickname,
      purchase_item: getPurchaseItemLabel(lease.paymentRecord),
      product_id: lease.paymentRecord.product_id,
      product_title: lease.paymentRecord.product_title,
      offer_id: lease.paymentRecord.offer_id,
      offer_label: lease.paymentRecord.offer_label,
    });
  } catch (error) {
    await upsertPaymentRecord({
      ...lease.paymentRecord,
      successful_customer_log_status: "failed",
      updated_at: toUtcIso(),
    });

    throw error;
  }

  const loggedAt = toUtcIso();

  return upsertPaymentRecord({
    ...lease.paymentRecord,
    successful_customer_logged_at: loggedAt,
    successful_customer_log_status: SUCCESSFUL_CUSTOMER_LOG_SENT_STATUS,
    updated_at: loggedAt,
  });
};

export const syncStripePaymentEventToGoogleSheets = async (
  event: Stripe.Event,
): Promise<StripePaymentWebhookResult> => {
  const pendingSync = pendingStripeWebhookSyncs.get(event.id);

  if (pendingSync) {
    // Same event id, same in-flight work. Return the original result but mark this
    // invocation as duplicate for observability in the route response.
    const result = await pendingSync;

    return {
      ...result,
      duplicate: true,
    };
  }

  const paymentIntentId = getEventPaymentIntentId(event);
  const syncPromise = withPaymentIntentSyncLock(paymentIntentId, () =>
    syncStripePaymentEventToGoogleSheetsInternal(event),
  ).finally(() => {
    pendingStripeWebhookSyncs.delete(event.id);
  });

  pendingStripeWebhookSyncs.set(event.id, syncPromise);

  return syncPromise;
};

const syncStripePaymentEventToGoogleSheetsInternal = async (
  event: Stripe.Event,
): Promise<StripePaymentWebhookResult> => {
  const paymentIntent = await getPaymentIntentForEvent(event);

  if (!paymentIntent) {
    throw new Error(`Stripe event ${event.id} does not include a PaymentIntent.`);
  }

  const [existingEvent, existingPaymentRecord] = await Promise.all([
    findStripeEventRecordByEventId(event.id, {
      source: "sheets",
    }),
    findPaymentRecordByIntentId(paymentIntent.id, {
      cacheTtlMs: 0,
      source: "sheets",
    }),
  ]);
  const sourceContext = await getPaymentSourceContext(event, paymentIntent);
  const paymentRecord = mapPaymentIntentToPaymentRecord(
    event,
    paymentIntent,
    existingPaymentRecord,
    sourceContext,
  );

  if (existingEvent) {
    return {
      duplicate: true,
      eventId: event.id,
      eventType: event.type,
      paymentRecord,
      received: true,
      skipped: false,
    };
  }

  if (event.type === "payment_intent.canceled" && !existingPaymentRecord) {
    // Ignore auto-canceled unused intents in Payments sheet.
    await appendStripeEventRecord({
      event_id: event.id,
      event_type: event.type,
      outcome: paymentRecord.outcome,
      payment_intent_id: paymentRecord.payment_intent_id,
      processed_at: toUtcIso(),
      status: paymentRecord.status,
    });

    return {
      duplicate: false,
      eventId: event.id,
      eventType: event.type,
      paymentRecord,
      received: true,
      skipped: true,
    };
  }

  let savedPaymentRecord = await upsertPaymentRecord(paymentRecord);
  savedPaymentRecord = await appendSuccessfulCustomerRecordOnce({
    event,
    paymentRecord: savedPaymentRecord,
  });

  await appendStripeEventRecord({
    event_id: event.id,
    event_type: event.type,
    outcome: savedPaymentRecord.outcome,
    payment_intent_id: savedPaymentRecord.payment_intent_id,
    processed_at: toUtcIso(),
    status: savedPaymentRecord.status,
  });

  return {
    duplicate: false,
    eventId: event.id,
    eventType: event.type,
    paymentRecord: savedPaymentRecord,
    received: true,
    skipped: false,
  };
};
