import { allocateInvoiceForPaymentIntent } from "@/db/invoice-repository";
import type { PaymentRecordSnapshot } from "@/lib/payment-record";

const pendingInvoiceNumberAssignments = new Map<string, Promise<PaymentRecordSnapshot>>();

const ensureInvoiceNumberForPaymentInternal = async ({
  allocateForPaymentIntent,
  issuedAt,
  paymentRecord,
}: {
  allocateForPaymentIntent: typeof allocateInvoiceForPaymentIntent;
  issuedAt: Date;
  paymentRecord: PaymentRecordSnapshot;
}) => {
  return allocateForPaymentIntent({
    issuedAt,
    paymentIntentId: paymentRecord.payment_intent_id,
  });
};

export const ensureInvoiceNumberForPayment = async (
  {
    issuedAt,
    paymentRecord,
  }: {
    issuedAt: Date;
    paymentRecord: PaymentRecordSnapshot;
  },
  dependencies: {
    allocateForPaymentIntent?: typeof allocateInvoiceForPaymentIntent;
  } = {},
) => {
  const paymentIntentId = paymentRecord.payment_intent_id.trim();
  const pendingAssignment = pendingInvoiceNumberAssignments.get(paymentIntentId);

  if (pendingAssignment) {
    return pendingAssignment;
  }

  const assignmentPromise = ensureInvoiceNumberForPaymentInternal({
    allocateForPaymentIntent:
      dependencies.allocateForPaymentIntent ?? allocateInvoiceForPaymentIntent,
    issuedAt,
    paymentRecord,
  }).finally(() => {
    pendingInvoiceNumberAssignments.delete(paymentIntentId);
  });

  pendingInvoiceNumberAssignments.set(paymentIntentId, assignmentPromise);

  return assignmentPromise;
};
