import type Stripe from "stripe";

import { isResendConfigured, sendResendEmail } from "@/lib/email/resend";
import { GoogleSheetsError, isGoogleSheetsConfigured } from "@/lib/google-sheets";
import { isPayloadTooLarge, jsonNoStore } from "@/lib/http-security";

import { getStripeServer } from "../payment-intent/lib";
import {
  isSupportedStripePaymentIntentEvent,
  syncStripePaymentEventToGoogleSheets,
} from "./lib";
import { buildPurchaseSuccessEmail } from "./purchase-success-email";

const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const MAX_WEBHOOK_BODY_BYTES = 1_000_000;

export const runtime = "nodejs";

type StripeReceiptData = {
  receiptKind: "pdf" | "receipt" | null;
  receiptLink: string | null;
  recipientEmail: string;
};

const getReceiptData = async (
  stripe: Stripe,
  paymentIntent: Stripe.PaymentIntent,
): Promise<StripeReceiptData> => {
  const latestChargeId =
    typeof paymentIntent.latest_charge === "string"
      ? paymentIntent.latest_charge
      : (paymentIntent.latest_charge?.id ?? "");

  if (!latestChargeId) {
    return {
      receiptKind: null,
      receiptLink: null,
      recipientEmail: "",
    };
  }

  try {
    const charge = await stripe.charges.retrieve(latestChargeId);
    const billingEmail = charge.billing_details?.email?.trim() ?? "";
    const receiptLink = charge.receipt_url ?? null;
    const receiptKind = receiptLink
      ? /\.pdf(?:[?#].*)?$/i.test(receiptLink)
        ? "pdf"
        : "receipt"
      : null;

    return {
      receiptKind,
      receiptLink,
      recipientEmail: billingEmail,
    };
  } catch (error) {
    console.error("Failed to retrieve Stripe receipt data", {
      error,
      latestChargeId,
      paymentIntentId: paymentIntent.id,
    });

    return {
      receiptKind: null,
      receiptLink: null,
      recipientEmail: "",
    };
  }
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

const sendPurchaseSuccessEmail = async ({
  event,
  handledEvent,
  stripe,
}: {
  event: Stripe.Event;
  handledEvent: Awaited<ReturnType<typeof syncStripePaymentEventToGoogleSheets>>;
  stripe: Stripe;
}) => {
  if (event.type !== "payment_intent.succeeded" || handledEvent.duplicate) {
    return;
  }

  if (!isResendConfigured()) {
    console.warn("RESEND_API_KEY is not configured, skipping purchase email", {
      eventId: handledEvent.eventId,
      paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
    });
    return;
  }

  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const paymentRecord = handledEvent.paymentRecord;
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
    return;
  }

  const { html, subject, text } = buildPurchaseSuccessEmail({
    amountMinor: paymentRecord.amount,
    checkoutCurrency: paymentRecord.checkout_currency || paymentRecord.currency,
    checkoutLocale: paymentIntent.metadata.checkout_locale,
    offerLabel: paymentRecord.offer_label,
    productId: paymentRecord.product_id,
    productTitle:
      paymentRecord.product_title || paymentIntent.description || "Course purchase",
    receiptKind,
    receiptLink,
  });

  const { emailId } = await sendResendEmail({
    html,
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
};

export async function POST(request: Request) {
  if (isPayloadTooLarge(request, MAX_WEBHOOK_BODY_BYTES)) {
    return jsonNoStore(
      {
        errorCode: "payload_too_large",
      },
      { status: 413 },
    );
  }

  const stripe = getStripeServer();

  if (!stripe) {
    return jsonNoStore(
      {
        errorCode: "missing_secret_key",
      },
      { status: 500 },
    );
  }

  if (!isGoogleSheetsConfigured()) {
    return jsonNoStore(
      {
        errorCode: "google_sheets_not_configured",
      },
      { status: 500 },
    );
  }

  if (!stripeWebhookSecret) {
    return jsonNoStore(
      {
        errorCode: "missing_webhook_secret",
      },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return jsonNoStore(
      {
        errorCode: "missing_webhook_signature",
      },
      { status: 400 },
    );
  }

  try {
    const payload = await request.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(payload, signature, stripeWebhookSecret);
    } catch (error) {
      console.error("Failed to verify Stripe webhook signature", error);

      return jsonNoStore(
        {
          errorCode: "invalid_webhook_signature",
        },
        { status: 400 },
      );
    }

    if (!isSupportedStripePaymentIntentEvent(event.type)) {
      return jsonNoStore({
        eventId: event.id,
        ignored: true,
        received: true,
        type: event.type,
      });
    }

    const handledEvent = await syncStripePaymentEventToGoogleSheets(event);

    try {
      await sendPurchaseSuccessEmail({
        event,
        handledEvent,
        stripe,
      });
    } catch (error) {
      if (isExpectedResendRestrictionError(error)) {
        console.warn("Purchase success email skipped (Resend test-domain restriction)", {
          eventId: handledEvent.eventId,
          paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
        });
        return jsonNoStore(handledEvent);
      }

      console.error("Failed to send purchase success email", {
        error,
        eventId: handledEvent.eventId,
        paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
      });
    }

    if (
      !handledEvent.skipped &&
      (handledEvent.paymentRecord.outcome === "failed" ||
        handledEvent.paymentRecord.outcome === "canceled")
    ) {
      console.warn("Stripe payment did not complete", {
        eventId: handledEvent.eventId,
        eventType: handledEvent.eventType,
        outcome: handledEvent.paymentRecord.outcome,
        paymentIntentId: handledEvent.paymentRecord.payment_intent_id,
        status: handledEvent.paymentRecord.status,
      });
    }

    return jsonNoStore(handledEvent);
  } catch (error) {
    if (error instanceof GoogleSheetsError) {
      console.error("Failed to sync Stripe webhook to Google Sheets", {
        details: error.details,
        errorCode: error.code,
        status: error.status,
      });

      return jsonNoStore(
        {
          errorCode: "stripe_webhook_sync_failed",
        },
        { status: 500 },
      );
    }

    console.error("Failed to process Stripe webhook", error);

    return jsonNoStore(
      {
        errorCode: "stripe_webhook_failed",
      },
      { status: 500 },
    );
  }
}
