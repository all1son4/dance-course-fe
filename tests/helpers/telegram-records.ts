import type {
  TelegramAccessTokenRecord,
  TelegramUserBindingRecord,
} from "@/lib/telegram/access-records";

// Test-only builders: production mappers construct complete records explicitly.
export const createTelegramTokenFixture = (
  overrides: Partial<TelegramAccessTokenRecord> = {},
): TelegramAccessTokenRecord => ({
  token_id: "",
  token_hash: "",
  token_value: "",
  payment_intent_id: "",
  product_id: "",
  offer_id: "",
  customer_email: "",
  link_kind: "",
  chat_id: "",
  access_expires_at: "",
  status: "",
  created_at: "",
  expires_at: "",
  used_at: "",
  telegram_user_id: "",
  telegram_username: "",
  last_error: "",
  ...overrides,
});

export const createTelegramBindingFixture = (
  overrides: Partial<TelegramUserBindingRecord> = {},
): TelegramUserBindingRecord => ({
  telegram_user_id: "",
  telegram_username: "",
  payment_intent_id: "",
  customer_email: "",
  product_id: "",
  offer_id: "",
  chat_id: "",
  invite_link: "",
  bound_at: "",
  last_seen_at: "",
  access_expires_at: "",
  revoked_at: "",
  revoked_reason: "",
  status: "",
  ...overrides,
});
