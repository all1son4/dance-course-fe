import type Stripe from "stripe";

import { logSafeError } from "@/lib/safe-error-log";

import type { StripeReceiptData } from "./types";

export const getReceiptData = async (
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
    logSafeError("Failed to retrieve Stripe receipt data", error);

    return {
      receiptKind: null,
      receiptLink: null,
      recipientEmail: "",
    };
  }
};
