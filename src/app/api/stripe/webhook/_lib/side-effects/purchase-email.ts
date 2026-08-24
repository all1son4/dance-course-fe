import type Stripe from "stripe";

import { isResendConfigured, sendResendEmail } from "@/lib/email/resend";
import { ensureInvoiceNumberForPayment } from "@/lib/invoices/invoice-numbering";
import { buildPurchaseInvoiceAttachment } from "@/lib/invoices/purchase-invoice";
import { getLocalizedOfferMetadataByOfferId } from "@/lib/sellable-products-localization";
import {
  ensureTelegramAccessLinkForPayment,
  isOfferEligibleForTelegramAccessLink,
} from "@/lib/telegram/access";
import {
  getOfferAccessDurationDaysByOfferId,
  getOfferMetadataById,
  isChoreoChannelOfferId,
  isFirstTouchOfferId,
  isWithMentorOfferId,
} from "@/lib/telegram/offer-access";
import { ensureOnlineGroupAccessForPayment } from "@/lib/telegram/online-group-access";

import { getResolvedCheckoutLocale } from "../../../payment-intent/lib";
import {
  buildPurchaseSuccessEmail,
  type PurchaseSuccessEmailAccessKind,
} from "../purchase-success-email";
import { getPurchaseSideEffectPaymentIntent } from "./eligibility";
import {
  tryAcquirePaymentProcessingLease,
  tryUpdatePaymentEmailDeliveryStatus,
} from "./payment-status-lease";
import { shouldSendPurchaseSideEffectForEnvironment } from "./runtime";
import { getReceiptData } from "./stripe-receipt";
import type { StripeWebhookSyncResult } from "./types";

const DEFAULT_PRODUCT_TITLE_BY_LOCALE = {
  en: "Course purchase",
  pl: "Zakup kursu",
  ru: "Покупка курса",
} as const;

const pendingPurchaseEmailSyncs = new Map<string, Promise<void>>();

const getPurchaseSuccessEmailAccessKind = ({
  accessWorkflow,
  offerId,
}: {
  accessWorkflow: string;
  offerId: string;
}): PurchaseSuccessEmailAccessKind => {
  const configuredAccessWorkflow =
    accessWorkflow.trim().toLowerCase() ||
    getOfferMetadataById(offerId)?.accessWorkflow.trim().toLowerCase() ||
    "";

  if (configuredAccessWorkflow === "manual-admin") {
    return "manual-admin";
  }

  if (configuredAccessWorkflow === "telegram-renewal") {
    return "telegram-renewal";
  }

  if (configuredAccessWorkflow === "telegram-online-group") {
    return "telegram-online-group";
  }

  if (configuredAccessWorkflow === "telegram-channel-lifetime") {
    return "telegram-channel-lifetime";
  }

  if (isFirstTouchOfferId(offerId)) {
    return "telegram-chat";
  }

  if (isChoreoChannelOfferId(offerId)) {
    return "telegram-channel";
  }

  return "support";
};

const isExpectedResendRestrictionError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("resend_request_failed:403:") &&
    error.message.includes("validation_error")
  );
};

type PurchasePaymentRecord = StripeWebhookSyncResult["paymentRecord"];
type PurchaseEmailAccess = {
  onlineGroupAccess: Awaited<ReturnType<typeof ensureOnlineGroupAccessForPayment>>;
  telegramAccessLink: Awaited<
    ReturnType<typeof ensureTelegramAccessLinkForPayment>
  > | null;
};
type PurchaseEmailReceipt = Awaited<ReturnType<typeof getReceiptData>>;
type PurchaseEmailContent = ReturnType<typeof buildPurchaseSuccessEmail>;
type CheckoutLocale = ReturnType<typeof getResolvedCheckoutLocale>;
type LocalizedOfferMetadata = ReturnType<typeof getLocalizedOfferMetadataByOfferId>;

const preparePurchaseEmailAccess = async (
  paymentRecord: PurchasePaymentRecord,
): Promise<PurchaseEmailAccess> => {
  const onlineGroupAccess = await ensureOnlineGroupAccessForPayment(paymentRecord);
  const telegramAccessLink =
    !onlineGroupAccess &&
    paymentRecord.access_workflow.trim() !== "manual-admin" &&
    isOfferEligibleForTelegramAccessLink(paymentRecord.offer_id)
      ? await ensureTelegramAccessLinkForPayment(paymentRecord)
      : null;

  return {
    onlineGroupAccess,
    telegramAccessLink,
  };
};

const getPurchaseEmailAccessFailure = ({
  onlineGroupAccess,
  telegramAccessLink,
}: PurchaseEmailAccess): string | null => {
  if (onlineGroupAccess?.some((access) => access.status === "unavailable")) {
    return "online_group_access_link_unavailable";
  }

  if (
    telegramAccessLink?.status === "not_available" &&
    telegramAccessLink.reason === "telegram_api_failed"
  ) {
    return "telegram_access_link_unavailable";
  }

  return null;
};

const resolvePurchaseEmailRecipient = ({
  paymentRecord,
  paymentIntent,
  receipt,
}: {
  paymentRecord: PurchasePaymentRecord;
  paymentIntent: Stripe.PaymentIntent;
  receipt: PurchaseEmailReceipt;
}): string =>
  paymentRecord.customer_email || paymentIntent.receipt_email || receipt.recipientEmail;

const buildPreparedPurchaseSuccessEmail = ({
  checkoutLocale,
  localizedOfferMetadata,
  onlineGroupAccess,
  paymentIntent,
  paymentRecord,
  receipt,
  telegramAccessLink,
}: {
  checkoutLocale: CheckoutLocale;
  localizedOfferMetadata: LocalizedOfferMetadata;
  onlineGroupAccess: PurchaseEmailAccess["onlineGroupAccess"];
  paymentIntent: Stripe.PaymentIntent;
  paymentRecord: PurchasePaymentRecord;
  receipt: PurchaseEmailReceipt;
  telegramAccessLink: PurchaseEmailAccess["telegramAccessLink"];
}): PurchaseEmailContent =>
  buildPurchaseSuccessEmail({
    accessDurationDays: getOfferAccessDurationDaysByOfferId(paymentRecord.offer_id) ?? 0,
    accessKind: getPurchaseSuccessEmailAccessKind({
      accessWorkflow: paymentRecord.access_workflow,
      offerId: paymentRecord.offer_id,
    }),
    amountMinor: paymentRecord.amount,
    checkoutCurrency: paymentRecord.checkout_currency || paymentRecord.currency,
    checkoutLocale,
    inspirationAccessExpiresAt: onlineGroupAccess?.find(
      (access) => access.accessKey === "inspiration-hub",
    )?.accessExpiresAt,
    offerLabel:
      paymentRecord.offer_label ||
      paymentIntent.metadata.offer_label ||
      localizedOfferMetadata?.offerLabel ||
      "",
    productTitle:
      paymentRecord.product_title ||
      paymentIntent.description ||
      localizedOfferMetadata?.productTitle ||
      DEFAULT_PRODUCT_TITLE_BY_LOCALE[checkoutLocale],
    receiptKind: receipt.receiptKind,
    receiptLink: receipt.receiptLink,
    showMentorFollowupNote: isWithMentorOfferId(paymentRecord.offer_id),
    telegramAccessUrl:
      telegramAccessLink?.status === "ready" ? telegramAccessLink.accessUrl : null,
    telegramAccessLinks: onlineGroupAccess ?? [],
  });

const deliverPurchaseSuccessEmail = async ({
  content,
  event,
  handledEvent,
  paymentRecord,
  recipientEmail,
}: {
  content: PurchaseEmailContent;
  event: Stripe.Event;
  handledEvent: StripeWebhookSyncResult;
  paymentRecord: PurchasePaymentRecord;
  recipientEmail: string;
}): Promise<void> => {
  try {
    const invoiceIssuedAt = new Date(event.created * 1000);
    const invoicedPaymentRecord = await ensureInvoiceNumberForPayment({
      issuedAt: invoiceIssuedAt,
      paymentRecord,
    });
    const invoiceAttachment = await buildPurchaseInvoiceAttachment({
      issuedAt: invoiceIssuedAt,
      paymentRecord: invoicedPaymentRecord,
    });
    const { emailId } = await sendResendEmail({
      attachments: [invoiceAttachment],
      html: content.html,
      idempotencyKey: `purchase-success/${paymentRecord.payment_intent_id}`,
      subject: content.subject,
      text: content.text,
      to: recipientEmail,
    });

    console.warn("Purchase success email sent", {
      emailId,
      eventId: handledEvent.eventId,
      paymentIntentId: paymentRecord.payment_intent_id,
      recipientEmail,
    });

    await tryUpdatePaymentEmailDeliveryStatus({
      paymentRecord,
      status: "sent",
    });
  } catch (error) {
    if (isExpectedResendRestrictionError(error)) {
      console.warn("Purchase success email skipped (Resend test-domain restriction)", {
        eventId: handledEvent.eventId,
        paymentIntentId: paymentRecord.payment_intent_id,
      });

      await tryUpdatePaymentEmailDeliveryStatus({
        paymentRecord,
        status: "skipped",
      });
      return;
    }

    console.error("Failed to send purchase success email", {
      error,
      eventId: handledEvent.eventId,
      paymentIntentId: paymentRecord.payment_intent_id,
    });

    await tryUpdatePaymentEmailDeliveryStatus({
      paymentRecord,
      status: "failed",
    });
    throw error;
  }
};

const syncPurchaseSuccessEmail = async ({
  event,
  handledEvent,
  paymentIntent,
  stripe,
}: {
  event: Stripe.Event;
  handledEvent: StripeWebhookSyncResult;
  paymentIntent: Stripe.PaymentIntent;
  stripe: Stripe;
}): Promise<void> => {
  const paymentIntentIdForLease = handledEvent.paymentRecord.payment_intent_id;
  const emailLease = await tryAcquirePaymentProcessingLease({
    completedStatuses: new Set(["sent", "skipped"]),
    fallbackPaymentRecord: handledEvent.paymentRecord,
    paymentIntentId: paymentIntentIdForLease,
    statusField: "email_delivery_status",
    updatedAtField: "email_delivery_updated_at",
  });

  if (!emailLease.acquired) {
    return;
  }

  const paymentRecord = emailLease.paymentRecord;
  const checkoutLocale = getResolvedCheckoutLocale(
    paymentRecord.checkout_locale || paymentIntent.metadata.checkout_locale,
  );
  const localizedOfferMetadata = getLocalizedOfferMetadataByOfferId(
    paymentRecord.offer_id,
    checkoutLocale,
  );
  const access = await preparePurchaseEmailAccess(paymentRecord);
  const accessFailure = getPurchaseEmailAccessFailure(access);

  if (accessFailure) {
    await tryUpdatePaymentEmailDeliveryStatus({
      paymentRecord,
      status: "failed",
    });
    throw new Error(accessFailure);
  }

  const receipt = await getReceiptData(stripe, paymentIntent);
  const recipientEmail = resolvePurchaseEmailRecipient({
    paymentIntent,
    paymentRecord,
    receipt,
  });

  if (!recipientEmail) {
    console.warn("Missing customer email for purchase success notification", {
      eventId: handledEvent.eventId,
      paymentIntentId: paymentRecord.payment_intent_id,
    });
    await tryUpdatePaymentEmailDeliveryStatus({
      paymentRecord,
      status: "failed",
    });
    return;
  }

  const content = buildPreparedPurchaseSuccessEmail({
    checkoutLocale,
    localizedOfferMetadata,
    onlineGroupAccess: access.onlineGroupAccess,
    paymentIntent,
    paymentRecord,
    receipt,
    telegramAccessLink: access.telegramAccessLink,
  });

  await deliverPurchaseSuccessEmail({
    content,
    event,
    handledEvent,
    paymentRecord,
    recipientEmail,
  });
};

export const sendPurchaseSuccessEmail = async ({
  event,
  handledEvent,
  stripe,
}: {
  event: Stripe.Event;
  handledEvent: StripeWebhookSyncResult;
  stripe: Stripe;
}) => {
  if (handledEvent.paymentRecord.outcome !== "succeeded") {
    return;
  }

  if (!shouldSendPurchaseSideEffectForEnvironment(event)) {
    console.warn("Skipping purchase email for Stripe test-mode event in non-production", {
      eventId: handledEvent.eventId,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });
    return;
  }

  if (!isResendConfigured()) {
    console.warn("RESEND_API_KEY is not configured, skipping purchase email", {
      eventId: handledEvent.eventId,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });
    await tryUpdatePaymentEmailDeliveryStatus({
      paymentRecord: handledEvent.paymentRecord,
      status: "skipped",
    });
    return;
  }

  const paymentIntent = await getPurchaseSideEffectPaymentIntent({
    event,
    stripe,
  });

  if (!paymentIntent) {
    console.warn("Missing PaymentIntent for purchase success email", {
      eventId: handledEvent.eventId,
      eventType: handledEvent.eventType,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });
    await tryUpdatePaymentEmailDeliveryStatus({
      paymentRecord: handledEvent.paymentRecord,
      status: "failed",
    });
    return;
  }

  const paymentIntentId = paymentIntent.id;
  const pendingSync = pendingPurchaseEmailSyncs.get(paymentIntentId);

  if (pendingSync) {
    await pendingSync;
    return;
  }

  const emailSyncPromise = syncPurchaseSuccessEmail({
    event,
    handledEvent,
    paymentIntent,
    stripe,
  }).finally(() => {
    pendingPurchaseEmailSyncs.delete(paymentIntentId);
  });

  pendingPurchaseEmailSyncs.set(paymentIntentId, emailSyncPromise);
  await emailSyncPromise;
};

export const deliverPurchaseSuccessEmailFromOutbox = async ({
  event,
  idempotencyKey,
  paymentRecord,
  stripe,
}: {
  event: Stripe.Event;
  idempotencyKey: string;
  paymentRecord: PurchasePaymentRecord;
  stripe: Stripe;
}): Promise<{ externalMessageId?: string; skipped?: boolean }> => {
  if (
    paymentRecord.outcome !== "succeeded" ||
    !shouldSendPurchaseSideEffectForEnvironment(event)
  ) {
    return { skipped: true };
  }

  if (!isResendConfigured()) {
    throw new Error("missing_resend_api_key");
  }

  const paymentIntent = await getPurchaseSideEffectPaymentIntent({ event, stripe });

  if (!paymentIntent) {
    throw new Error("purchase_email_payment_intent_missing");
  }

  const checkoutLocale = getResolvedCheckoutLocale(
    paymentRecord.checkout_locale || paymentIntent.metadata.checkout_locale,
  );
  const localizedOfferMetadata = getLocalizedOfferMetadataByOfferId(
    paymentRecord.offer_id,
    checkoutLocale,
  );
  const access = await preparePurchaseEmailAccess(paymentRecord);
  const accessFailure = getPurchaseEmailAccessFailure(access);

  if (accessFailure) {
    throw new Error(accessFailure);
  }

  const receipt = await getReceiptData(stripe, paymentIntent);
  const recipientEmail = resolvePurchaseEmailRecipient({
    paymentIntent,
    paymentRecord,
    receipt,
  });

  if (!recipientEmail) {
    return { skipped: true };
  }

  const content = buildPreparedPurchaseSuccessEmail({
    checkoutLocale,
    localizedOfferMetadata,
    onlineGroupAccess: access.onlineGroupAccess,
    paymentIntent,
    paymentRecord,
    receipt,
    telegramAccessLink: access.telegramAccessLink,
  });
  const invoiceIssuedAt = new Date(event.created * 1000);
  const invoicedPaymentRecord = await ensureInvoiceNumberForPayment({
    issuedAt: invoiceIssuedAt,
    paymentRecord,
  });
  const invoiceAttachment = await buildPurchaseInvoiceAttachment({
    issuedAt: invoiceIssuedAt,
    paymentRecord: invoicedPaymentRecord,
  });

  try {
    const { emailId } = await sendResendEmail({
      attachments: [invoiceAttachment],
      html: content.html,
      idempotencyKey,
      subject: content.subject,
      text: content.text,
      to: recipientEmail,
    });

    return { externalMessageId: emailId };
  } catch (error) {
    if (isExpectedResendRestrictionError(error)) {
      return { skipped: true };
    }

    throw error;
  }
};
