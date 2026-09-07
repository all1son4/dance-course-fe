/**
 * Internal flat PostgreSQL projections used by Telegram access readers and commands.
 * Strings and empty values preserve the existing access contract; these types do not
 * depend on positional archive headers. Bearer values and invite links are sensitive:
 * these records must not be logged or exposed as a public response wholesale.
 */
export type TelegramAccessTokenRecord = {
  token_id: string;
  token_hash: string;
  token_value: string;
  payment_intent_id: string;
  product_id: string;
  offer_id: string;
  customer_email: string;
  link_kind: string;
  chat_id: string;
  access_expires_at: string;
  status: string;
  created_at: string;
  expires_at: string;
  used_at: string;
  telegram_user_id: string;
  telegram_username: string;
  last_error: string;
};

export type TelegramUserBindingRecord = {
  telegram_user_id: string;
  telegram_username: string;
  payment_intent_id: string;
  customer_email: string;
  product_id: string;
  offer_id: string;
  chat_id: string;
  invite_link: string;
  bound_at: string;
  last_seen_at: string;
  access_expires_at: string;
  revoked_at: string;
  revoked_reason: string;
  status: string;
};
