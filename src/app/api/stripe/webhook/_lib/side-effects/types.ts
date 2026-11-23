export type StripeReceiptData = {
  receiptKind: "pdf" | "receipt" | null;
  receiptLink: string | null;
  recipientEmail: string;
};
