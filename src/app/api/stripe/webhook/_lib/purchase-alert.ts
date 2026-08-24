import { normalizeCountryCode } from "@/constants/countries";
import { isOnlineGroupLibraryOfferId } from "@/constants/sellable-products";
import type { PaymentSheetRecord } from "@/lib/google-sheets";
import {
  isOnlineGroupAccessOfferId,
  isWithMentorOfferId,
} from "@/lib/telegram/offer-access";
import type { OnlineGroupAccessState } from "@/lib/telegram/online-group-access";
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
    return "Telegram-канал + куратор";
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

  if (workflow === "telegram-online-group") {
    return "Новая Online Group";
  }

  if (workflow === "telegram-renewal") {
    return "Продление Online Group";
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

type PurchaseProcessingState =
  | "attention"
  | "error"
  | "not-applicable"
  | "pending"
  | "success";

type PurchaseProcessingStatus = {
  detail?: string;
  label: string;
  state: PurchaseProcessingState;
};

const PROCESSING_STATE_ICON: Record<PurchaseProcessingState, string> = {
  attention: "⚠️",
  error: "❌",
  "not-applicable": "➖",
  pending: "⏳",
  success: "✅",
};

const buildProcessingStatusLine = ({ detail, label, state }: PurchaseProcessingStatus) =>
  `${PROCESSING_STATE_ICON[state]} ${escapeTelegramHtml(label)}${
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

const getPaymentProcessingStatus = (
  paymentRecord: PaymentSheetRecord,
): PurchaseProcessingStatus => {
  if (paymentRecord.outcome.trim() === "succeeded") {
    return {
      detail: "подтверждён Stripe",
      label: "Платёж",
      state: "success",
    };
  }

  return {
    detail: paymentRecord.outcome.trim() || "статус не подтверждён",
    label: "Платёж",
    state: "error",
  };
};

const getSaleRecordingProcessingStatus = (
  paymentRecord: PaymentSheetRecord,
): PurchaseProcessingStatus => {
  const status = paymentRecord.successful_customer_log_status.trim();

  if (status === "sent" || paymentRecord.successful_customer_logged_at.trim()) {
    return {
      detail: "завершён",
      label: "Учёт продажи",
      state: "success",
    };
  }

  if (status === "failed") {
    return {
      detail: "не завершён — проверьте Vercel Logs",
      label: "Учёт продажи",
      state: "error",
    };
  }

  if (status === "pending" || status.startsWith("pending:")) {
    return {
      detail: "ещё выполняется",
      label: "Учёт продажи",
      state: "pending",
    };
  }

  return {
    detail: status ? `неизвестный статус ${status}` : "статус не подтверждён",
    label: "Учёт продажи",
    state: "attention",
  };
};

// One classification for "the email/access job has not finished yet", shared
// with the alert schedulers so the alert can wait for a final state instead of
// reporting an in-flight one.
export const isEmailDeliveryInFlight = (paymentRecord: PaymentSheetRecord): boolean => {
  const status = paymentRecord.email_delivery_status.trim();

  return (
    status === "pending" ||
    status === "sending" ||
    status.startsWith(PAYMENT_PROCESSING_STATUS_PREFIX)
  );
};

const getEmailProcessingStatus = (
  paymentRecord: PaymentSheetRecord,
): PurchaseProcessingStatus => {
  const status = paymentRecord.email_delivery_status.trim();

  if (status === "sent") {
    return {
      detail: "отправлен",
      label: "Email",
      state: "success",
    };
  }

  if (status === "skipped") {
    return {
      detail: "пропущен — проверьте настройки Resend",
      label: "Email",
      state: "attention",
    };
  }

  if (status === "failed") {
    return {
      detail: "не отправлен — проверьте Resend и Vercel Logs",
      label: "Email",
      state: "error",
    };
  }

  if (isEmailDeliveryInFlight(paymentRecord)) {
    return {
      detail: "отправка ещё выполняется",
      label: "Email",
      state: "pending",
    };
  }

  return {
    detail: status ? `неизвестный статус ${status}` : "статус не подтверждён",
    label: "Email",
    state: "attention",
  };
};

const getInvoiceProcessingStatus = (
  paymentRecord: PaymentSheetRecord,
): PurchaseProcessingStatus => {
  const emailStatus = paymentRecord.email_delivery_status.trim();
  const hasInvoice =
    Boolean(paymentRecord.invoice_number.trim()) &&
    Boolean(paymentRecord.invoice_issued_at.trim());

  if (hasInvoice) {
    const invoiceNumber = paymentRecord.invoice_number.trim();

    if (emailStatus === "sent") {
      return {
        detail: `создан и отправлен — ${invoiceNumber}`,
        label: "Инвойс",
        state: "success",
      };
    }

    if (
      emailStatus === "pending" ||
      emailStatus === "sending" ||
      emailStatus.startsWith(PAYMENT_PROCESSING_STATUS_PREFIX)
    ) {
      return {
        detail: `создан, ожидает отправки — ${invoiceNumber}`,
        label: "Инвойс",
        state: "pending",
      };
    }

    return {
      detail: `создан, но не отправлен — ${invoiceNumber}`,
      label: "Инвойс",
      state: "attention",
    };
  }

  if (paymentRecord.invoice_number.trim()) {
    return {
      detail: `${paymentRecord.invoice_number.trim()} — дата выпуска не записана`,
      label: "Инвойс",
      state: "attention",
    };
  }

  if (
    emailStatus === "pending" ||
    emailStatus === "sending" ||
    emailStatus.startsWith(PAYMENT_PROCESSING_STATUS_PREFIX)
  ) {
    return {
      detail: "ожидает завершения email-цепочки",
      label: "Инвойс",
      state: "pending",
    };
  }

  return {
    detail: "не создан — проверьте email-цепочку и Vercel Logs",
    label: "Инвойс",
    state: "error",
  };
};

const getAccessProcessingStatus = ({
  expected,
  label,
  missingDetail = "статус не подтверждён",
  missingState = "attention",
  status,
}: {
  expected: boolean;
  label: string;
  missingDetail?: string;
  missingState?: "attention" | "error";
  status: string;
}): PurchaseProcessingStatus => {
  if (!expected && (!status || status === "not_required")) {
    return { detail: "не требуется", label, state: "not-applicable" };
  }

  if (status === "token_issued") {
    return { detail: "ссылка подготовлена", label, state: "success" };
  }

  if (status === "activated") {
    return { detail: "активирован", label, state: "success" };
  }

  if (status === "manual_done") {
    return { detail: "выдан вручную", label, state: "success" };
  }

  if (status === "manual_pending") {
    return { detail: "нужно выдать вручную", label, state: "attention" };
  }

  if (status === "pending") {
    return { detail: "ещё не подготовлен", label, state: "pending" };
  }

  if (status === "link_failed") {
    return { detail: "не удалось создать invite link", label, state: "error" };
  }

  if (status === "expired") {
    return { detail: "истёк до завершения выдачи", label, state: "error" };
  }

  if (status === "revoked") {
    return { detail: "отозван", label, state: "error" };
  }

  if (status === "left_channel") {
    return { detail: "пользователь вышел", label, state: "error" };
  }

  if (status === "not_required") {
    return {
      detail: "ожидался, но отмечен как not_required",
      label,
      state: "error",
    };
  }

  return {
    detail: status ? `неизвестный статус ${status}` : missingDetail,
    label,
    state: expected ? missingState : "attention",
  };
};

const getStandardAccessLabel = (paymentRecord: PaymentSheetRecord) => {
  const workflow = paymentRecord.access_workflow.trim();

  if (workflow === "telegram-channel" || workflow === "with-mentor") {
    return "Telegram-канал";
  }

  if (workflow === "telegram-chat") {
    return "Telegram-чат";
  }

  if (workflow === "telegram-bot") {
    return "Telegram-бот";
  }

  if (workflow === "online-group" || workflow === "telegram-online-group") {
    return "Online Group";
  }

  if (workflow === "online-live") {
    return "Онлайн-доступ";
  }

  return paymentRecord.delivery_channel.trim() === "telegram"
    ? "Telegram-доступ"
    : "Доступ";
};

const getOnlineGroupAccessProcessingStatuses = ({
  onlineGroupAccessStates,
  paymentRecord,
}: {
  onlineGroupAccessStates: OnlineGroupAccessState[] | null | undefined;
  paymentRecord: PaymentSheetRecord;
}): PurchaseProcessingStatus[] => {
  const expectsInspirationHub = isOnlineGroupLibraryOfferId(paymentRecord.offer_id);

  if (onlineGroupAccessStates === null || onlineGroupAccessStates === undefined) {
    const fallbackStatuses = [
      getAccessProcessingStatus({
        expected: true,
        label: "Online Group",
        status: paymentRecord.telegram_access_status.trim(),
      }),
    ];

    if (expectsInspirationHub) {
      fallbackStatuses.push({
        detail: "статус не удалось проверить",
        label: "Inspiration Hub",
        state: "attention",
      });
    }

    return fallbackStatuses;
  }

  const accessStatusByKey = new Map(
    onlineGroupAccessStates.map((access) => [access.accessKey, access.status]),
  );
  const statuses = [
    getAccessProcessingStatus({
      expected: true,
      label: "Online Group",
      missingDetail: "запись доступа не создана",
      missingState: "error",
      status: accessStatusByKey.get("main-group") ?? "",
    }),
  ];

  if (expectsInspirationHub || accessStatusByKey.has("inspiration-hub")) {
    statuses.push(
      getAccessProcessingStatus({
        expected: true,
        label: "Inspiration Hub",
        missingDetail: "запись доступа не создана",
        missingState: "error",
        status: accessStatusByKey.get("inspiration-hub") ?? "",
      }),
    );
  }

  return statuses;
};

const getAccessProcessingStatuses = ({
  onlineGroupAccessStates,
  paymentRecord,
}: {
  onlineGroupAccessStates: OnlineGroupAccessState[] | null | undefined;
  paymentRecord: PaymentSheetRecord;
}): PurchaseProcessingStatus[] => {
  if (isOnlineGroupAccessOfferId(paymentRecord.offer_id)) {
    return getOnlineGroupAccessProcessingStatuses({
      onlineGroupAccessStates,
      paymentRecord,
    });
  }

  const workflow = paymentRecord.access_workflow.trim();

  if (workflow === "manual-admin") {
    return [
      {
        detail:
          paymentRecord.telegram_access_status.trim() === "manual_done"
            ? "выдан вручную"
            : "нужно выдать вручную",
        label: "Доступ",
        state:
          paymentRecord.telegram_access_status.trim() === "manual_done"
            ? "success"
            : "attention",
      },
    ];
  }

  const expectsAccess =
    paymentRecord.delivery_channel.trim() === "telegram" ||
    workflow.startsWith("telegram") ||
    workflow === "with-mentor" ||
    workflow === "online-group" ||
    workflow === "online-live";
  const statuses = [
    getAccessProcessingStatus({
      expected: expectsAccess,
      label: getStandardAccessLabel(paymentRecord),
      status: paymentRecord.telegram_access_status.trim(),
    }),
  ];

  if (isWithMentorOfferId(paymentRecord.offer_id)) {
    statuses.push({
      detail: "нужно связаться с клиентом",
      label: "Куратор",
      state: "attention",
    });
  }

  return statuses;
};

const getProcessingSummaryStatus = (
  statuses: PurchaseProcessingStatus[],
): PurchaseProcessingStatus => {
  if (statuses.some((status) => status.state === "error")) {
    return {
      detail: "требуется проверка",
      label: "Обработка с ошибками",
      state: "error",
    };
  }

  if (statuses.some((status) => status.state === "attention")) {
    return {
      detail: "требуется действие или проверка",
      label: "Требуется внимание",
      state: "attention",
    };
  }

  if (statuses.some((status) => status.state === "pending")) {
    return {
      detail: "не все этапы завершены",
      label: "Обработка продолжается",
      state: "pending",
    };
  }

  return {
    label: "Все этапы выполнены",
    state: "success",
  };
};

const getPurchaseProcessingStatusLines = ({
  onlineGroupAccessStates,
  paymentRecord,
}: {
  onlineGroupAccessStates: OnlineGroupAccessState[] | null | undefined;
  paymentRecord: PaymentSheetRecord;
}) => {
  const statuses = [
    getPaymentProcessingStatus(paymentRecord),
    getSaleRecordingProcessingStatus(paymentRecord),
    getInvoiceProcessingStatus(paymentRecord),
    getEmailProcessingStatus(paymentRecord),
    ...getAccessProcessingStatuses({
      onlineGroupAccessStates,
      paymentRecord,
    }),
  ];

  return [getProcessingSummaryStatus(statuses), ...statuses].map(
    buildProcessingStatusLine,
  );
};

export const buildPurchaseAlertText = ({
  eventCreatedAtIso,
  eventId,
  eventType,
  hasClosedSales,
  onlineGroupAccessStates,
  processedAtIso,
  paymentRecord,
}: {
  eventCreatedAtIso: string;
  eventId: string;
  eventType: string;
  hasClosedSales?: boolean;
  onlineGroupAccessStates?: OnlineGroupAccessState[] | null;
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
    // Sales were closed for this product when the payment settled: the buyer
    // still gets access, this only makes sure the sale cannot pass unnoticed.
    ...(hasClosedSales
      ? [
          "⚠️ <b>Продажи этого продукта выключены</b>",
          "Оплата прошла уже после закрытия продаж. Доступ выдан — проверь покупку.",
          "",
        ]
      : []),
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
    "⚙️ <b>Обработка покупки</b>",
    ...getPurchaseProcessingStatusLines({
      onlineGroupAccessStates,
      paymentRecord,
    }),
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
