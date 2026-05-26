import { type syncStripePaymentEventToGoogleSheets } from "../sync";

export type StripeWebhookSyncResult = Awaited<
  ReturnType<typeof syncStripePaymentEventToGoogleSheets>
>;

export type StripeReceiptData = {
  receiptKind: "pdf" | "receipt" | null;
  receiptLink: string | null;
  recipientEmail: string;
};
