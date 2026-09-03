import assert from "node:assert/strict";
import test from "node:test";

import type { PaymentSheetRecord } from "@/lib/google-sheets-schema";

import { ensureInvoiceNumberForPayment } from "./invoice-numbering";

test("always allocates invoice numbers through the PostgreSQL command", async () => {
  const marker = { invoice_number: "FV/2026/09/001" };
  let capturedPaymentIntentId = "";
  const allocateForPaymentIntent = (async ({
    paymentIntentId,
  }: {
    issuedAt: Date;
    paymentIntentId: string;
  }) => {
    capturedPaymentIntentId = paymentIntentId;
    return marker;
  }) as NonNullable<
    NonNullable<
      Parameters<typeof ensureInvoiceNumberForPayment>[1]
    >["allocateForPaymentIntent"]
  >;
  const result = await ensureInvoiceNumberForPayment(
    {
      issuedAt: new Date("2026-09-01T00:00:00.000Z"),
      paymentRecord: {
        payment_intent_id: "pi_invoice_database_only",
      } as PaymentSheetRecord,
    },
    { allocateForPaymentIntent },
  );

  assert.equal(result, marker);
  assert.equal(capturedPaymentIntentId, "pi_invoice_database_only");
});
