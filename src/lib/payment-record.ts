/**
 * Flat payment projection shared by PostgreSQL readers, Stripe, invoices and access.
 * All values intentionally remain strings; an absent value is the empty string.
 * This contract is independent of positional archive headers and the DB table schema.
 * Historical export and lease fields stay until a separately approved contract step.
 */
export type PaymentRecordSnapshot = {
  payment_intent_id: string;
  customer_email: string;
  customer_full_name: string;
  customer_nickname: string;
  customer_country: string;
  latest_event_id: string;
  latest_event_type: string;
  status: string;
  outcome: string;
  amount: string;
  currency: string;
  product_id: string;
  product_title: string;
  offer_id: string;
  offer_label: string;
  checkout_currency: string;
  checkout_locale: string;
  lesson_language: string;
  last_payment_error_code: string;
  last_payment_error_message: string;
  first_seen_at: string;
  successful_customer_logged_at: string;
  updated_at: string;
  checkout_session_id: string;
  purchase_item: string;
  delivery_channel: string;
  access_workflow: string;
  telegram_access_status: string;
  telegram_token_id: string;
  telegram_token_expires_at: string;
  telegram_token_used_at: string;
  telegram_user_id: string;
  telegram_username: string;
  telegram_channel_chat_id: string;
  telegram_access_expires_at: string;
  telegram_access_revoked_at: string;
  email_delivery_status: string;
  email_delivery_updated_at: string;
  with_mentor_alert_status: string;
  with_mentor_alert_updated_at: string;
  customer_address: string;
  customer_city: string;
  customer_postal_code: string;
  invoice_number: string;
  invoice_issued_at: string;
  successful_customer_log_status: string;
  telegram_inspiration_chat_id: string;
  telegram_inspiration_access_expires_at: string;
};

/** Return a fresh projection so callers cannot share mutable default state. */
export const createEmptyPaymentRecord = (): PaymentRecordSnapshot => ({
  payment_intent_id: "",
  customer_email: "",
  customer_full_name: "",
  customer_nickname: "",
  customer_country: "",
  latest_event_id: "",
  latest_event_type: "",
  status: "",
  outcome: "",
  amount: "",
  currency: "",
  product_id: "",
  product_title: "",
  offer_id: "",
  offer_label: "",
  checkout_currency: "",
  checkout_locale: "",
  lesson_language: "",
  last_payment_error_code: "",
  last_payment_error_message: "",
  first_seen_at: "",
  successful_customer_logged_at: "",
  updated_at: "",
  checkout_session_id: "",
  purchase_item: "",
  delivery_channel: "",
  access_workflow: "",
  telegram_access_status: "",
  telegram_token_id: "",
  telegram_token_expires_at: "",
  telegram_token_used_at: "",
  telegram_user_id: "",
  telegram_username: "",
  telegram_channel_chat_id: "",
  telegram_access_expires_at: "",
  telegram_access_revoked_at: "",
  email_delivery_status: "",
  email_delivery_updated_at: "",
  with_mentor_alert_status: "",
  with_mentor_alert_updated_at: "",
  customer_address: "",
  customer_city: "",
  customer_postal_code: "",
  invoice_number: "",
  invoice_issued_at: "",
  successful_customer_log_status: "",
  telegram_inspiration_chat_id: "",
  telegram_inspiration_access_expires_at: "",
});
