import { and, eq, max, sql } from "drizzle-orm";

import { getDatabase } from "./client";
import { findPaymentRecordByIntentIdFromDatabase } from "./payment-records";
import { invoices, invoiceSequences, purchases } from "./schema";

const INVOICE_SEQUENCE_PADDING = 3;

export type AllocateInvoiceInput = {
  amountMinor: number;
  buyerAddressSnapshot?: string | null;
  buyerEmailSnapshot?: string | null;
  buyerNameSnapshot?: string | null;
  currency: "pln" | "eur";
  issuedAt: Date;
  purchaseId: string;
};

const normalizeOptional = (value: string | null | undefined) => value?.trim() || null;

const assertInvoiceInput = (input: AllocateInvoiceInput) => {
  if (!input.purchaseId.trim()) {
    throw new Error("invoice_purchase_id_required");
  }

  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 0) {
    throw new Error("invoice_amount_minor_invalid");
  }

  if (Number.isNaN(input.issuedAt.getTime())) {
    throw new Error("invoice_issued_at_invalid");
  }
};

const buildInvoiceNumber = ({
  sequenceMonth,
  sequenceNumber,
  sequenceYear,
}: {
  sequenceMonth: number;
  sequenceNumber: number;
  sequenceYear: number;
}) =>
  `FV/${sequenceYear}/${String(sequenceMonth).padStart(2, "0")}/${String(
    sequenceNumber,
  ).padStart(INVOICE_SEQUENCE_PADDING, "0")}`;

export const allocateInvoice = async (input: AllocateInvoiceInput) => {
  assertInvoiceInput(input);

  const purchaseId = input.purchaseId.trim();
  const sequenceYear = input.issuedAt.getUTCFullYear();
  const sequenceMonth = input.issuedAt.getUTCMonth() + 1;

  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(
        hashtextextended(${`invoice-purchase:${purchaseId}`}, 0)
      )`,
    );

    const [existing] = await transaction
      .select()
      .from(invoices)
      .where(eq(invoices.purchaseId, purchaseId))
      .limit(1);

    if (existing) {
      return { created: false, invoice: existing };
    }

    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(
        hashtextextended(${`invoice-sequence:${sequenceYear}:${sequenceMonth}`}, 0)
      )`,
    );

    const [counter] = await transaction
      .select({ lastSequence: invoiceSequences.lastSequence })
      .from(invoiceSequences)
      .where(
        and(
          eq(invoiceSequences.sequenceYear, sequenceYear),
          eq(invoiceSequences.sequenceMonth, sequenceMonth),
        ),
      )
      .limit(1);
    const [latestInvoice] = await transaction
      .select({ lastSequence: max(invoices.sequenceNumber) })
      .from(invoices)
      .where(
        and(
          eq(invoices.sequenceYear, sequenceYear),
          eq(invoices.sequenceMonth, sequenceMonth),
        ),
      );
    const nextSequence =
      Math.max(counter?.lastSequence ?? 0, Number(latestInvoice?.lastSequence ?? 0)) + 1;
    const now = new Date();

    await transaction
      .insert(invoiceSequences)
      .values({
        lastSequence: nextSequence,
        sequenceMonth,
        sequenceYear,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        set: {
          lastSequence: nextSequence,
          updatedAt: now,
        },
        target: [invoiceSequences.sequenceYear, invoiceSequences.sequenceMonth],
      });

    const [invoice] = await transaction
      .insert(invoices)
      .values({
        amountMinor: input.amountMinor,
        buyerAddressSnapshot: normalizeOptional(input.buyerAddressSnapshot),
        buyerEmailSnapshot: normalizeOptional(input.buyerEmailSnapshot),
        buyerNameSnapshot: normalizeOptional(input.buyerNameSnapshot),
        currency: input.currency,
        invoiceNumber: buildInvoiceNumber({
          sequenceMonth,
          sequenceNumber: nextSequence,
          sequenceYear,
        }),
        issuedAt: input.issuedAt,
        purchaseId,
        sequenceMonth,
        sequenceNumber: nextSequence,
        sequenceYear,
      })
      .returning();

    return { created: true, invoice };
  });
};

export const allocateInvoiceForPaymentIntent = async ({
  issuedAt,
  paymentIntentId,
}: {
  issuedAt: Date;
  paymentIntentId: string;
}) => {
  const normalizedPaymentIntentId = paymentIntentId.trim();

  if (!normalizedPaymentIntentId) {
    throw new Error("invoice_payment_intent_id_required");
  }

  const [purchase] = await getDatabase()
    .select({
      amountMinor: purchases.amountMinor,
      currency: purchases.currency,
      customerAddressLineSnapshot: purchases.customerAddressLineSnapshot,
      customerCitySnapshot: purchases.customerCitySnapshot,
      customerEmailSnapshot: purchases.customerEmailSnapshot,
      customerFullNameSnapshot: purchases.customerFullNameSnapshot,
      customerPostalCodeSnapshot: purchases.customerPostalCodeSnapshot,
      id: purchases.id,
    })
    .from(purchases)
    .where(eq(purchases.paymentIntentId, normalizedPaymentIntentId))
    .limit(1);

  if (!purchase) {
    throw new Error("invoice_purchase_not_found");
  }

  if (purchase.currency !== "pln" && purchase.currency !== "eur") {
    throw new Error("invoice_purchase_currency_invalid");
  }

  await allocateInvoice({
    amountMinor: purchase.amountMinor,
    buyerAddressSnapshot:
      [
        purchase.customerAddressLineSnapshot,
        purchase.customerCitySnapshot,
        purchase.customerPostalCodeSnapshot,
      ]
        .map((part) => part?.trim() ?? "")
        .filter(Boolean)
        .join(", ") || null,
    buyerEmailSnapshot: purchase.customerEmailSnapshot,
    buyerNameSnapshot: purchase.customerFullNameSnapshot,
    currency: purchase.currency,
    issuedAt,
    purchaseId: purchase.id,
  });

  const paymentRecord = await findPaymentRecordByIntentIdFromDatabase(
    normalizedPaymentIntentId,
  );

  if (!paymentRecord?.invoice_number.trim()) {
    throw new Error("invoice_projection_not_found");
  }

  return paymentRecord;
};
