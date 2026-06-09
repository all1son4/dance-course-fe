export const DEFAULT_PAYMENTS_SHEET_NAME = "Payments";
export const DEFAULT_STRIPE_EVENTS_SHEET_NAME = "StripeEvents";
export const DEFAULT_SUCCESSFUL_CUSTOMERS_SHEET_NAME = "SuccessfulCustomers";
export const DEFAULT_MONTHLY_SALES_REPORT_RUNS_SHEET_NAME = "MonthlySalesReports";
export const DEFAULT_TELEGRAM_ACCESS_TOKENS_SHEET_NAME = "TelegramAccessTokens";
export const DEFAULT_TELEGRAM_USER_BINDINGS_SHEET_NAME = "TelegramUserBindings";
export const DEFAULT_EMAIL_CAMPAIGN_LEADS_SHEET_NAME = "EmailCampaignLeads";

// Header arrays are the storage schema. Existing row values are read by position,
// so append new columns at the end unless a deliberate sheet migration is planned.
export const PAYMENT_SHEET_HEADERS = [
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
  "successful_customer_logged_at",
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
  "successful_customer_log_status",
] as const;

export const PAYMENT_SHEET_HEADER_LABELS: Record<
  (typeof PAYMENT_SHEET_HEADERS)[number],
  string
> = {
  payment_intent_id: "ID платежа (PaymentIntent)",
  customer_email: "Email клиента",
  customer_full_name: "ФИО",
  customer_nickname: "Telegram username",
  customer_country: "Страна",
  latest_event_id: "Последний Stripe Event ID",
  latest_event_type: "Тип последнего Stripe события",
  status: "Технический статус",
  outcome: "Результат оплаты",
  amount: "Сумма (minor units)",
  currency: "Валюта",
  product_id: "ID продукта",
  product_title: "Название продукта",
  offer_id: "ID тарифа",
  offer_label: "Название тарифа",
  checkout_currency: "Валюта checkout",
  checkout_locale: "Язык checkout",
  lesson_language: "Язык материалов",
  last_payment_error_code: "Код последней ошибки",
  last_payment_error_message: "Текст последней ошибки",
  first_seen_at: "Создано в таблице",
  successful_customer_logged_at: "Когда записан в SuccessfulCustomers",
  updated_at: "Последнее обновление",
  checkout_session_id: "Checkout session ID",
  purchase_item: "Что купили",
  delivery_channel: "Канал доставки",
  access_workflow: "Сценарий доступа",
  telegram_access_status: "Статус Telegram-доступа",
  telegram_token_id: "ID Telegram-токена",
  telegram_token_expires_at: "Срок действия токена",
  telegram_token_used_at: "Когда токен использован",
  telegram_user_id: "Telegram user ID",
  telegram_username: "Telegram username (активировавший)",
  telegram_channel_chat_id: "ID Telegram-канала",
  telegram_access_expires_at: "Доступ в Telegram до",
  telegram_access_revoked_at: "Когда Telegram-доступ отозван",
  email_delivery_status: "Статус отправки email",
  email_delivery_updated_at: "Когда обновлен статус email",
  with_mentor_alert_status: "Статус admin Telegram-алерта",
  with_mentor_alert_updated_at: "Когда обновлен admin Telegram-алерт",
  customer_address: "Адрес клиента",
  customer_city: "Город клиента",
  customer_postal_code: "Почтовый код клиента",
  invoice_number: "Номер инвойса",
  invoice_issued_at: "Когда выдан инвойс",
  successful_customer_log_status: "Статус записи в SuccessfulCustomers",
};

export const STRIPE_EVENT_SHEET_HEADERS = [
  "event_id",
  "event_type",
  "payment_intent_id",
  "status",
  "outcome",
  "processed_at",
] as const;

export const STRIPE_EVENT_SHEET_HEADER_LABELS: Record<
  (typeof STRIPE_EVENT_SHEET_HEADERS)[number],
  string
> = {
  event_id: "Stripe Event ID",
  event_type: "Тип события",
  payment_intent_id: "ID платежа (PaymentIntent)",
  status: "Технический статус",
  outcome: "Результат",
  processed_at: "Когда обработано",
};

export const SUCCESSFUL_CUSTOMERS_SHEET_HEADERS = [
  "payment_intent_id",
  "customer_email",
  "customer_full_name",
  "customer_nickname",
  "customer_full_address",
  "customer_country",
  "purchase_item",
  "product_id",
  "product_title",
  "offer_id",
  "offer_label",
] as const;

export const SUCCESSFUL_CUSTOMERS_SHEET_HEADER_LABELS: Record<
  (typeof SUCCESSFUL_CUSTOMERS_SHEET_HEADERS)[number],
  string
> = {
  payment_intent_id: "ID платежа (PaymentIntent)",
  customer_email: "Email клиента",
  customer_full_name: "ФИО",
  customer_nickname: "Telegram username",
  customer_full_address: "Полный адрес клиента",
  customer_country: "Страна",
  purchase_item: "Что купили",
  product_id: "ID продукта",
  product_title: "Название продукта",
  offer_id: "ID тарифа",
  offer_label: "Название тарифа",
};

export const TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS = [
  "token_id",
  "token_hash",
  "token_value",
  "payment_intent_id",
  "product_id",
  "offer_id",
  "customer_email",
  "link_kind",
  "chat_id",
  "access_expires_at",
  "status",
  "created_at",
  "expires_at",
  "used_at",
  "telegram_user_id",
  "telegram_username",
  "last_error",
] as const;

export const TELEGRAM_ACCESS_TOKENS_SHEET_HEADER_LABELS: Record<
  (typeof TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS)[number],
  string
> = {
  token_id: "ID токена",
  token_hash: "Хэш токена",
  token_value: "Значение токена (start)",
  payment_intent_id: "ID платежа (PaymentIntent)",
  product_id: "ID продукта",
  offer_id: "ID тарифа",
  customer_email: "Email клиента",
  link_kind: "Тип ссылки",
  chat_id: "ID Telegram-чата",
  access_expires_at: "Доступ до",
  status: "Статус токена",
  created_at: "Создан",
  expires_at: "Действует до",
  used_at: "Использован",
  telegram_user_id: "Telegram user ID",
  telegram_username: "Telegram username",
  last_error: "Последняя ошибка",
};

export const TELEGRAM_USER_BINDINGS_SHEET_HEADERS = [
  "telegram_user_id",
  "telegram_username",
  "payment_intent_id",
  "customer_email",
  "product_id",
  "offer_id",
  "chat_id",
  "invite_link",
  "bound_at",
  "last_seen_at",
  "access_expires_at",
  "revoked_at",
  "revoked_reason",
  "status",
] as const;

export const MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS = [
  "report_key",
  "report_family",
  "period_start_utc",
  "period_end_utc",
  "generated_at_utc",
  "delivery_status",
  "delivered_at_utc",
  "delivered_to",
  "row_count",
  "csv_sha256",
] as const;

export const TELEGRAM_USER_BINDINGS_SHEET_HEADER_LABELS: Record<
  (typeof TELEGRAM_USER_BINDINGS_SHEET_HEADERS)[number],
  string
> = {
  telegram_user_id: "Telegram user ID",
  telegram_username: "Telegram username",
  payment_intent_id: "ID платежа (PaymentIntent)",
  customer_email: "Email клиента",
  product_id: "ID продукта",
  offer_id: "ID тарифа",
  chat_id: "ID Telegram-чата",
  invite_link: "Использованная invite-ссылка",
  bound_at: "Когда привязано",
  last_seen_at: "Последняя активность",
  access_expires_at: "Доступ до",
  revoked_at: "Когда доступ отозван",
  revoked_reason: "Причина отзыва",
  status: "Статус привязки",
};

export const MONTHLY_SALES_REPORT_RUNS_SHEET_HEADER_LABELS: Record<
  (typeof MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS)[number],
  string
> = {
  report_key: "Ключ отчета",
  report_family: "Тип отчета",
  period_start_utc: "Начало периода (UTC)",
  period_end_utc: "Конец периода (UTC)",
  generated_at_utc: "Когда сгенерировано (UTC)",
  delivery_status: "Статус отправки",
  delivered_at_utc: "Когда отправлено (UTC)",
  delivered_to: "Кому отправлено",
  row_count: "Количество строк",
  csv_sha256: "SHA256 CSV",
};

export const EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS = [
  "lead_id",
  "campaign_key",
  "email_send_status",
  "full_name",
  "social_contact",
  "email",
  "locale",
  "created_at",
  "email_sent_at",
  "email_send_attempts",
  "last_email_error",
] as const;

export const EMAIL_CAMPAIGN_LEADS_SHEET_HEADER_LABELS: Record<
  (typeof EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS)[number],
  string
> = {
  lead_id: "ID заявки",
  campaign_key: "Тип рассылки",
  email_send_status: "Статус отправки письма",
  full_name: "Полное имя",
  social_contact: "Telegram / Instagram",
  email: "Email",
  locale: "Язык страницы",
  created_at: "Когда заявка создана",
  email_sent_at: "Когда письмо отправлено",
  email_send_attempts: "Количество попыток отправки",
  last_email_error: "Последняя ошибка отправки",
};

type PaymentSheetHeader = (typeof PAYMENT_SHEET_HEADERS)[number];
type StripeEventSheetHeader = (typeof STRIPE_EVENT_SHEET_HEADERS)[number];
type SuccessfulCustomersSheetHeader = (typeof SUCCESSFUL_CUSTOMERS_SHEET_HEADERS)[number];
type TelegramAccessTokensSheetHeader =
  (typeof TELEGRAM_ACCESS_TOKENS_SHEET_HEADERS)[number];
type TelegramUserBindingsSheetHeader =
  (typeof TELEGRAM_USER_BINDINGS_SHEET_HEADERS)[number];
type MonthlySalesReportRunsSheetHeader =
  (typeof MONTHLY_SALES_REPORT_RUNS_SHEET_HEADERS)[number];
type EmailCampaignLeadSheetHeader = (typeof EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS)[number];

export type PaymentSheetRecord = Record<PaymentSheetHeader, string>;
export type StripeEventSheetRecord = Record<StripeEventSheetHeader, string>;
export type SuccessfulCustomersSheetRecord = Record<
  SuccessfulCustomersSheetHeader,
  string
>;
export type TelegramAccessTokenSheetRecord = Record<
  TelegramAccessTokensSheetHeader,
  string
>;
export type TelegramUserBindingSheetRecord = Record<
  TelegramUserBindingsSheetHeader,
  string
>;
export type MonthlySalesReportRunSheetRecord = Record<
  MonthlySalesReportRunsSheetHeader,
  string
>;
export type EmailCampaignLeadSheetRecord = Record<EmailCampaignLeadSheetHeader, string>;

export type AdminInviteLinkHistorySourceRecord = {
  accessUrl: string;
  adminLabel: string;
  createdAt: string;
  lessonLanguage: string;
  offerLabel: string;
  productTitle: string;
  purchaseItem: string;
  tokenExpiresAt: string;
  tokenUsedAt: string;
};
