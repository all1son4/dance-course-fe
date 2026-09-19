import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyPaymentRecord, type PaymentRecordSnapshot } from "./payment-record";

const PAYMENT_RECORD_FIELDS = [
  "payment_intent_id",
  "customer_email",
  "customer_full_name",
  "customer_nickname",
  "customer_country",
  "latest_event_id",
  "latest_event_type",
  "status",
  "outcome",
  "amount",
  "currency",
  "product_id",
  "product_title",
  "offer_id",
  "offer_label",
  "checkout_currency",
  "checkout_locale",
  "lesson_language",
  "last_payment_error_code",
  "last_payment_error_message",
  "first_seen_at",
  "updated_at",
  "checkout_session_id",
  "purchase_item",
  "delivery_channel",
  "access_workflow",
  "telegram_access_status",
  "telegram_token_id",
  "telegram_token_expires_at",
  "telegram_token_used_at",
  "telegram_user_id",
  "telegram_username",
  "telegram_channel_chat_id",
  "telegram_access_expires_at",
  "telegram_access_revoked_at",
  "email_delivery_status",
  "email_delivery_updated_at",
  "with_mentor_alert_status",
  "with_mentor_alert_updated_at",
  "customer_address",
  "customer_city",
  "customer_postal_code",
  "invoice_number",
  "invoice_issued_at",
  "telegram_inspiration_chat_id",
  "telegram_inspiration_access_expires_at",
] as const satisfies readonly (keyof PaymentRecordSnapshot)[];

test("payment defaults contain the complete independent projection", () => {
  const record = createEmptyPaymentRecord();

  assert.deepEqual(Object.keys(record), [...PAYMENT_RECORD_FIELDS]);
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

test("payment projection preserves string values without coercion", () => {
  const payment: PaymentRecordSnapshot = {
    ...createEmptyPaymentRecord(),
    ...Object.fromEntries(
      PAYMENT_RECORD_FIELDS.map((field) => [field, `value:${field}`]),
    ),
    amount: "0005000",
    customer_full_name: 'Тест, "Buyer"',
    email_delivery_status: "sending:lease-token",
    invoice_issued_at: "2026-09-01T00:00:00.000Z",
    invoice_number: "FV/2026/08/001",
    telegram_user_id: "9007199254740993",
  };
  const restored: PaymentRecordSnapshot = { ...payment };

  assert.deepEqual(restored, payment);
  assert.equal(payment.amount, "0005000");
  assert.equal(payment.telegram_user_id, "9007199254740993");
});
