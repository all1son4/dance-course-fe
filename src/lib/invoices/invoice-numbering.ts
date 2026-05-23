import {
  findPaymentRecordByIntentId,
  listPaymentRecords,
  type PaymentSheetRecord,
  upsertPaymentRecord,
} from "@/lib/google-sheets";
import { toUtcIso } from "@/lib/time";

const INVOICE_NUMBER_PREFIX = "FV";
const INVOICE_SEQUENCE_PADDING = 3;

const pendingInvoiceNumberAssignments = new Map<string, Promise<PaymentSheetRecord>>();
let invoiceNumberAssignmentQueue = Promise.resolve();

const pad2 = (value: number) => String(value).padStart(2, "0");

const getInvoiceMonthParts = (issuedAt: Date) => {
  const normalizedDate = Number.isNaN(issuedAt.getTime()) ? new Date() : issuedAt;

  return {
    month: pad2(normalizedDate.getUTCMonth() + 1),
    year: String(normalizedDate.getUTCFullYear()),
  };
};

const getInvoiceMonthPrefix = (issuedAt: Date) => {
  const { month, year } = getInvoiceMonthParts(issuedAt);

  return `${INVOICE_NUMBER_PREFIX}/${year}/${month}/`;
};

const parseInvoiceSequence = (invoiceNumber: string, invoiceMonthPrefix: string) => {
  const normalizedInvoiceNumber = invoiceNumber.trim();

  if (!normalizedInvoiceNumber.startsWith(invoiceMonthPrefix)) {
    return null;
  }

  const sequence = Number.parseInt(
    normalizedInvoiceNumber.slice(invoiceMonthPrefix.length),
    10,
  );

  return Number.isFinite(sequence) && sequence > 0 ? sequence : null;
};

const buildInvoiceNumber = (issuedAt: Date, sequence: number) =>
  `${getInvoiceMonthPrefix(issuedAt)}${String(sequence).padStart(
    INVOICE_SEQUENCE_PADDING,
    "0",
  )}`;

const findNextInvoiceSequence = async (issuedAt: Date) => {
  const invoiceMonthPrefix = getInvoiceMonthPrefix(issuedAt);
  const paymentRecords = await listPaymentRecords({
    cacheTtlMs: 0,
  });
  const maxSequence = paymentRecords.reduce((currentMaxSequence, paymentRecord) => {
    const sequence = parseInvoiceSequence(
      paymentRecord.invoice_number,
      invoiceMonthPrefix,
    );

    return sequence === null
      ? currentMaxSequence
      : Math.max(currentMaxSequence, sequence);
  }, 0);

  return maxSequence + 1;
};

const withInvoiceNumberAssignmentLock = async <T>(task: () => Promise<T>) => {
  const previousQueue = invoiceNumberAssignmentQueue;
  let releaseLock!: () => void;
  const lockReleasePromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  invoiceNumberAssignmentQueue = previousQueue.then(() => lockReleasePromise);
  const queueEntry = invoiceNumberAssignmentQueue;

  await previousQueue;

  try {
    return await task();
  } finally {
    releaseLock();

    if (invoiceNumberAssignmentQueue === queueEntry) {
      invoiceNumberAssignmentQueue = Promise.resolve();
    }
  }
};

const ensureInvoiceNumberForPaymentInternal = async ({
  issuedAt,
  paymentRecord,
}: {
  issuedAt: Date;
  paymentRecord: PaymentSheetRecord;
}) => {
  const latestPaymentRecord =
    (await findPaymentRecordByIntentId(paymentRecord.payment_intent_id, {
      cacheTtlMs: 0,
    })) ?? paymentRecord;
  const existingInvoiceNumber = latestPaymentRecord.invoice_number.trim();

  if (existingInvoiceNumber) {
    return latestPaymentRecord;
  }

  const invoiceNumber = buildInvoiceNumber(
    issuedAt,
    await findNextInvoiceSequence(issuedAt),
  );
  const invoiceIssuedAt =
    latestPaymentRecord.invoice_issued_at.trim() || toUtcIso(issuedAt);

  return upsertPaymentRecord({
    ...latestPaymentRecord,
    invoice_issued_at: invoiceIssuedAt,
    invoice_number: invoiceNumber,
    updated_at: invoiceIssuedAt,
  });
};

export const ensureInvoiceNumberForPayment = async ({
  issuedAt,
  paymentRecord,
}: {
  issuedAt: Date;
  paymentRecord: PaymentSheetRecord;
}) => {
  const paymentIntentId = paymentRecord.payment_intent_id.trim();
  const pendingAssignment = pendingInvoiceNumberAssignments.get(paymentIntentId);

  if (pendingAssignment) {
    return pendingAssignment;
  }

  const assignmentPromise = withInvoiceNumberAssignmentLock(() =>
    ensureInvoiceNumberForPaymentInternal({
      issuedAt,
      paymentRecord,
    }),
  ).finally(() => {
    pendingInvoiceNumberAssignments.delete(paymentIntentId);
  });

  pendingInvoiceNumberAssignments.set(paymentIntentId, assignmentPromise);

  return assignmentPromise;
};
