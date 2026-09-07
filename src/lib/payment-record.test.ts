import assert from "node:assert/strict";
import test from "node:test";

import { PAYMENT_SHEET_HEADERS, type PaymentSheetRecord } from "./google-sheets-schema";
import { createEmptyPaymentRecord, type PaymentRecordSnapshot } from "./payment-record";

test("payment defaults preserve every compatibility field without archive-driven construction", () => {
  const record = createEmptyPaymentRecord();

  // This is deliberately an archive boundary test, not a runtime dependency.
  assert.deepEqual(Object.keys(record), [...PAYMENT_SHEET_HEADERS]);
  assert.ok(Object.values(record).every((value) => value === ""));
});

test("payment defaults are fresh and cannot leak state between purchases", () => {
  const first = createEmptyPaymentRecord();
  const second = createEmptyPaymentRecord();
  first.payment_intent_id = "pi_first";
  first.email_delivery_status = "sending:lease-first";

  assert.notEqual(first, second);
  assert.equal(second.payment_intent_id, "");
  assert.equal(second.email_delivery_status, "");
});

test("payment and archive contracts remain losslessly assignable in both directions", () => {
  const archive: PaymentSheetRecord = {
    ...createEmptyPaymentRecord(),
    ...Object.fromEntries(
      PAYMENT_SHEET_HEADERS.map((field) => [field, `value:${field}`]),
    ),
    amount: "0005000",
    customer_full_name: 'Тест, "Buyer"',
    email_delivery_status: "sending:lease-token",
    invoice_issued_at: "2026-09-01T00:00:00.000Z",
    invoice_number: "FV/2026/08/001",
    successful_customer_log_status: "sent",
    telegram_user_id: "9007199254740993",
  };
  // No casts: TypeScript also checks all field names and value types at this boundary.
  const payment: PaymentRecordSnapshot = archive;
  const restored: PaymentSheetRecord = { ...payment };

  assert.deepEqual(restored, archive);
  assert.equal(payment.amount, "0005000");
  assert.equal(payment.telegram_user_id, "9007199254740993");
});
