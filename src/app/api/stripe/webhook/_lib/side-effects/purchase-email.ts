import type Stripe from "stripe";

import { getDatabase } from "@/db/client";
import { findMyAccessCustomerIdForPaymentIntent } from "@/db/my-access";
import { isResendConfigured, sendResendEmail } from "@/lib/email/resend";
import { ensureInvoiceNumberForPayment } from "@/lib/invoices/invoice-numbering";
import { buildPurchaseInvoiceAttachment } from "@/lib/invoices/purchase-invoice";
import { buildMyAccessUrl } from "@/lib/my-access/link";
import {
  formatPurchaseLine,
  getLocalizedOfferMetadataByOfferId,
  shouldShowOfferToBuyer,
} from "@/lib/sellable-products-localization";
import { getResolvedCheckoutLocale } from "@/lib/stripe-checkout";
import { ensureTelegramAccessLinkForPayment } from "@/lib/telegram/access";
import { isStandardTelegramLinkPayment } from "@/lib/telegram/channel-access-rules";
import {
  getOfferAccessDurationDaysByOfferId,
  getOfferMetadataById,
  isChoreoChannelOfferId,
  isFirstTouchOfferId,
  isWithMentorOfferId,
} from "@/lib/telegram/offer-access";
import { ensureOnlineGroupAccessForPayment } from "@/lib/telegram/online-group-access";

import {
  buildPurchaseSuccessEmail,
  type PurchaseSuccessEmailAccessKind,
} from "../purchase-success-email";
import type { StripePaymentWebhookResult } from "../sync";
import { getPurchaseSideEffectPaymentIntent } from "./eligibility";
import { getPaidHubPeriodDays } from "./purchase-access";
import { shouldSendPurchaseSideEffectForEnvironment } from "./runtime";
import { getReceiptData } from "./stripe-receipt";

const DEFAULT_PRODUCT_TITLE_BY_LOCALE = {
  en: "Course purchase",
  pl: "Zakup kursu",
  ru: "Покупка курса",
} as const;

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

  if (configuredAccessWorkflow === "private-lesson") {
    return "private-lesson";
  }

  if (configuredAccessWorkflow === "telegram-renewal") {
    return "telegram-renewal";
  }

  if (configuredAccessWorkflow === "telegram-online-group") {
    return "telegram-online-group";
  }

  if (
    configuredAccessWorkflow === "telegram-inspiration-hub" ||
    configuredAccessWorkflow === "telegram-hub-renewal"
  ) {
    return "telegram-inspiration-hub";
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

// Resend's test sender may only write to the account owner: on previews such a 403 is
// expected. On production it means the domain or sender broke, and every purchase email
// with its access link would be silently skipped — so there it fails and is retried.
const isExpectedResendRestrictionError = (error: unknown) => {
  if (!(error instanceof Error) || process.env.VERCEL_ENV === "production") {
    return false;
  }

  return (
    error.message.includes("resend_request_failed:403:") &&
    error.message.includes("validation_error")
  );
};

type PurchasePaymentRecord = StripePaymentWebhookResult["paymentRecord"];
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
    !onlineGroupAccess && isStandardTelegramLinkPayment(paymentRecord)
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

/** «Мой доступ» in the email (HUB-D31); a failed lookup only leaves the button out. */
const resolveMyAccessUrl = async (
  paymentRecord: PurchasePaymentRecord,
  checkoutLocale: CheckoutLocale,
): Promise<string | null> => {
  try {
    return buildMyAccessUrl(
      await findMyAccessCustomerIdForPaymentIntent(
        getDatabase(),
        paymentRecord.payment_intent_id,
      ),
      checkoutLocale,
    );
  } catch {
    return null;
  }
};

const buildPreparedPurchaseSuccessEmail = ({
  checkoutLocale,
  localizedOfferMetadata,
  myAccessUrl,
  onlineGroupAccess,
  paymentIntent,
  paymentRecord,
  receipt,
  telegramAccessLink,
}: {
  checkoutLocale: CheckoutLocale;
  localizedOfferMetadata: LocalizedOfferMetadata;
  myAccessUrl: string | null;
  onlineGroupAccess: PurchaseEmailAccess["onlineGroupAccess"];
  paymentIntent: Stripe.PaymentIntent;
  paymentRecord: PurchasePaymentRecord;
  receipt: PurchaseEmailReceipt;
  telegramAccessLink: PurchaseEmailAccess["telegramAccessLink"];
}): PurchaseEmailContent => {
  // The catalogue names the purchase in the buyer's language; the snapshot from
  // the payment is the fallback for offers the catalogue does not know.
  const productTitle =
    localizedOfferMetadata?.productTitle ||
    paymentRecord.product_title ||
    paymentIntent.description ||
    DEFAULT_PRODUCT_TITLE_BY_LOCALE[checkoutLocale];
  const offerLabel =
    localizedOfferMetadata?.offerLabel ||
    paymentRecord.offer_label ||
    paymentIntent.metadata.offer_label ||
    "";
  const showOfferLabel = shouldShowOfferToBuyer(
    paymentIntent.metadata,
    paymentRecord.offer_id,
  );

  return buildPurchaseSuccessEmail({
    accessDurationDays:
      getPaidHubPeriodDays(paymentIntent.metadata) ??
      getOfferAccessDurationDaysByOfferId(paymentRecord.offer_id) ??
      0,
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
    myAccessUrl,
    offerLabel,
    productTitle,
    receiptKind: receipt.receiptKind,
    receiptLink: receipt.receiptLink,
    showMentorFollowupNote: isWithMentorOfferId(paymentRecord.offer_id),
    showOfferLabel,
    subjectLine: formatPurchaseLine(
      localizedOfferMetadata?.productShortTitle || productTitle,
      showOfferLabel ? offerLabel : null,
    ),
    telegramAccessUrl:
      telegramAccessLink?.status === "ready" ? telegramAccessLink.accessUrl : null,
    telegramAccessLinks: onlineGroupAccess ?? [],
  });
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
    myAccessUrl: await resolveMyAccessUrl(paymentRecord, checkoutLocale),
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
    showOfferLabel: shouldShowOfferToBuyer(
      paymentIntent.metadata,
      paymentRecord.offer_id,
    ),
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
