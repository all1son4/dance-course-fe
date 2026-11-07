import { normalizeCountryCode } from "@/constants/countries";
import { DEFAULT_SITE_HOME_URL } from "@/constants/links";
import { formatPrice, isOnlineGroupLibraryOfferId } from "@/constants/sellable-products";
import type { PaymentRecordSnapshot } from "@/lib/payment-record";
import {
  formatPurchaseLine,
  getAdminPurchaseLine,
  getLocalizedOfferMetadataByOfferId,
} from "@/lib/sellable-products-localization";
import {
  getOfferAccessDurationDaysByOfferId,
  isOnlineGroupAccessOfferId,
  isWithMentorOfferId,
} from "@/lib/telegram/offer-access";
import type { OnlineGroupAccessState } from "@/lib/telegram/online-group-access";
import { UTC_TIME_ZONE_LABEL } from "@/lib/time";

import {
  getResolvedCheckoutLessonLanguage,
  getResolvedCheckoutLocale,
} from "../../payment-intent/lib";

const SITE_HOME_URL =
  process.env.SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  DEFAULT_SITE_HOME_URL;
const STRIPE_DASHBOARD_URL = "https://dashboard.stripe.com";
// A leased side effect is stored as "<status>:<lease token>", so the bare and
// the leased spelling of the same status mean the same thing.
const IN_FLIGHT_SIDE_EFFECT_STATUSES = ["pending", "sending"] as const;
// The alert is for the admin, so it is Russian whatever language the buyer used.
const SITE_LANGUAGE_BY_LOCALE = {
  en: "на английском",
  pl: "на польском",
  ru: "на русском",
} as const;
const MATERIALS_LANGUAGE_BY_LANGUAGE = {
  en: "на английском",
  ru: "на русском",
} as const;

const escapeTelegramHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const escapeTelegramHtmlAttribute = (value: string) =>
  escapeTelegramHtml(value).replaceAll('"', "&quot;");

const collapseWhitespace = (value: string) => value.trim().replace(/\s+/gu, " ");

/** Monospace, which Telegram copies on tap. */
const codeHtml = (value: string) => {
  const normalizedValue = collapseWhitespace(value);

  return normalizedValue ? `<code>${escapeTelegramHtml(normalizedValue)}</code>` : "—";
};

const getFormattedAmountLabel = ({
  amountMinor,
  checkoutCurrency,
}: {
  amountMinor: string;
  checkoutCurrency: string;
}) => {
  const parsedAmountMinor = Number.parseInt(amountMinor, 10);
  const normalizedCurrency = checkoutCurrency.trim().toLowerCase();

  if (!Number.isFinite(parsedAmountMinor) || !normalizedCurrency) {
    return [amountMinor.trim(), normalizedCurrency.toUpperCase()]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  const amount = parsedAmountMinor / 100;

  // Whole amounts are written the way the site writes prices: "65 PLN", "15 €".
  if (
    Number.isInteger(amount) &&
    (normalizedCurrency === "pln" || normalizedCurrency === "eur")
  ) {
    return formatPrice(amount, normalizedCurrency);
  }

  try {
    return new Intl.NumberFormat("ru-RU", {
      currency: normalizedCurrency.toUpperCase(),
      style: "currency",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${normalizedCurrency.toUpperCase()}`;
  }
};

/** Always the canonical Russian name; the stored line covers offers the code does not know. */
const getPurchaseItemLabel = (paymentRecord: PaymentRecordSnapshot) =>
  collapseWhitespace(
    getAdminPurchaseLine(paymentRecord.offer_id) ||
      paymentRecord.purchase_item ||
      formatPurchaseLine(paymentRecord.product_title, paymentRecord.offer_label),
  );

/** The lesson language is only ever chosen for choreo products, so an empty
 * value means the buyer made no such choice and that part is left out rather
 * than filled with a default. */
const getLanguageLine = ({
  checkoutLocale,
  lessonLanguage,
}: {
  checkoutLocale: "en" | "pl" | "ru";
  lessonLanguage: string;
}) => {
  const siteLanguage = `Сайт ${SITE_LANGUAGE_BY_LOCALE[checkoutLocale]}`;
  const normalizedLessonLanguage = lessonLanguage.trim();

  if (!normalizedLessonLanguage) {
    return siteLanguage;
  }

  const materialsLanguage =
    MATERIALS_LANGUAGE_BY_LANGUAGE[
      getResolvedCheckoutLessonLanguage(normalizedLessonLanguage)
    ];

  return `${siteLanguage} · материалы ${materialsLanguage}`;
};

const getRussianPlural = (count: number, [one, few, many]: [string, string, string]) => {
  const lastTwoDigits = Math.abs(count) % 100;
  const lastDigit = lastTwoDigits % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return many;
  }

  if (lastDigit === 1) {
    return one;
  }

  return lastDigit >= 2 && lastDigit <= 4 ? few : many;
};

/** In days, the way the site and the purchase email state the term. */
const getAccessDurationLabel = (offerId: string) => {
  const durationDays = getOfferAccessDurationDaysByOfferId(offerId);

  if (!durationDays || durationDays <= 0) {
    return "";
  }

  return `${durationDays} ${getRussianPlural(durationDays, ["день", "дня", "дней"])}`;
};

const getFormattedCountryLabel = (customerCountry: string) => {
  const normalizedCountryCode = normalizeCountryCode(customerCountry);

  if (!normalizedCountryCode) {
    return customerCountry.trim();
  }

  if (typeof Intl.DisplayNames !== "function") {
    return normalizedCountryCode;
  }

  try {
    const displayName = new Intl.DisplayNames(["ru-RU"], { type: "region" }).of(
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

  if (workflow === "telegram-channel-lifetime") {
    return "Telegram-канал навсегда";
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

  if (workflow === "manual-admin") {
    return "Ручное добавление админом";
  }

  if (workflow === "private-lesson") {
    return "Индивидуальное занятие";
  }

  return workflow || "—";
};

const getAccessFieldValue = (paymentRecord: PaymentRecordSnapshot) => {
  const workflow = paymentRecord.access_workflow.trim();
  const workflowLabel = getAccessWorkflowLabel(workflow);

  // The lesson length is the only tariff of a private lesson, so the purchase
  // line leaves it out and it is stated here.
  if (workflow === "private-lesson") {
    const lessonLength =
      getLocalizedOfferMetadataByOfferId(paymentRecord.offer_id, "ru")?.offerLabel ||
      paymentRecord.offer_label.trim();

    return lessonLength ? `${workflowLabel}, ${lessonLength}` : workflowLabel;
  }

  const durationLabel = getAccessDurationLabel(paymentRecord.offer_id);

  return durationLabel ? `${workflowLabel}, ${durationLabel} после входа` : workflowLabel;
};

type PurchaseProcessingState =
  "attention" | "error" | "not-applicable" | "pending" | "success";

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

// Problems first, so the line that needs action is read first.
const PROCESSING_STATE_ORDER: Record<PurchaseProcessingState, number> = {
  error: 0,
  attention: 1,
  pending: 2,
  success: 3,
  "not-applicable": 4,
};

const PROCESSING_SUMMARY_LABEL: Record<PurchaseProcessingState, string> = {
  attention: "Требует внимания",
  error: "Ошибка",
  "not-applicable": "Всё выполнено",
  pending: "В процессе",
  success: "Всё выполнено",
};

const formatProcessingStatus = ({ detail, label }: PurchaseProcessingStatus) =>
  detail ? `${label}: ${detail}` : label;

const buildProcessingStatusLine = (status: PurchaseProcessingStatus) =>
  `${PROCESSING_STATE_ICON[status.state]} ${escapeTelegramHtml(formatProcessingStatus(status))}`;

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
  paymentRecord: PaymentRecordSnapshot,
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

// One classification for "the email/access job has not finished yet", shared
// with the alert schedulers so the alert can wait for a final state instead of
// reporting an in-flight one.
export const isEmailDeliveryInFlight = (
  paymentRecord: PaymentRecordSnapshot,
): boolean => {
  const status = paymentRecord.email_delivery_status.trim();

  return IN_FLIGHT_SIDE_EFFECT_STATUSES.some(
    (inFlightStatus) =>
      status === inFlightStatus || status.startsWith(`${inFlightStatus}:`),
  );
};

const getEmailProcessingStatus = (
  paymentRecord: PaymentRecordSnapshot,
): PurchaseProcessingStatus => {
  const status = paymentRecord.email_delivery_status.trim();

  if (status === "sent") {
    return {
      detail: "отправлено",
      label: "Письмо",
      state: "success",
    };
  }

  if (status === "skipped") {
    return {
      detail: "пропущено, проверь настройки Resend",
      label: "Письмо",
      state: "attention",
    };
  }

  if (status === "failed") {
    return {
      detail: "не отправлено, проверь Resend и Vercel Logs",
      label: "Письмо",
      state: "error",
    };
  }

  if (isEmailDeliveryInFlight(paymentRecord)) {
    return {
      detail: "отправка ещё идёт",
      label: "Письмо",
      state: "pending",
    };
  }

  return {
    detail: status ? `неизвестный статус ${status}` : "статус не подтверждён",
    label: "Письмо",
    state: "attention",
  };
};

const getInvoiceProcessingStatus = (
  paymentRecord: PaymentRecordSnapshot,
): PurchaseProcessingStatus => {
  const emailStatus = paymentRecord.email_delivery_status.trim();
  const invoiceNumber = paymentRecord.invoice_number.trim();
  const hasInvoice =
    Boolean(invoiceNumber) && Boolean(paymentRecord.invoice_issued_at.trim());

  if (hasInvoice) {
    if (emailStatus === "sent") {
      return {
        detail: `${invoiceNumber} отправлен`,
        label: "Инвойс",
        state: "success",
      };
    }

    if (isEmailDeliveryInFlight(paymentRecord)) {
      return {
        detail: `${invoiceNumber} ждёт отправки`,
        label: "Инвойс",
        state: "pending",
      };
    }

    return {
      detail: `${invoiceNumber} создан, но не отправлен`,
      label: "Инвойс",
      state: "attention",
    };
  }

  if (invoiceNumber) {
    return {
      detail: `${invoiceNumber}, дата выпуска не записана`,
      label: "Инвойс",
      state: "attention",
    };
  }

  if (isEmailDeliveryInFlight(paymentRecord)) {
    return {
      detail: "ждёт отправки письма",
      label: "Инвойс",
      state: "pending",
    };
  }

  return {
    detail: "не создан, проверь отправку письма и Vercel Logs",
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
    return { detail: "не удалось создать ссылку-приглашение", label, state: "error" };
  }

  if (status === "expired") {
    return { detail: "истёк до завершения выдачи", label, state: "error" };
  }

  if (status === "revoked") {
    return { detail: "отозван", label, state: "error" };
  }

  if (status === "left_channel") {
    return { detail: "покупательница вышла", label, state: "error" };
  }

  if (status === "not_required") {
    return {
      detail: "ожидался, но помечен как ненужный",
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

const getStandardAccessLabel = (paymentRecord: PaymentRecordSnapshot) => {
  const workflow = paymentRecord.access_workflow.trim();

  if (
    workflow === "telegram-channel" ||
    workflow === "telegram-channel-lifetime" ||
    workflow === "with-mentor"
  ) {
    return "Telegram-канал";
  }

  if (workflow === "telegram-chat") {
    return "Telegram-чат";
  }

  if (workflow === "telegram-bot") {
    return "Telegram-бот";
  }

  if (workflow === "telegram-online-group") {
    return "Online Group";
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
  paymentRecord: PaymentRecordSnapshot;
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
  paymentRecord: PaymentRecordSnapshot;
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

  // A private lesson has nothing to hand over automatically, and the booking
  // may have been agreed either before or after the payment. The alert states
  // what is known - the time lives outside the system - instead of guessing.
  if (workflow === "private-lesson") {
    return [
      {
        detail: "время согласуется вручную",
        label: "Занятие",
        state: "attention",
      },
    ];
  }

  const expectsAccess =
    paymentRecord.delivery_channel.trim() === "telegram" ||
    workflow.startsWith("telegram") ||
    workflow === "with-mentor";
  const statuses = [
    getAccessProcessingStatus({
      expected: expectsAccess,
      label: getStandardAccessLabel(paymentRecord),
      status: paymentRecord.telegram_access_status.trim(),
    }),
  ];

  if (isWithMentorOfferId(paymentRecord.offer_id)) {
    statuses.push({
      detail: "нужно связаться с покупательницей",
      label: "Куратор",
      state: "attention",
    });
  }

  return statuses;
};

const getWorstProcessingState = (
  statuses: PurchaseProcessingStatus[],
): PurchaseProcessingState =>
  statuses.reduce<PurchaseProcessingState>(
    (worst, status) =>
      PROCESSING_STATE_ORDER[status.state] < PROCESSING_STATE_ORDER[worst]
        ? status.state
        : worst,
    "success",
  );

/** The second line: the overall state and, when something is open, what exactly. */
const getProcessingSummaryLine = ({
  hasClosedSales,
  state,
  statuses,
}: {
  hasClosedSales: boolean;
  state: PurchaseProcessingState;
  statuses: PurchaseProcessingStatus[];
}) => {
  const openItems =
    state === "success" || state === "not-applicable"
      ? []
      : statuses.filter((status) => status.state === state).map(formatProcessingStatus);

  return [
    PROCESSING_SUMMARY_LABEL[state],
    ...openItems,
    ...(hasClosedSales ? ["продажи были закрыты"] : []),
  ].join(" · ");
};

/** "07.11.2026 14:32:05 UTC"; the raw value when it is not a date. */
const formatUtcTimestamp = (isoValue: string) => {
  const date = new Date(isoValue);

  if (!isoValue.trim() || Number.isNaN(date.getTime())) {
    return isoValue.trim() || "—";
  }

  const pad = (value: number) => String(value).padStart(2, "0");

  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()} ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} ${UTC_TIME_ZONE_LABEL}`;
};

const buildCatalogueIdLine = (label: string, code: string, id: string) =>
  `${label} ${code ? `${escapeTelegramHtml(code)} · ` : ""}${codeHtml(id)}`;

/** Inline keyboard for the alert: the two places an operator actually goes when
 * a purchase needs a second look. */
export const buildPurchaseAlertReplyMarkup = ({
  isLiveMode,
  paymentIntentId,
}: {
  isLiveMode: boolean;
  paymentIntentId: string;
}) => {
  const normalizedPaymentIntentId = paymentIntentId.trim();

  if (!normalizedPaymentIntentId) {
    return undefined;
  }

  const stripePath = isLiveMode ? "payments" : "test/payments";

  return {
    inline_keyboard: [
      [
        {
          text: "Stripe",
          url: `${STRIPE_DASHBOARD_URL}/${stripePath}/${encodeURIComponent(normalizedPaymentIntentId)}`,
        },
        {
          text: "Админка",
          url: `${SITE_HOME_URL}/admin?view=purchases&q=${encodeURIComponent(normalizedPaymentIntentId)}`,
        },
      ],
    ],
  };
};

/**
 * The first line is what a phone shows in the notification: state, amount and
 * what was bought. The technical block is collapsed; Telegram expands it on tap.
 */
export const buildPurchaseAlertText = ({
  eventCreatedAtIso,
  eventId,
  eventType,
  hasClosedSales = false,
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
  paymentRecord: PaymentRecordSnapshot;
}) => {
  const checkoutLocale = getResolvedCheckoutLocale(paymentRecord.checkout_locale);
  const amountLabel = getFormattedAmountLabel({
    amountMinor: paymentRecord.amount,
    checkoutCurrency: paymentRecord.checkout_currency || paymentRecord.currency,
  });
  const countryLabel = getFormattedCountryLabel(paymentRecord.customer_country);
  const fullName = collapseWhitespace(paymentRecord.customer_full_name);
  const catalogueMetadata = getLocalizedOfferMetadataByOfferId(
    paymentRecord.offer_id,
    "ru",
  );
  const statuses = [
    getPaymentProcessingStatus(paymentRecord),
    getInvoiceProcessingStatus(paymentRecord),
    getEmailProcessingStatus(paymentRecord),
    ...getAccessProcessingStatuses({
      onlineGroupAccessStates,
      paymentRecord,
    }),
  ];
  const processingState = getWorstProcessingState(statuses);
  // A sale after sales were closed always asks for a look, even when every
  // step went through.
  const headerState =
    hasClosedSales && processingState === "success" ? "attention" : processingState;
  const headline =
    [amountLabel, getPurchaseItemLabel(paymentRecord)].filter(Boolean).join(" · ") || "—";
  const customerLine = [
    fullName ? `<b>${escapeTelegramHtml(fullName)}</b>` : "—",
    ...(countryLabel ? [escapeTelegramHtml(countryLabel)] : []),
  ].join(" · ");
  const statusLines = statuses
    .filter((status) => status.state !== "not-applicable")
    .sort(
      (left, right) =>
        PROCESSING_STATE_ORDER[left.state] - PROCESSING_STATE_ORDER[right.state],
    )
    .map(buildProcessingStatusLine);
  const technicalBlock = [
    "<blockquote expandable><b>🧾 Техника</b>",
    `PaymentIntent ${codeHtml(paymentRecord.payment_intent_id)}`,
    `Checkout ${codeHtml(paymentRecord.checkout_session_id)}`,
    buildCatalogueIdLine(
      "Продукт",
      catalogueMetadata?.productCode ?? "",
      paymentRecord.product_id,
    ),
    buildCatalogueIdLine(
      "Тариф",
      catalogueMetadata?.offerCode ?? "",
      paymentRecord.offer_id,
    ),
    `Событие ${codeHtml(eventId)} · ${escapeTelegramHtml(eventType || "—")}`,
    `Stripe ${escapeTelegramHtml(formatUtcTimestamp(eventCreatedAtIso))}`,
    `Обработано ${escapeTelegramHtml(formatUtcTimestamp(processedAtIso))}</blockquote>`,
  ].join("\n");

  return [
    `<b>${PROCESSING_STATE_ICON[headerState]} ${escapeTelegramHtml(headline)}</b>`,
    `<i>${escapeTelegramHtml(
      getProcessingSummaryLine({ hasClosedSales, state: processingState, statuses }),
    )}</i>`,
    ...(hasClosedSales
      ? [
          "",
          "⛔ <b>Оплата прошла после закрытия продаж.</b> Доступ выдан, проверь покупку.",
        ]
      : []),
    "",
    `🔑 ${escapeTelegramHtml(getAccessFieldValue(paymentRecord))}`,
    `🌐 ${escapeTelegramHtml(
      getLanguageLine({ checkoutLocale, lessonLanguage: paymentRecord.lesson_language }),
    )}`,
    "",
    `👤 ${customerLine}`,
    `✉️ ${codeHtml(paymentRecord.customer_email.toLowerCase())}`,
    `💬 ${buildTelegramUsernameValueHtml(paymentRecord.customer_nickname)}`,
    "",
    ...statusLines,
    "",
    technicalBlock,
  ].join("\n");
};
