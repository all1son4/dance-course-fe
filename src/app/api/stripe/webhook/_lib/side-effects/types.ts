import type { StripePaymentWebhookResult } from "../sync";

export type StripeWebhookSyncResult = StripePaymentWebhookResult;

export type StripeReceiptData = {
  receiptKind: "pdf" | "receipt" | null;
  receiptLink: string | null;
  recipientEmail: string;
};
