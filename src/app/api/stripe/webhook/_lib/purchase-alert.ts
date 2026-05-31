import { normalizeCountryCode } from "@/constants/countries";
import type { PaymentSheetRecord } from "@/lib/google-sheets";
import { isOfferEligibleForTelegramAccessLink } from "@/lib/telegram/access";
import { UTC_TIME_ZONE_LABEL } from "@/lib/time";

import {
  getResolvedCheckoutLessonLanguage,
  getResolvedCheckoutLocale,
} from "../../payment-intent/lib";

const PAYMENT_PROCESSING_STATUS_PREFIX = "sending:";
const CHECKOUT_LOCALE_TO_INTL_LOCALE = {
  en: "en-US",
  pl: "pl-PL",
  ru: "ru-RU",
} as const;
const CHECKOUT_LANGUAGE_LABEL_BY_LOCALE = {
  en: "English",
  pl: "Polski",
  ru: "Русский",
} as const;
const LESSON_LANGUAGE_LABEL_BY_LANGUAGE = {
  en: "English",
  ru: "Русский",
} as const;

const escapeTelegramHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const escapeTelegramHtmlAttribute = (value: string) =>
  escapeTelegramHtml(value).replaceAll('"', "&quot;");

const getFormattedAmountLabel = ({
  amountMinor,
  checkoutCurrency,
  checkoutLocale,
}: {
  amountMinor: string;
  checkoutCurrency: string;
  checkoutLocale: "en" | "pl" | "ru";
}) => {
  const parsedAmountMinor = Number.parseInt(amountMinor, 10);
  const normalizedCurrency = checkoutCurrency.trim().toUpperCase();

  if (!Number.isFinite(parsedAmountMinor) || !normalizedCurrency) {
    return [amountMinor.trim(), normalizedCurrency].filter(Boolean).join(" ").trim();
  }

  const amount = parsedAmountMinor / 100;
  const locale = CHECKOUT_LOCALE_TO_INTL_LOCALE[checkoutLocale];

  try {
    return new Intl.NumberFormat(locale, {
      currency: normalizedCurrency,
      style: "currency",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${normalizedCurrency}`;
  }
};

const getPurchaseItemLabel = (paymentRecord: PaymentSheetRecord) => {
  const purchaseItem = paymentRecord.purchase_item.trim();

  if (purchaseItem) {
    return purchaseItem;
  }

  const productTitle = paymentRecord.product_title.trim();
  const offerLabel = paymentRecord.offer_label.trim();

  if (productTitle && offerLabel) {
    return `${productTitle} — ${offerLabel}`;
  }

  return productTitle || offerLabel;
};

const getCheckoutLanguageLabel = (checkoutLocale: "en" | "pl" | "ru") =>
  CHECKOUT_LANGUAGE_LABEL_BY_LOCALE[checkoutLocale];

const getLessonLanguageLabel = ({
  checkoutLocale,
  lessonLanguage,
}: {
  checkoutLocale: "en" | "pl" | "ru";
  lessonLanguage: string;
}) => {
  const fallbackLessonLanguage = checkoutLocale === "en" ? "en" : "ru";
  const resolvedLessonLanguage = getResolvedCheckoutLessonLanguage(
    lessonLanguage || fallbackLessonLanguage,
  );

  return LESSON_LANGUAGE_LABEL_BY_LANGUAGE[resolvedLessonLanguage];
};

const getFormattedCountryLabel = ({
  checkoutLocale,
  customerCountry,
}: {
  checkoutLocale: "en" | "pl" | "ru";
  customerCountry: string;
}) => {
  const normalizedCountryCode = normalizeCountryCode(customerCountry);

  if (!normalizedCountryCode) {
    return customerCountry.trim() || "—";
  }

  if (typeof Intl.DisplayNames !== "function") {
    return normalizedCountryCode;
  }

  try {
    const locale = CHECKOUT_LOCALE_TO_INTL_LOCALE[checkoutLocale];
    const displayName = new Intl.DisplayNames([locale], { type: "region" }).of(
      normalizedCountryCode,
    );

    return displayName || normalizedCountryCode;
  } catch {
    return normalizedCountryCode;
  }
};

const getAccessWorkflowLabel = (workflow: string) => {
  if (workflow === "with-mentor") {
    return "С куратором";
  }

  if (workflow === "telegram-channel") {
    return "Telegram-канал";
  }

  if (workflow === "telegram-chat") {
    return "Telegram-чат";
  }

  if (workflow === "telegram-bot") {
    return "Telegram-бот";
  }

  if (workflow === "online-group") {
    return "Онлайн-группа";
  }

  if (workflow === "online-live") {
    return "Онлайн-занятия";
  }

  if (workflow === "manual-admin") {
    return "Ручное добавление админом";
  }

  return workflow || "—";
};

const buildServiceStatusLine = ({
  detail,
  icon,
  label,
}: {
  detail?: string;
  icon: "✅" | "⚠️" | "❌";
  label: string;
}) =>
  `${icon} ${escapeTelegramHtml(label)}${
    detail ? `: ${escapeTelegramHtml(detail)}` : ""
  }`;

const normalizeAlertFieldValue = (value: string) =>
  value.trim().replace(/\s+/gu, " ") || "—";

const padAlertLabel = (label: string, width: number) =>
  `${label}:${"\u00a0".repeat(Math.max(width - label.length, 0))}`;

const buildAlertFieldLine = ({
  label,
  labelWidth,
  value,
  valueHtml,
}: {
  label: string;
  labelWidth: number;
  value: string;
  valueHtml?: string;
}) =>
  `<b>${escapeTelegramHtml(padAlertLabel(label, labelWidth))}</b> ${
    valueHtml ?? escapeTelegramHtml(normalizeAlertFieldValue(value))
  }`;

const buildAlertFieldLines = (
  rows: Array<{ label: string; value: string; valueHtml?: string }>,
) => {
  const labelWidth = Math.max(...rows.map((row) => row.label.length)) + 1;

  return rows.map((row) => buildAlertFieldLine({ ...row, labelWidth }));
};

const buildEmailValueHtml = (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return escapeTelegramHtml("—");
  }

  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(normalizedEmail)) {
    return escapeTelegramHtml(normalizedEmail);
  }

  return escapeTelegramHtml(normalizedEmail);
};

const buildTelegramUsernameValueHtml = (nickname: string) => {
  const normalizedNickname = nickname.trim()
    ? nickname.trim().startsWith("@")
      ? nickname.trim()
      : `@${nickname.trim()}`
    : "";
  const username = normalizedNickname.replace(/^@/u, "");

  if (!normalizedNickname) {
    return escapeTelegramHtml("—");
  }

  if (!/^[A-Za-z0-9_]{5,32}$/u.test(username)) {
    return escapeTelegramHtml(normalizedNickname);
  }

  return `<a href="https://t.me/${escapeTelegramHtmlAttribute(username)}">${escapeTelegramHtml(
    normalizedNickname,
  )}</a>`;
};

const getEmailServiceStatusLine = (paymentRecord: PaymentSheetRecord) => {
  const status = paymentRecord.email_delivery_status.trim();

  if (status === "sent") {
    return buildServiceStatusLine({
      icon: "✅",
      label: "Email",
    });
  }

  if (status === "skipped") {
    return buildServiceStatusLine({
      detail: "отправка пропущена",
      icon: "⚠️",
      label: "Email",
    });
  }

  if (status === "failed") {
    return buildServiceStatusLine({
      detail: "отправка не удалась",
      icon: "❌",
      label: "Email",
    });
  }

  if (status.startsWith(PAYMENT_PROCESSING_STATUS_PREFIX)) {
    return buildServiceStatusLine({
      detail: "отправка еще выполняется",
      icon: "⚠️",
      label: "Email",
    });
  }

  return buildServiceStatusLine({
    detail: "статус еще не записан",
    icon: "⚠️",
    label: "Email",
  });
};

const getInvoiceServiceStatusLine = (paymentRecord: PaymentSheetRecord) => {
  const hasInvoice =
    Boolean(paymentRecord.invoice_number.trim()) &&
    Boolean(paymentRecord.invoice_issued_at.trim());
  const emailStatus = paymentRecord.email_delivery_status.trim();

  if (hasInvoice) {
    return buildServiceStatusLine({
      icon: "✅",
      label: "Инвойс",
    });
  }

  if (emailStatus === "failed") {
    return buildServiceStatusLine({
      detail: "не создан или не прикреплен из-за ошибки email",
      icon: "❌",
      label: "Инвойс",
    });
  }

  if (emailStatus === "sent") {
    return buildServiceStatusLine({
      detail: "номер не записан после отправки email",
      icon: "❌",
      label: "Инвойс",
    });
  }

  if (emailStatus === "skipped") {
    return buildServiceStatusLine({
      detail: "email пропущен, инвойс не отправлялся",
      icon: "⚠️",
      label: "Инвойс",
    });
  }

  return buildServiceStatusLine({
    detail: "ожидает завершения email-цепочки",
    icon: "⚠️",
    label: "Инвойс",
  });
};

const getTelegramAccessServiceStatusLine = (paymentRecord: PaymentSheetRecord) => {
  const status = paymentRecord.telegram_access_status.trim();
  const accessLinkRequired = isOfferEligibleForTelegramAccessLink(paymentRecord.offer_id);

  if (!accessLinkRequired) {
    return buildServiceStatusLine({
      icon: "✅",
      label: "Telegram-доступ не требуется",
    });
  }

  if (status === "token_issued" || status === "activated") {
    return buildServiceStatusLine({
      icon: "✅",
      label: "Telegram-доступ",
    });
  }

  if (status === "pending") {
    return buildServiceStatusLine({
      detail: "ссылка еще не создана",
      icon: "⚠️",
      label: "Telegram-доступ",
    });
  }

  if (status === "link_failed") {
    return buildServiceStatusLine({
      detail: "не удалось создать invite link",
      icon: "❌",
      label: "Telegram-доступ",
    });
  }

  if (status === "expired") {
    return buildServiceStatusLine({
      detail: "окно доступа истекло",
      icon: "❌",
      label: "Telegram-доступ",
    });
  }

  if (status === "revoked" || status === "left_channel") {
    return buildServiceStatusLine({
      detail:
        status === "left_channel" ? "пользователь вышел из канала" : "доступ отозван",
      icon: "❌",
      label: "Telegram-доступ",
    });
  }

  if (status === "not_required") {
    return buildServiceStatusLine({
      detail: "для этого offer ожидается ссылка, но статус not_required",
      icon: "❌",
      label: "Telegram-доступ",
    });
  }

  return buildServiceStatusLine({
    detail: status ? `неизвестный статус ${status}` : "статус еще не записан",
    icon: "⚠️",
    label: "Telegram-доступ",
  });
};

const getPurchaseServiceStatusLines = (paymentRecord: PaymentSheetRecord) => [
  buildServiceStatusLine({
    icon: "✅",
    label: "Таблица",
  }),
  getEmailServiceStatusLine(paymentRecord),
  getInvoiceServiceStatusLine(paymentRecord),
  getTelegramAccessServiceStatusLine(paymentRecord),
];

export const buildPurchaseAlertText = ({
  eventCreatedAtIso,
  eventId,
  eventType,
  processedAtIso,
  paymentRecord,
}: {
  eventCreatedAtIso: string;
  eventId: string;
  eventType: string;
  processedAtIso: string;
  paymentRecord: PaymentSheetRecord;
}) => {
  const checkoutLocale = getResolvedCheckoutLocale(paymentRecord.checkout_locale);
  const fullName = paymentRecord.customer_full_name.trim();
  const purchaseItem = getPurchaseItemLabel(paymentRecord);
  const amountLabel = getFormattedAmountLabel({
    amountMinor: paymentRecord.amount,
    checkoutCurrency: paymentRecord.checkout_currency || paymentRecord.currency,
    checkoutLocale,
  });
  const checkoutLanguageLabel = getCheckoutLanguageLabel(checkoutLocale);
  const lessonLanguageLabel = getLessonLanguageLabel({
    checkoutLocale,
    lessonLanguage: paymentRecord.lesson_language,
  });
  const countryLabel = getFormattedCountryLabel({
    checkoutLocale,
    customerCountry: paymentRecord.customer_country,
  });
  const accessWorkflowLabel = getAccessWorkflowLabel(paymentRecord.access_workflow);
  const lines = [
    "🛒 <b>Новая покупка</b>",
    `<b>${escapeTelegramHtml(purchaseItem || "—")}</b>`,
    `💰 ${escapeTelegramHtml(amountLabel || "—")}`,
    "",
    "📦 <b>Покупка</b>",
    ...buildAlertFieldLines([
      {
        label: "Что купили",
        value: purchaseItem,
      },
      {
        label: "Доступ",
        value: accessWorkflowLabel,
      },
      {
        label: "Сумма",
        value: amountLabel,
      },
      {
        label: "Checkout",
        value: `${checkoutLanguageLabel} (${checkoutLocale.toUpperCase()})`,
      },
      {
        label: "Материалы",
        value: lessonLanguageLabel,
      },
    ]),
    "",
    "👤 <b>Клиент</b>",
    ...buildAlertFieldLines([
      {
        label: "Email",
        value: paymentRecord.customer_email,
        valueHtml: buildEmailValueHtml(paymentRecord.customer_email),
      },
      {
        label: "ФИО",
        value: fullName,
      },
      {
        label: "Telegram",
        value: paymentRecord.customer_nickname,
        valueHtml: buildTelegramUsernameValueHtml(paymentRecord.customer_nickname),
      },
      {
        label: "Страна",
        value: countryLabel,
      },
    ]),
    "",
    "🧩 <b>Сервисы</b>",
    ...getPurchaseServiceStatusLines(paymentRecord),
    "",
    "🧾 <b>Техника</b>",
    ...buildAlertFieldLines([
      {
        label: "PaymentIntent",
        value: paymentRecord.payment_intent_id,
      },
      {
        label: "Checkout",
        value: paymentRecord.checkout_session_id,
      },
      {
        label: "Product",
        value: paymentRecord.product_id,
      },
      {
        label: "Offer",
        value: paymentRecord.offer_id,
      },
      {
        label: "Stripe Event",
        value: eventId,
      },
      {
        label: "Тип события",
        value: eventType,
      },
      {
        label: `Stripe ${UTC_TIME_ZONE_LABEL}`,
        value: eventCreatedAtIso,
      },
      {
        label: `Обработано ${UTC_TIME_ZONE_LABEL}`,
        value: processedAtIso,
      },
    ]),
  ];

  return lines.join("\n");
};
