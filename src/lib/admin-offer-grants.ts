import {
  type CreateAdminOfferGrantCommand,
  createAdminOfferGrantInDatabase,
} from "@/db/admin-offer-grants";
import { getDomainPersistenceMode } from "@/db/domain-persistence";
import {
  appendSuccessfulCustomerRecord,
  isGoogleSheetsRateLimitError,
  upsertPaymentRecord,
} from "@/lib/google-sheets";
import type { PaymentSheetRecord } from "@/lib/google-sheets-schema";
import { isSheetsExportEnabled } from "@/lib/sheets-export-outbox";

export type AdminOfferGrantRuntime = "database" | "legacy";

const toIso = (value: Date) => value.toISOString();

export const getAdminOfferGrantRuntime = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AdminOfferGrantRuntime =>
  getDomainPersistenceMode("businessOperations", environment) === "database"
    ? "database"
    : "legacy";

export const shouldExportAdminOfferGrantToSheets = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
) => isSheetsExportEnabled(environment);

const usesDatabase = () => getAdminOfferGrantRuntime() === "database";

export const isAdminOfferGrantPersistenceRateLimitError = (error: unknown) =>
  !usesDatabase() && isGoogleSheetsRateLimitError(error);

const toLegacyPaymentRecord = (
  command: CreateAdminOfferGrantCommand,
): PaymentSheetRecord => {
  const createdAt = toIso(command.createdAt);

  return {
    access_workflow: command.accessWorkflow,
    amount: "0",
    checkout_currency: "pln",
    checkout_locale: "ru",
    checkout_session_id: command.checkoutSessionId,
    currency: "pln",
    customer_address: "",
    customer_city: "",
    customer_country: "",
    customer_email: "",
    customer_full_name: "",
    customer_nickname: command.adminLabel,
    customer_postal_code: "",
    delivery_channel: "telegram",
    email_delivery_status: "",
    email_delivery_updated_at: "",
    first_seen_at: createdAt,
    invoice_issued_at: "",
    invoice_number: "",
    last_payment_error_code: "",
    last_payment_error_message: "",
    latest_event_id: command.eventId,
    latest_event_type:
      command.accessWorkflow === "telegram-online-group"
        ? "admin.online_group_link.generated"
        : "admin.offer_link.generated",
    lesson_language: command.lessonLanguage,
    offer_id: command.offerExternalId,
    offer_label: command.offerLabel,
    outcome: "succeeded",
    payment_intent_id: command.paymentIntentId,
    product_id: command.productExternalId,
    product_title: command.productTitle,
    purchase_item: command.purchaseItem,
    status: "succeeded",
    successful_customer_logged_at: createdAt,
    successful_customer_log_status: "sent",
    telegram_access_expires_at: "",
    telegram_access_revoked_at: "",
    telegram_access_status: "pending",
    telegram_channel_chat_id: command.mainChatId?.trim() ?? "",
    telegram_inspiration_access_expires_at: "",
    telegram_inspiration_chat_id: command.inspirationChatId?.trim() ?? "",
    telegram_token_expires_at: "",
    telegram_token_id: "",
    telegram_token_used_at: "",
    telegram_user_id: "",
    telegram_username: "",
    updated_at: createdAt,
    with_mentor_alert_status: "",
    with_mentor_alert_updated_at: "",
  };
};

const appendLegacySuccessfulCustomer = (paymentRecord: PaymentSheetRecord) =>
  appendSuccessfulCustomerRecord({
    customer_country: paymentRecord.customer_country,
    customer_email: paymentRecord.customer_email,
    customer_full_address: [
      paymentRecord.customer_address.trim(),
      paymentRecord.customer_city.trim(),
      paymentRecord.customer_postal_code.trim(),
    ]
      .filter(Boolean)
      .join(", "),
    customer_full_name: paymentRecord.customer_full_name,
    customer_nickname: paymentRecord.customer_nickname,
    offer_id: paymentRecord.offer_id,
    offer_label: paymentRecord.offer_label,
    payment_intent_id: paymentRecord.payment_intent_id,
    product_id: paymentRecord.product_id,
    product_title: paymentRecord.product_title,
    purchase_item: paymentRecord.purchase_item,
  });

export const createAdminOfferGrant = async (
  command: Omit<CreateAdminOfferGrantCommand, "enqueueSuccessfulCustomerExport">,
) => {
  if (usesDatabase()) {
    return createAdminOfferGrantInDatabase({
      ...command,
      enqueueSuccessfulCustomerExport: shouldExportAdminOfferGrantToSheets(),
    });
  }

  const paymentRecord = await upsertPaymentRecord(
    toLegacyPaymentRecord({
      ...command,
      enqueueSuccessfulCustomerExport: true,
    }),
  );

  await appendLegacySuccessfulCustomer(paymentRecord);

  return paymentRecord;
};

export type { PaymentSheetRecord } from "@/lib/google-sheets-schema";
