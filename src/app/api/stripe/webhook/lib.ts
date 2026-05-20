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

import { getManagedPaymentIntentSnapshot, getStripeServer } from "../payment-intent/lib";

const SUPPORTED_PAYMENT_INTENT_EVENT_TYPES = new Set([
  "payment_intent.canceled",
  "payment_intent.payment_failed",
  "payment_intent.processing",
  "payment_intent.requires_action",
  "payment_intent.succeeded",
]);
const SUPPORTED_CHECKOUT_SESSION_EVENT_TYPES = new Set(["checkout.session.completed"]);
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

const normalizeStripeLookupKey = (value: string | null | undefined) =>
  trimString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");

const getStripeMetadata = (metadata: Stripe.Metadata | null | undefined) =>
  (metadata ?? {}) as StripeMetadata;

const getMetadataValue = (
  paymentIntentMetadata: StripeMetadata,
  sourceMetadata: StripeMetadata,
  keys: string[],
) => {
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
  keys: string[],
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

  return !trimString(metadata.offer_id) || !trimString(metadata.product_id);
};

const getPaymentSourceContext = async (
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent,
): Promise<StripePaymentSourceContext> => {
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

const mapPaymentIntentToPaymentRecord = (
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent,
  existingRecord: PaymentSheetRecord | null,
  sourceContext: StripePaymentSourceContext | null,
) => {
  const snapshot = getManagedPaymentIntentSnapshot(paymentIntent);
  const timestamp = toUtcIso();
  const paymentIntentMetadata = getStripeMetadata(paymentIntent.metadata);
  const sourceMetadata = getSourceMetadata(sourceContext);
  const checkoutSession = sourceContext?.checkoutSession ?? null;
  const checkoutCurrency =
    getMetadataValue(paymentIntentMetadata, sourceMetadata, [
      "checkout_currency",
      "checkoutCurrency",
    ]) ||
    checkoutSession?.currency ||
    existingRecord?.checkout_currency ||
    "";
  const checkoutLocale =
    getMetadataValue(paymentIntentMetadata, sourceMetadata, [
      "checkout_locale",
      "checkoutLocale",
      "checkout_language",
      "checkoutLanguage",
      "locale",
    ]) ||
    existingRecord?.checkout_locale ||
    "";
  const offerId =
    getMetadataValue(paymentIntentMetadata, sourceMetadata, [
      "offer_id",
      "offerId",
      "offer",
    ]) ||
    existingRecord?.offer_id ||
    "";
  const localizedOfferMetadata = getLocalizedOfferMetadataByOfferId(
    offerId,
    checkoutLocale,
  );
  const offerLabel =
    getMetadataValue(paymentIntentMetadata, sourceMetadata, [
      "offer_label",
      "offerLabel",
    ]) ||
    localizedOfferMetadata?.offerLabel ||
    existingRecord?.offer_label ||
    "";
  const productId =
    getMetadataValue(paymentIntentMetadata, sourceMetadata, [
      "product_id",
      "productId",
      "product",
    ]) ||
    localizedOfferMetadata?.productId ||
    existingRecord?.product_id ||
    "";
  const productTitle =
    getMetadataValue(paymentIntentMetadata, sourceMetadata, [
      "product_title",
      "productTitle",
    ]) ||
    localizedOfferMetadata?.productTitle ||
    sourceContext?.lineItemLabel ||
    paymentIntent.description ||
    existingRecord?.product_title ||
    "";
  const customerFullName =
    getMetadataValue(paymentIntentMetadata, sourceMetadata, [
      "customer_full_name",
      "customerFullName",
      "full_name",
      "fullName",
    ]) ||
    trimString(checkoutSession?.customer_details?.name) ||
    existingRecord?.customer_full_name ||
    "";
  const checkoutSessionId =
    getMetadataValue(paymentIntentMetadata, sourceMetadata, [
      "checkout_session_id",
      "checkoutSessionId",
    ]) ||
    checkoutSession?.id ||
    "";
  const customerNickname =
    getMetadataValue(paymentIntentMetadata, sourceMetadata, [
      "customer_nickname",
      "customerNickname",
      "telegram_username",
      "telegramUsername",
      "telegram",
    ]) ||
    getCustomFieldValue(checkoutSession, [
      "telegram",
      "telegramusername",
      "telegram_username",
      "customernickname",
      "customer_nickname",
    ]) ||
    existingRecord?.customer_nickname ||
    "";
  const customerCountry =
    getMetadataValue(paymentIntentMetadata, sourceMetadata, [
      "customer_country",
      "customerCountry",
      "country",
    ]) ||
    checkoutSession?.customer_details?.address?.country ||
    existingRecord?.customer_country ||
    "";
  const customerEmail =
    paymentIntent.receipt_email ||
    trimString(checkoutSession?.customer_details?.email) ||
    existingRecord?.customer_email ||
    "";
  const lessonLanguage =
    getMetadataValue(paymentIntentMetadata, sourceMetadata, [
      "lesson_language",
      "lessonLanguage",
      "materials_language",
      "materialsLanguage",
      "material_language",
      "materialLanguage",
    ]) ||
    getCustomFieldValue(checkoutSession, [
      "lessonlanguage",
      "lesson_language",
      "materiallanguage",
      "material_language",
      "materialslanguage",
      "materials_language",
      "materials",
    ]) ||
    existingRecord?.lesson_language ||
    "";
  const accessWorkflow =
    getMetadataValue(paymentIntentMetadata, sourceMetadata, [
      "access_workflow",
      "accessWorkflow",
    ]) || getAccessWorkflowByOfferId(offerId);
  const isTelegramAccessOffer =
    FIRST_TOUCH_OFFER_IDS.has(offerId) ||
    WITHOUT_MENTOR_OFFER_IDS.has(offerId) ||
    WITH_MENTOR_OFFER_IDS.has(offerId);
  const deliveryChannel =
    getMetadataValue(paymentIntentMetadata, sourceMetadata, [
      "delivery_channel",
      "deliveryChannel",
    ]) || getDeliveryChannelByOfferId(offerId);
  const telegramAccessStatus = isTelegramAccessOffer ? "pending" : "not_required";
  const shouldKeepExistingAccessWorkflow =
    Boolean(existingRecord?.access_workflow) && existingRecord?.offer_id === offerId;
  const shouldKeepExistingDeliveryChannel =
    Boolean(existingRecord?.delivery_channel) && existingRecord?.offer_id === offerId;
  const shouldKeepExistingTelegramAccessStatus =
    Boolean(existingRecord?.telegram_access_status) &&
    existingRecord?.offer_id === offerId;

  return {
    amount: String(snapshot.amount),
    checkout_currency: checkoutCurrency,
    currency: snapshot.currency,
    customer_address:
      getMetadataValue(paymentIntentMetadata, sourceMetadata, [
        "customer_address",
        "customerAddress",
        "address",
      ]) ||
      getCheckoutSessionAddressLine(checkoutSession) ||
      existingRecord?.customer_address ||
      "",
    customer_city:
      getMetadataValue(paymentIntentMetadata, sourceMetadata, [
        "customer_city",
        "customerCity",
        "city",
      ]) ||
      trimString(checkoutSession?.customer_details?.address?.city) ||
      existingRecord?.customer_city ||
      "",
    customer_country: customerCountry,
    customer_email: customerEmail,
    customer_full_name: customerFullName,
    customer_nickname: customerNickname,
    customer_postal_code:
      getMetadataValue(paymentIntentMetadata, sourceMetadata, [
        "customer_postal_code",
        "customerPostalCode",
        "postal_code",
        "postalCode",
      ]) ||
      trimString(checkoutSession?.customer_details?.address?.postal_code) ||
      existingRecord?.customer_postal_code ||
      "",
    checkout_session_id: checkoutSessionId,
    delivery_channel: shouldKeepExistingDeliveryChannel
      ? existingRecord?.delivery_channel
      : deliveryChannel,
    access_workflow: shouldKeepExistingAccessWorkflow
      ? existingRecord?.access_workflow
      : accessWorkflow,
    email_delivery_status: existingRecord?.email_delivery_status ?? "",
    email_delivery_updated_at: existingRecord?.email_delivery_updated_at ?? "",
    first_seen_at: existingRecord?.first_seen_at || timestamp,
    last_payment_error_code: snapshot.lastPaymentErrorCode ?? "",
    last_payment_error_message: snapshot.lastPaymentErrorMessage ?? "",
    latest_event_id: event.id,
    latest_event_type: event.type,
    offer_id: offerId,
    offer_label: offerLabel,
    outcome: snapshot.outcome,
    payment_intent_id: snapshot.paymentIntentId,
    product_id: productId,
    product_title: productTitle,
    lesson_language: lessonLanguage,
    checkout_locale: checkoutLocale,
    purchase_item:
      existingRecord?.purchase_item || buildPurchaseItemLabel(productTitle, offerLabel),
    successful_customer_logged_at: existingRecord?.successful_customer_logged_at ?? "",
    telegram_access_status: shouldKeepExistingTelegramAccessStatus
      ? existingRecord?.telegram_access_status
      : telegramAccessStatus,
    telegram_token_expires_at: existingRecord?.telegram_token_expires_at ?? "",
    telegram_token_id: existingRecord?.telegram_token_id ?? "",
    telegram_token_used_at: existingRecord?.telegram_token_used_at ?? "",
    telegram_user_id: existingRecord?.telegram_user_id ?? "",
    telegram_username: existingRecord?.telegram_username ?? "",
    telegram_channel_chat_id: existingRecord?.telegram_channel_chat_id ?? "",
    telegram_access_expires_at: existingRecord?.telegram_access_expires_at ?? "",
    telegram_access_revoked_at: existingRecord?.telegram_access_revoked_at ?? "",
    status: snapshot.status,
    updated_at: timestamp,
    with_mentor_alert_status: existingRecord?.with_mentor_alert_status ?? "",
    with_mentor_alert_updated_at: existingRecord?.with_mentor_alert_updated_at ?? "",
  } satisfies PaymentSheetRecord;
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

export const syncStripePaymentEventToGoogleSheets = async (
  event: Stripe.Event,
): Promise<StripePaymentWebhookResult> => {
  const pendingSync = pendingStripeWebhookSyncs.get(event.id);

  if (pendingSync) {
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
    findStripeEventRecordByEventId(event.id),
    findPaymentRecordByIntentId(paymentIntent.id, {
      cacheTtlMs: 0,
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

  if (
    savedPaymentRecord.outcome === "succeeded" &&
    !savedPaymentRecord.successful_customer_logged_at
  ) {
    await appendSuccessfulCustomerRecord({
      payment_intent_id: savedPaymentRecord.payment_intent_id,
      customer_country: savedPaymentRecord.customer_country,
      customer_email: savedPaymentRecord.customer_email,
      customer_full_address: getCustomerFullAddress(savedPaymentRecord),
      customer_full_name: savedPaymentRecord.customer_full_name,
      customer_nickname: savedPaymentRecord.customer_nickname,
      purchase_item: getPurchaseItemLabel(savedPaymentRecord),
      product_id: savedPaymentRecord.product_id,
      product_title: savedPaymentRecord.product_title,
      offer_id: savedPaymentRecord.offer_id,
      offer_label: savedPaymentRecord.offer_label,
    });
    savedPaymentRecord = await upsertPaymentRecord({
      ...savedPaymentRecord,
      successful_customer_logged_at: toUtcIso(),
    });
  }

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
