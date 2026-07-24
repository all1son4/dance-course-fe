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

  const emailSyncPromise = (async () => {
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
    const onlineGroupAccess = await ensureOnlineGroupAccessForPayment(paymentRecord);
    const telegramAccessLink =
      !onlineGroupAccess &&
      paymentRecord.access_workflow.trim() !== "manual-admin" &&
      isOfferEligibleForTelegramAccessLink(paymentRecord.offer_id)
        ? await ensureTelegramAccessLinkForPayment(paymentRecord)
        : null;

    if (onlineGroupAccess?.some((access) => access.status === "unavailable")) {
      await tryUpdatePaymentEmailDeliveryStatus({
        paymentRecord,
        status: "failed",
      });
      throw new Error("online_group_access_link_unavailable");
    }

    if (
      telegramAccessLink?.status === "not_available" &&
      telegramAccessLink.reason === "telegram_api_failed"
    ) {
      await tryUpdatePaymentEmailDeliveryStatus({
        paymentRecord,
        status: "failed",
      });
      throw new Error("telegram_access_link_unavailable");
    }

    const {
      receiptKind,
      receiptLink,
      recipientEmail: stripeBillingEmail,
    } = await getReceiptData(stripe, paymentIntent);
    const recipientEmail =
      paymentRecord.customer_email || paymentIntent.receipt_email || stripeBillingEmail;

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

    const { html, subject, text } = buildPurchaseSuccessEmail({
      accessDurationDays:
        getOfferAccessDurationDaysByOfferId(paymentRecord.offer_id) ?? 0,
      accessKind: getPurchaseSuccessEmailAccessKind({
        accessWorkflow: paymentRecord.access_workflow,
        offerId: paymentRecord.offer_id,
      }),
      amountMinor: paymentRecord.amount,
      checkoutCurrency: paymentRecord.checkout_currency || paymentRecord.currency,
      checkoutLocale,
      inspirationAccessExpiresAt: paymentRecord.telegram_inspiration_access_expires_at,
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
      receiptKind,
      receiptLink,
      showMentorFollowupNote: isWithMentorOfferId(paymentRecord.offer_id),
      telegramAccessUrl:
        telegramAccessLink?.status === "ready" ? telegramAccessLink.accessUrl : null,
      telegramAccessLinks: onlineGroupAccess ?? [],
    });

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
        html,
        idempotencyKey: `purchase-success/${paymentRecord.payment_intent_id}`,
        subject,
        text,
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
  })().finally(() => {
    pendingPurchaseEmailSyncs.delete(paymentIntentId);
  });

  pendingPurchaseEmailSyncs.set(paymentIntentId, emailSyncPromise);
  await emailSyncPromise;
};
